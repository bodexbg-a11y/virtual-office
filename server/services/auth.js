const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1111';
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'bodex-auth-secret';
const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 1000 * 60 * 60 * 24 * 30); // 30 days

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadEncoded) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(payloadEncoded).digest('base64url');
}

function createAdminToken() {
  const payload = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payloadEncoded = base64url(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

function parseToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) return null;

  const expected = sign(payloadEncoded);
  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
    if (!payload || payload.role !== 'admin') return null;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getRoleFromRequest(req) {
  const token = req.headers['x-admin-token'];
  const payload = parseToken(token);
  if (!payload) return 'worker';
  return payload.role;
}

function requireAdmin(req, res, next) {
  if (getRoleFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function login(password) {
  if (String(password) !== ADMIN_PASSWORD) return null;
  return createAdminToken();
}

function logout(token) {
  return Boolean(token);
}

module.exports = {
  getRoleFromRequest,
  login,
  logout,
  requireAdmin,
};
