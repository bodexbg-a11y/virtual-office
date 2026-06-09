const express = require('express');
const gmailService = require('../services/gmail');
const auth = require('../services/auth');

const router = express.Router();

router.get('/status', auth.requireAdmin, async (req, res) => {
  try {
    res.json(await gmailService.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/configure', auth.requireAdmin, async (req, res) => {
  try {
    await gmailService.configure({
      clientId: req.body.client_id,
      clientSecret: req.body.client_secret,
      redirectUri: req.body.redirect_uri,
    });
    res.json(await gmailService.getStatus());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/connect', auth.requireAdmin, async (req, res) => {
  try {
    const url = await gmailService.createAuthUrl(req.body.email);
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/oauth/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://virtual-office-bodexbg.vercel.app';
  try {
    const email = await gmailService.completeAuth(req.query.code, req.query.state);
    res.redirect(`${frontendUrl}/?gmail=connected&email=${encodeURIComponent(email)}`);
  } catch (err) {
    res.redirect(`${frontendUrl}/?gmail=error&message=${encodeURIComponent(err.message)}`);
  }
});

router.delete('/accounts/:email', auth.requireAdmin, async (req, res) => {
  try {
    await gmailService.disconnect(req.params.email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send', auth.requireAdmin, async (req, res) => {
  try {
    const result = await gmailService.send({
      sender: req.body.sender,
      to: Array.isArray(req.body.to) ? req.body.to : [],
      bcc: Array.isArray(req.body.bcc) ? req.body.bcc : [],
      subject: req.body.subject,
      body: req.body.body,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
