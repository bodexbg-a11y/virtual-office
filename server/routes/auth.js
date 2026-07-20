const express = require('express');
const router = express.Router();
const auth = require('../services/auth');
const failedCrmLogins = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

function loginAttempt(req) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const current = failedCrmLogins.get(key);
  if (!current || now - current.firstAttempt > LOGIN_BLOCK_MS) {
    return { key, count: 0, firstAttempt: now };
  }
  return { key, ...current };
}

router.post('/crm-login', (req, res) => {
  const attempt = loginAttempt(req);
  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((LOGIN_BLOCK_MS - (Date.now() - attempt.firstAttempt)) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const token = auth.loginCrm(req.body?.password);
  if (!token) {
    failedCrmLogins.set(attempt.key, {
      count: attempt.count + 1,
      firstAttempt: attempt.firstAttempt,
    });
    return res.status(401).json({ error: 'Wrong password' });
  }

  failedCrmLogins.delete(attempt.key);
  res.json({ authenticated: true, token });
});

router.get('/crm-status', auth.requireCrmSession, (req, res) => {
  res.json({ authenticated: true, expires_at: req.crmSession.exp });
});

router.post('/crm-logout', (req, res) => {
  res.json({ authenticated: false });
});

router.get('/status', auth.requireCrmSession, (req, res) => {
  res.json({ role: auth.getRoleFromRequest(req) });
});

router.post('/login', auth.requireCrmSession, (req, res) => {
  const token = auth.login(req.body?.password);
  if (!token) return res.status(401).json({ error: 'Wrong password' });
  res.json({ role: 'admin', token });
});

router.post('/logout', auth.requireCrmSession, (req, res) => {
  auth.logout(req.headers['x-admin-token']);
  res.json({ role: 'worker' });
});

module.exports = router;
