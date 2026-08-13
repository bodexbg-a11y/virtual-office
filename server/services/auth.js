const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1111';
const DEFAULT_CRM_PASSWORD_HASH = '692cbaddd44628dd240931477daad634:7301d51fcc5437f294c6ef6417f306b5917e6f72e680e675c1c4315e160db2eb324ef569961ea8320d41dd8802e45b1dc3ab33d6762211cb4a6bd530f7d04fd2';
const CRM_PASSWORD_HASH = process.env.CRM_PASSWORD_HASH || DEFAULT_CRM_PASSWORD_HASH;
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'bodex-auth-secret';
const CRM_AUTH_SECRET = process.env.CRM_AUTH_SECRET || crypto
  .createHash('sha256')
  .update(`bodex-crm:${AUTH_SECRET}:${CRM_PASSWORD_HASH}`)
  .digest('hex');
const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 1000 * 60 * 60 * 24 * 30); // 30 days
const CRM_TOKEN_TTL_MS = Number(process.env.CRM_TOKEN_TTL_MS || 1000 * 60 * 60 * 24 * 365); // 1 year

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadEncoded, secret = AUTH_SECRET) {
  return crypto.createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
}

function createToken(role, ttlMs, secret) {
  const payload = {
    role,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payloadEncoded = base64url(JSON.stringify(payload));
  const signature = sign(payloadEncoded, secret);
  return `${payloadEncoded}.${signature}`;
}

function parseToken(token, { secret = AUTH_SECRET, roles = [] } = {}) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) return null;

  const expected = sign(payloadEncoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
    if (!payload || (roles.length && !roles.includes(payload.role))) return null;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getRoleFromRequest(req) {
  const token = req.headers['x-admin-token'];
  const payload = parseToken(token, { secret: AUTH_SECRET, roles: ['admin'] });
  if (!payload) return 'worker';
  return payload.role;
}

function getCrmSession(req) {
  return parseToken(req.headers['x-crm-token'], {
    secret: CRM_AUTH_SECRET,
    roles: ['crm'],
  });
}

function requireCrm(req, res, next) {
  const publicPaths = new Set([
    '/auth/crm-login',
    '/auth/crm-status',
    '/health',
    '/gmail/oauth/callback',
    '/google-ads/webhook',
    '/website-leads/webhook',
  ]);
  if (publicPaths.has(req.path)) return next();
  if (!getCrmSession(req)) {
    return res.status(401).json({ error: 'CRM authentication required', code: 'CRM_AUTH_REQUIRED' });
  }
  next();
}

function requireCrmSession(req, res, next) {
  const session = getCrmSession(req);
  if (!session) {
    return res.status(401).json({ error: 'CRM authentication required', code: 'CRM_AUTH_REQUIRED' });
  }
  req.crmSession = session;
  next();
}

function requireAdmin(req, res, next) {
  if (getRoleFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function login(password) {
  if (String(password) !== ADMIN_PASSWORD) return null;
  return createToken('admin', TOKEN_TTL_MS, AUTH_SECRET);
}

function verifyCrmPassword(password) {
  const [salt, expectedHex] = String(CRM_PASSWORD_HASH).split(':');
  if (!salt || !expectedHex) return false;
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = crypto.scryptSync(String(password || ''), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function loginCrm(password) {
  if (!verifyCrmPassword(password)) return null;
  return createToken('crm', CRM_TOKEN_TTL_MS, CRM_AUTH_SECRET);
}

function renewCrmSession() {
  const token = createToken('crm', CRM_TOKEN_TTL_MS, CRM_AUTH_SECRET);
  const session = parseToken(token, { secret: CRM_AUTH_SECRET, roles: ['crm'] });
  return { token, expiresAt: session.exp };
}

function logout(token) {
  return Boolean(token);
}

module.exports = {
  getRoleFromRequest,
  getCrmSession,
  login,
  loginCrm,
  renewCrmSession,
  logout,
  requireAdmin,
  requireCrm,
  requireCrmSession,
};
