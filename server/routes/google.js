const express = require('express');
const router = express.Router();
const googleSheets = require('../services/googleSheets');

// GET Google Sheets connection status
router.get('/status', async (req, res) => {
  try {
    res.json(googleSheets.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST test Google Sheets connection
router.post('/test', async (req, res) => {
  try {
    if (!googleSheets.initialized) {
      await googleSheets.init();
    }
    if (!googleSheets.initialized) {
      return res.status(400).json({
        ok: false,
        error: googleSheets.lastError || 'Google Sheets credentials are not configured',
      });
    }
    const result = await googleSheets.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST create/repair required worksheet tabs and headers
router.post('/setup', async (req, res) => {
  res.status(410).json({ error: 'Google Sheets is read-only for this app. Data is stored in Neon DB.' });
});

// POST push leads to Google Sheets
router.post('/push/leads', async (req, res) => {
  res.status(410).json({ error: 'Writing leads to Google Sheets is disabled. Use Neon DB as the source of truth.' });
});

// POST push products to Google Sheets
router.post('/push/products', async (req, res) => {
  res.status(410).json({ error: 'Writing products to Google Sheets is disabled. Use Neon DB as the source of truth.' });
});

// POST push stats to Google Sheets
router.post('/push/stats', async (req, res) => {
  res.status(410).json({ error: 'Writing stats to Google Sheets is disabled. Use Neon DB as the source of truth.' });
});

// POST push all data
router.post('/push/all', async (req, res) => {
  res.status(410).json({ error: 'Writing app data to Google Sheets is disabled. Google Sheets is an input source only.' });
});

// POST pull leads from Google Sheets
router.post('/pull/leads', async (req, res) => {
  res.status(410).json({ error: 'Legacy Leads sheet import is disabled. Use operational sheets: МАТЕРИАЛЫ and УСЛУГИ.' });
});

// POST pull operational sheets (УСЛУГИ, МАТЕРИАЛЫ, ПРОЕКТЫ, b2b)
router.post('/pull/business', async (req, res) => {
  try {
    const result = await googleSheets.pullBusinessSheets();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET structured clients imported from operational sheets
router.get('/clients', async (req, res) => {
  try {
    const result = await googleSheets.getBusinessClients(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET actionable recommendations based on current sheet data
router.get('/recommendations', async (req, res) => {
  try {
    const result = await googleSheets.getTodayRecommendations();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET sync history
router.get('/history', async (req, res) => {
  try {
    const rows = await googleSheets.getSyncHistory();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
