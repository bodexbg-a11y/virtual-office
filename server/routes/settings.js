const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const googleSheets = require('../services/googleSheets');
const facebookAds = require('../services/facebookAds');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

// GET current settings (masked secrets)
router.get('/', (req, res) => {
  try {
    const env = parseEnv();
    res.json({
      google: {
        configured: !!(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.GOOGLE_SPREADSHEET_ID),
        connected: googleSheets.initialized,
        email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
        spreadsheet_id: env.GOOGLE_SPREADSHEET_ID || '',
        private_key_set: !!env.GOOGLE_PRIVATE_KEY,
        last_error: googleSheets.lastError || '',
      },
      facebook: {
        configured: !!(env.FB_ACCESS_TOKEN && env.FB_AD_ACCOUNT_ID),
        connected: facebookAds.initialized,
        app_id: env.FB_APP_ID || '',
        ad_account_id: env.FB_AD_ACCOUNT_ID || '',
        access_token_set: !!env.FB_ACCESS_TOKEN,
        app_secret_set: !!env.FB_APP_SECRET,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST save Google credentials
router.post('/google', async (req, res) => {
  try {
    const { service_account_email, private_key, spreadsheet_id } = req.body;
    const updates = {};
    if (service_account_email) updates.GOOGLE_SERVICE_ACCOUNT_EMAIL = service_account_email;
    if (private_key) updates.GOOGLE_PRIVATE_KEY = `"${private_key.replace(/\n/g, '\\n')}"`;
    if (spreadsheet_id) updates.GOOGLE_SPREADSHEET_ID = spreadsheet_id;

    saveEnv(updates);
    // Reload env into process
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config({ override: true });
    Object.assign(process.env, parseEnv());

    // Re-init service
    googleSheets.initialized = false;
    googleSheets.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    await googleSheets.init();

    res.json({ success: true, connected: googleSheets.initialized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST save Facebook credentials
router.post('/facebook', async (req, res) => {
  try {
    const { app_id, app_secret, access_token, ad_account_id } = req.body;
    const updates = {};
    if (app_id) updates.FB_APP_ID = app_id;
    if (app_secret) updates.FB_APP_SECRET = app_secret;
    if (access_token) updates.FB_ACCESS_TOKEN = access_token;
    if (ad_account_id) {
      // Auto-prepend 'act_' if missing
      updates.FB_AD_ACCOUNT_ID = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`;
    }

    saveEnv(updates);
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config({ override: true });
    Object.assign(process.env, parseEnv());

    // Re-init service
    facebookAds.accessToken = process.env.FB_ACCESS_TOKEN;
    facebookAds.adAccountId = process.env.FB_AD_ACCOUNT_ID;
    facebookAds.initialized = false;
    facebookAds.init();

    res.json({ success: true, connected: facebookAds.initialized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST test Google connection
router.post('/google/test', async (req, res) => {
  try {
    if (!googleSheets.initialized) {
      await googleSheets.init();
    }
    if (!googleSheets.initialized) {
      return res.json({
        ok: false,
        message: googleSheets.lastError || 'Не е свързано — попълнете email, private key и spreadsheet ID.',
      });
    }
    const connection = await googleSheets.testConnection();
    const setup = await googleSheets.ensureStructure();
    res.json({
      ok: true,
      message: `Връзката работи. Таблица: ${connection.title}. ${setup.createdSheets.length ? `Създадени листове: ${setup.createdSheets.join(', ')}.` : 'Листовете Leads, Products и Stats са готови.'}`,
    });
  } catch (err) {
    res.status(200).json({ ok: false, message: err.message });
  }
});

// POST test Facebook connection
router.post('/facebook/test', async (req, res) => {
  try {
    if (!facebookAds.initialized) return res.json({ ok: false, message: 'Not initialized — fill credentials first' });
    const result = await facebookAds.syncCampaigns();
    res.json({ ok: true, message: `Готово! Синхронизирано ${result.campaigns || 0} кампаний из Facebook.` });
  } catch (err) {
    const fbErr = err.response?.data?.error?.message || err.message;
    res.status(200).json({ ok: false, message: fbErr });
  }
});

// Helpers
function parseEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let val = m[2];
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\n/g, '\n');
      env[m[1]] = val;
    }
  }
  return env;
}

function saveEnv(updates) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const lines = content.split('\n');
  const seen = new Set();

  const newLines = lines.map(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (m && updates.hasOwnProperty(m[1])) {
      seen.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) newLines.push(`${k}=${v}`);
  }

  fs.writeFileSync(ENV_PATH, newLines.join('\n'));
}

module.exports = router;
