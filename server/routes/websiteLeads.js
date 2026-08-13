const express = require('express');
const router = express.Router();
const db = require('../db');

// Public endpoint for the marketing website's own form to push leads into
// the CRM. Protected by a shared secret (not a CRM session, the website has
// none) sent either as header X-Webhook-Key or body field webhook_key.
const WEBHOOK_KEY = process.env.WEBSITE_LEADS_WEBHOOK_KEY || '';

function checkKey(req) {
  const key = req.get('X-Webhook-Key') || req.body?.webhook_key || '';
  return Boolean(WEBHOOK_KEY) && key === WEBHOOK_KEY;
}

// Written to match the phrasing extractLeadAreaLabel()/isGoldLeadByArea()
// in routes/leads.js already parse out of notes, so a >=400m2 answer here
// keeps flagging as a gold lead exactly like the manual qualification flow.
function buildNotes({ area, object_type, timing, executor, message }) {
  const lines = [];
  if (area) lines.push(`Какво количество ви е необходимо: ${area}`);
  if (object_type) lines.push(`Тип обект: ${object_type}`);
  if (timing) lines.push(`Кога планирате да започнете: ${timing}`);
  if (executor) lines.push(`Кой ще изпълнява: ${executor}`);
  if (message) lines.push(message);
  return lines.join('\n');
}

router.post('/webhook', async (req, res) => {
  console.log('[Website leads webhook] POST body:', JSON.stringify(req.body));
  try {
    if (!checkKey(req)) {
      return res.status(403).json({ error: 'Invalid webhook_key' });
    }

    const b = req.body || {};
    if (!b.company_name && !b.contact_name) {
      return res.status(400).json({ error: 'company_name or contact_name is required' });
    }
    if (!b.phone && !b.email) {
      return res.status(400).json({ error: 'phone or email is required' });
    }

    const qualificationData = {};
    if (b.object_type) qualificationData.object_type = b.object_type;
    if (b.timing) qualificationData.timing = b.timing;
    if (b.executor) qualificationData.executor = b.executor;
    if (b.area) qualificationData.volumes = { total: b.area };

    const { rows } = await db.query(`
      INSERT INTO leads (
        company_name, contact_name, email, phone, city, lead_type, source,
        status, priority, notes, qualification_data
      ) VALUES (?, ?, ?, ?, ?, 'inquiry', 'website', 'new', 'medium', ?, ?::jsonb)
      RETURNING id
    `, [
      b.company_name || b.contact_name,
      b.contact_name || null,
      b.email || null,
      b.phone || null,
      b.city || null,
      buildNotes(b) || null,
      JSON.stringify(qualificationData),
    ]);

    res.status(200).json({ success: true, lead_id: rows[0].id });
  } catch (err) {
    console.error('[Website leads webhook] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
