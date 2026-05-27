const express = require('express');
const router = express.Router();
const markAgent = require('../services/markAgent');
const mariaAgent = require('../services/mariaAgent');

router.get('/mark/status', async (req, res) => {
  try {
    res.json({
      running: markAgent.isRunning(),
      latest: await markAgent.latestRun(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark/run', async (req, res) => {
  if (markAgent.isRunning()) {
    return res.status(409).json({ error: 'Mark agent is already running' });
  }

  res.status(202).json({ success: true, message: 'Mark agent started' });

  markAgent.run()
    .catch(err => console.error('[Mark Agent] error:', err.message));
});

router.get('/maria/status', async (req, res) => {
  try {
    res.json({
      running: mariaAgent.isRunning(),
      latest: await mariaAgent.latestRun(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/maria/analysis', async (req, res) => {
  try {
    res.json(await mariaAgent.getAnalysis());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maria/run', async (req, res) => {
  if (mariaAgent.isRunning()) {
    return res.status(409).json({ error: 'Maria agent is already running' });
  }

  res.status(202).json({ success: true, message: 'Maria agent started' });

  mariaAgent.run()
    .catch(err => console.error('[Maria Agent] error:', err.message));
});

module.exports = router;
