const express = require('express');
const router = express.Router();
const db = require('../db');

// Google Ads Lead Form "Webhook" delivery method posts new leads here in real
// time. No OAuth / developer token needed for this -- just a shared secret
// key configured on both sides (Google Ads UI and GOOGLE_ADS_WEBHOOK_KEY).
const WEBHOOK_KEY = process.env.GOOGLE_ADS_WEBHOOK_KEY || '';

let columnsEnsured = false;
async function ensureGoogleAdsColumns() {
  if (columnsEnsured) return;
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_ads_lead_id TEXT`);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_google_ads_lead_id
    ON leads(google_ads_lead_id)
    WHERE google_ads_lead_id IS NOT NULL
  `);
  columnsEnsured = true;
}
ensureGoogleAdsColumns().catch(err => console.error('❌ ensureGoogleAdsColumns error:', err.message));

function extractGoogleKey(payload = {}) {
  if (payload.google_key) return payload.google_key;
  if (Array.isArray(payload.leads) && payload.leads[0]?.google_key) return payload.leads[0].google_key;
  return '';
}

// Column data can arrive as user_column_data (lead form) with either
// column_id or column_name identifying each field -- match on either.
function fieldValue(columns = [], ...names) {
  const wanted = names.map(n => n.toLowerCase());
  const match = columns.find(c => {
    const id = String(c.column_id || '').toLowerCase();
    const name = String(c.column_name || '').toLowerCase();
    return wanted.includes(id) || wanted.includes(name);
  });
  return match?.string_value || match?.value || '';
}

// Google Ads sends a GET with ?google_key=... to verify the endpoint before
// letting you save the webhook URL in the UI. Must respond 200.
router.get('/webhook', (req, res) => {
  console.log('[Google Ads webhook] verification GET', req.query);
  if (!WEBHOOK_KEY || req.query.google_key !== WEBHOOK_KEY) {
    return res.status(403).send('Invalid key');
  }
  res.status(200).send('OK');
});

router.post('/webhook', async (req, res) => {
  console.log('[Google Ads webhook] POST body:', JSON.stringify(req.body));
  try {
    await ensureGoogleAdsColumns();

    const key = extractGoogleKey(req.body);
    if (!WEBHOOK_KEY || key !== WEBHOOK_KEY) {
      return res.status(403).json({ error: 'Invalid google_key' });
    }

    const leads = Array.isArray(req.body.leads) ? req.body.leads : [req.body];
    let created = 0;
    let skipped = 0;

    for (const lead of leads) {
      if (lead.is_test) { skipped += 1; continue; }

      const leadId = String(lead.lead_id || lead.gcl_id || `${key}_${Date.now()}_${created}`);
      const existing = await db.query('SELECT id FROM leads WHERE google_ads_lead_id = ?', [leadId]);
      if (existing.rows.length) { skipped += 1; continue; }

      const columns = lead.user_column_data || lead.form_data || [];
      const fullName = fieldValue(columns, 'FULL_NAME', 'Full Name', 'Name');
      const phone = fieldValue(columns, 'PHONE_NUMBER', 'Phone Number', 'Phone');
      const email = fieldValue(columns, 'EMAIL', 'Email');
      const company = fieldValue(columns, 'COMPANY_NAME', 'Company Name', 'Company');
      const notes = columns
        .map(c => `${c.column_name || c.column_id}: ${c.string_value || c.value || ''}`)
        .join('\n');

      await db.query(`
        INSERT INTO leads (
          company_name, contact_name, email, phone, lead_type, source, status,
          priority, notes, google_ads_lead_id
        ) VALUES (?, ?, ?, ?, 'inquiry', 'google_ads', 'new', 'medium', ?, ?)
      `, [
        company || fullName || 'Google Ads Lead',
        fullName || null,
        email || null,
        phone || null,
        notes || null,
        leadId,
      ]);
      created += 1;
    }

    res.status(200).json({ success: true, created, skipped });
  } catch (err) {
    console.error('[Google Ads webhook] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
