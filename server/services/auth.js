const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1111';
const tokens = new Map();

function createAdminToken() {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, { role: 'admin', createdAt: Date.now() });
  return token;
}

function getRoleFromRequest(req) {
  const token = req.headers['x-admin-token'];
  if (!token || !tokens.has(token)) return 'worker';
  return tokens.get(token).role;
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
  if (token) tokens.delete(token);
}

module.exports = {
  getRoleFromRequest,
  login,
  logout,
  requireAdmin,
};
