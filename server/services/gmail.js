const crypto = require('crypto');
const { google } = require('googleapis');
const db = require('../db');

const ALLOWED_SENDERS = ['bodexbg@gmail.com', 'vlad@bodexbg.com'];
const TOKEN_SECRET = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  || process.env.AUTH_SECRET;

function encryptionKey() {
  if (!TOKEN_SECRET) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY or AUTH_SECRET is required');
  }
  return crypto.createHash('sha256').update(TOKEN_SECRET).digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

function decrypt(value) {
  const [iv, tag, encrypted] = String(value || '').split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS gmail_oauth_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      client_id TEXT NOT NULL,
      client_secret_encrypted TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS gmail_accounts (
      email TEXT PRIMARY KEY,
      refresh_token_encrypted TEXT NOT NULL,
      connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS gmail_oauth_states (
      state TEXT PRIMARY KEY,
      expected_email TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL
    )
  `);
}

async function configure({ clientId, clientSecret, redirectUri }) {
  await ensureTables();
  const current = await getConfig();
  const secret = String(clientSecret || '').trim();
  if (!String(clientId || '').trim()) throw new Error('Google OAuth Client ID is required');
  if (!secret && !current) throw new Error('Google OAuth Client Secret is required');
  if (!String(redirectUri || '').trim()) throw new Error('OAuth redirect URI is required');

  await db.query(`
    INSERT INTO gmail_oauth_config (id, client_id, client_secret_encrypted, redirect_uri, updated_at)
    VALUES (1, ?, ?, ?, NOW())
    ON CONFLICT (id) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      client_secret_encrypted = EXCLUDED.client_secret_encrypted,
      redirect_uri = EXCLUDED.redirect_uri,
      updated_at = NOW()
  `, [
    String(clientId).trim(),
    secret ? encrypt(secret) : current.clientSecretEncrypted,
    String(redirectUri).trim(),
  ]);
}

async function getConfig() {
  await ensureTables();
  const row = await db.get('SELECT * FROM gmail_oauth_config WHERE id = 1');
  if (!row) return null;
  return {
    clientId: row.client_id,
    clientSecret: decrypt(row.client_secret_encrypted),
    clientSecretEncrypted: row.client_secret_encrypted,
    redirectUri: row.redirect_uri,
  };
}

async function oauthClient() {
  const config = await getConfig();
  if (!config) throw new Error('Gmail OAuth is not configured');
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

async function createAuthUrl(expectedEmail) {
  const email = String(expectedEmail || '').trim().toLowerCase();
  if (!ALLOWED_SENDERS.includes(email)) throw new Error('Sender is not allowed');
  const client = await oauthClient();
  const state = crypto.randomBytes(32).toString('base64url');
  await db.query('DELETE FROM gmail_oauth_states WHERE expires_at < NOW()');
  await db.query(`
    INSERT INTO gmail_oauth_states (state, expected_email, expires_at)
    VALUES (?, ?, NOW() + INTERVAL '10 minutes')
  `, [state, email]);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    state,
    login_hint: email,
  });
}

async function completeAuth(code, state) {
  await ensureTables();
  const stateRow = await db.get(`
    DELETE FROM gmail_oauth_states
    WHERE state = ? AND expires_at >= NOW()
    RETURNING expected_email
  `, [state]);
  if (!stateRow) throw new Error('OAuth session expired or invalid');

  const client = await oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const profile = await oauth2.userinfo.get();
  const actualEmail = String(profile.data.email || '').trim().toLowerCase();
  if (actualEmail !== stateRow.expected_email) {
    throw new Error(`Connected ${actualEmail || 'unknown account'}, expected ${stateRow.expected_email}`);
  }
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Revoke app access and connect again.');
  }

  await db.query(`
    INSERT INTO gmail_accounts (email, refresh_token_encrypted, connected_at, updated_at)
    VALUES (?, ?, NOW(), NOW())
    ON CONFLICT (email) DO UPDATE SET
      refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
      connected_at = NOW(),
      updated_at = NOW()
  `, [actualEmail, encrypt(tokens.refresh_token)]);
  return actualEmail;
}

async function listAccounts() {
  await ensureTables();
  const rows = await db.all('SELECT email, connected_at, updated_at FROM gmail_accounts ORDER BY email');
  return ALLOWED_SENDERS.map(email => ({
    email,
    connected: rows.some(row => row.email === email),
    connected_at: rows.find(row => row.email === email)?.connected_at || null,
  }));
}

async function disconnect(email) {
  await ensureTables();
  await db.query('DELETE FROM gmail_accounts WHERE email = ?', [String(email || '').toLowerCase()]);
}

function cleanHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function cleanEmail(value) {
  const email = cleanHeader(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(cleanHeader(subject), 'utf8').toString('base64')}?=`;
}

function buildRawMessage({ sender, to = [], bcc = [], subject, body }) {
  const headers = [
    `From: ${cleanHeader(sender)}`,
    to.length ? `To: ${to.map(cleanHeader).join(', ')}` : '',
    bcc.length ? `Bcc: ${bcc.map(cleanHeader).join(', ')}` : '',
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ].filter(Boolean);
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${String(body || '')}`, 'utf8').toString('base64url');
}

async function send({ sender, to = [], bcc = [], subject, body }) {
  const email = String(sender || '').trim().toLowerCase();
  if (!ALLOWED_SENDERS.includes(email)) throw new Error('Sender is not allowed');
  const account = await db.get('SELECT refresh_token_encrypted FROM gmail_accounts WHERE email = ?', [email]);
  if (!account) throw new Error(`${email} is not connected to Gmail`);

  const cleanTo = to.map(cleanEmail).filter(Boolean);
  const cleanBcc = bcc.map(cleanEmail).filter(Boolean);
  const recipients = [...cleanTo, ...cleanBcc];
  if (!recipients.length) throw new Error('At least one recipient is required');
  if (recipients.length > 100) throw new Error('Maximum 100 recipients per message');

  const client = await oauthClient();
  client.setCredentials({ refresh_token: decrypt(account.refresh_token_encrypted) });
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const profile = await oauth2.userinfo.get();
  const actualEmail = String(profile.data.email || '').trim().toLowerCase();
  if (actualEmail !== email) throw new Error(`OAuth account mismatch: ${actualEmail}`);

  const gmail = google.gmail({ version: 'v1', auth: client });
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: buildRawMessage({ sender: email, to: cleanTo, bcc: cleanBcc, subject, body }),
    },
  });
  return { id: result.data.id, sender: email, recipients: recipients.length };
}

async function getStatus() {
  const config = await getConfig();
  return {
    configured: Boolean(config),
    redirect_uri: config?.redirectUri || '',
    client_id: config?.clientId || '',
    client_secret_set: Boolean(config?.clientSecret),
    accounts: await listAccounts(),
  };
}

module.exports = {
  ALLOWED_SENDERS,
  completeAuth,
  configure,
  createAuthUrl,
  disconnect,
  getStatus,
  send,
};
