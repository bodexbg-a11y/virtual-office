const express = require('express');
const router = express.Router();
const auth = require('../services/auth');

router.get('/status', (req, res) => {
  res.json({ role: auth.getRoleFromRequest(req) });
});

router.post('/login', (req, res) => {
  const token = auth.login(req.body?.password);
  if (!token) return res.status(401).json({ error: 'Wrong password' });
  res.json({ role: 'admin', token });
});

router.post('/logout', (req, res) => {
  auth.logout(req.headers['x-admin-token']);
  res.json({ role: 'worker' });
});

module.exports = router;
