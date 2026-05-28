require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const googleSheets = require('./services/googleSheets');
const facebookAds = require('./services/facebookAds');
const markAgent = require('./services/markAgent');
const steveAgent = require('./services/steveAgent');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

// API Routes
app.use('/api/leads', require('./routes/leads'));
app.use('/api/google', require('./routes/google'));
app.use('/api/facebook', require('./routes/facebook'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/offers', require('./routes/offers'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      google_sheets: googleSheets.initialized ? 'connected' : 'demo',
      facebook_ads: facebookAds.initialized ? 'connected' : 'demo',
    }
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Initialize services
async function start() {
  await googleSheets.init();
  facebookAds.init();

  // Cron: pull operational Google Sheets into Neon every 5 minutes.
  // Google Sheets is an input source only; app data and agent reports stay in DB.
  cron.schedule('*/5 * * * *', async () => {
    console.log('[CRON] Pulling business sheets...');
    try {
      await googleSheets.pullBusinessSheets();
    } catch (err) {
      console.error('[CRON] Business Sheets pull error:', err.message);
    }
  });

  // Cron: sync FB campaigns every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[CRON] Syncing Facebook Ads...');
    try {
      await facebookAds.syncCampaigns();
      await facebookAds.syncLeadForms();
    } catch (err) {
      console.error('[CRON] FB sync error:', err.message);
    }
  });

  // Cron: Mark scans material market prices twice per working day.
  cron.schedule('0 9,15 * * 1-5', async () => {
    console.log('[CRON] Running Mark market agent...');
    try {
      await markAgent.run();
    } catch (err) {
      console.error('[CRON] Mark agent error:', err.message);
    }
  }, { timezone: 'Europe/Sofia' });

  // Cron: Steve audits SEO and prepares linkbuilding recommendations twice per working day.
  cron.schedule('30 9,15 * * 1-5', async () => {
    console.log('[CRON] Running Steve SEO agent...');
    try {
      await steveAgent.run();
    } catch (err) {
      console.error('[CRON] Steve agent error:', err.message);
    }
  }, { timezone: 'Europe/Sofia' });

  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   BODEX Virtual Office                    ║
║   http://localhost:${PORT}                    ║
║                                           ║
║   Google Sheets: ${googleSheets.initialized ? '✅ Connected' : '⚠️  Demo mode'}         ║
║   Facebook Ads:  ${facebookAds.initialized ? '✅ Connected' : '⚠️  Demo mode'}         ║
╚═══════════════════════════════════════════╝
    `);
  });
}

start().catch(console.error);
