const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../services/auth');
const { generateOfferPdfBuffer } = require('../services/offerPdf');

async function ensureOfferColumns() {
  await db.exec(`
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';
  `);
}

function parseItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      product_id: item.product_id ? Number(item.product_id) : null,
      sku: String(item.sku || '').trim(),
      name: String(item.name || '').trim(),
      category: String(item.category || '').trim(),
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      currency: String(item.currency || 'EUR').trim() || 'EUR',
    }))
    .filter((item) => item.name && item.quantity > 0 && item.unit_price >= 0);
}

function calcTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
}

router.use(auth.requireAdmin);

router.get('/lead/:leadId', async (req, res) => {
  try {
    await ensureOfferColumns();
    const lead = await db.get('SELECT * FROM leads WHERE id = ?', [req.params.leadId]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { rows } = await db.query(`
      SELECT id, lead_id, offer_number, status, items, subtotal, discount_pct, total, currency, valid_until, notes, sent_at, created_at, updated_at
      FROM offers
      WHERE lead_id = ?
      ORDER BY created_at DESC
    `, [req.params.leadId]);

    res.json({
      lead,
      offers: rows.map((row) => ({
        ...row,
        items: safeParse(row.items),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureOfferColumns();
    const leadId = Number(req.body?.lead_id);
    const lead = await db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const items = parseItems(req.body?.items);
    if (!items.length) {
      return res.status(400).json({ error: 'At least one product item is required' });
    }

    const currency = String(req.body?.currency || items[0].currency || 'EUR').trim() || 'EUR';
    const subtotal = calcTotal(items);
    const discountPct = Number(req.body?.discount_pct || 0);
    const total = subtotal - subtotal * (discountPct / 100);
    const notes = String(req.body?.notes || '').trim();
    const status = String(req.body?.status || 'sent').toLowerCase() === 'draft' ? 'draft' : 'sent';
    const validUntil = req.body?.valid_until ? new Date(req.body.valid_until) : null;

    const insert = await db.run(`
      INSERT INTO offers (
        lead_id, offer_number, status, items, subtotal, discount_pct, total, currency, valid_until, notes, sent_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      RETURNING id
    `, [
      leadId,
      `KP-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`,
      status,
      JSON.stringify(items),
      subtotal,
      discountPct,
      total,
      currency,
      validUntil && !Number.isNaN(validUntil.getTime()) ? validUntil.toISOString() : null,
      notes,
      status === 'sent' ? new Date().toISOString() : null,
    ]);

    const offerId = insert.lastInsertRowid;
    const offer = await db.get(`
      SELECT id, lead_id, offer_number, status, items, subtotal, discount_pct, total, currency, valid_until, notes, sent_at, created_at, updated_at
      FROM offers
      WHERE id = ?
    `, [offerId]);

    const offerItems = safeParse(offer.items);

    if (status === 'sent' && lead.status !== 'won' && lead.status !== 'lost') {
      await db.run(`
        UPDATE leads
        SET status = 'offer_sent', updated_at = NOW()
        WHERE id = ?
      `, [leadId]);

      await db.run(`
        INSERT INTO lead_activities (lead_id, action, description, old_value, new_value, performed_by)
        VALUES (?, 'offer_created', ?, ?, 'offer_sent', 'admin')
      `, [leadId, `Commercial proposal ${offer.offer_number} generated`, lead.status]);
    }

    const pdfBuffer = await generateOfferPdfBuffer({ offer, lead: { ...lead, status: status === 'sent' ? 'offer_sent' : lead.status }, items: offerItems });
    const pdfBase64 = pdfBuffer.toString('base64');

    res.json({
      success: true,
      offer: {
        ...offer,
        items: offerItems,
      },
      pdf_base64: pdfBase64,
      pdf_filename: `${offer.offer_number}.pdf`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    await ensureOfferColumns();
    const offer = await db.get(`
      SELECT id, lead_id, offer_number, status, items, subtotal, discount_pct, total, currency, valid_until, notes, sent_at, created_at, updated_at
      FROM offers
      WHERE id = ?
    `, [req.params.id]);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    const lead = await db.get('SELECT * FROM leads WHERE id = ?', [offer.lead_id]);
    const items = safeParse(offer.items);
    const buffer = await generateOfferPdfBuffer({ offer, lead, items });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${offer.offer_number}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function safeParse(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = router;

