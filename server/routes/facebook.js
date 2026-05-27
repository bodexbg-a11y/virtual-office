const express = require('express');
const router = express.Router();
const facebookAds = require('../services/facebookAds');

// POST sync campaigns from FB
router.post('/sync/campaigns', async (req, res) => {
  try {
    const result = await facebookAds.syncCampaigns();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST sync lead forms from FB
router.post('/sync/leads', async (req, res) => {
  try {
    const result = await facebookAds.syncLeadForms();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET campaigns from DB
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await facebookAds.getCampaigns();
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET summary stats
router.get('/summary', async (req, res) => {
  try {
    const summary = await facebookAds.getSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
