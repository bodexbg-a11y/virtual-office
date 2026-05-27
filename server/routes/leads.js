const express = require('express');
const router = express.Router();
const db = require('../db');
const googleSheets = require('../services/googleSheets');

function ensureLeadSheetColumns() {
  const cols = db.raw.prepare('PRAGMA table_info(leads)').all().map(col => col.name);
  if (!cols.includes('google_sheet_name')) {
    db.raw.exec('ALTER TABLE leads ADD COLUMN google_sheet_name TEXT');
  }
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function findSheetMatchForLead(lead) {
  const phone = normalizePhone(lead.phone);
  const email = normalizeEmail(lead.email);
  if (!phone && !email) return null;

  const rows = db.raw.prepare(`
    SELECT sheet_name, row_number, company_name, contact_name, phone, email, status, action_needed, problem, interest, notes
    FROM sheet_clients
    WHERE sheet_name IN ('МАТЕРИАЛЫ', 'УСЛУГИ')
      AND (
        (? != '' AND replace(replace(replace(replace(replace(COALESCE(phone, ''), ' ', ''), '+', ''), '-', ''), '(', ''), ')', '') = ?)
        OR (? != '' AND lower(COALESCE(email, '')) = ?)
      )
    ORDER BY CASE sheet_name WHEN 'МАТЕРИАЛЫ' THEN 1 WHEN 'УСЛУГИ' THEN 2 ELSE 3 END, row_number
    LIMIT 1
  `).all(phone, phone, email, email);

  return rows[0] || null;
}

function sheetHasManagerWork(row) {
  const text = String([
    row.status,
    row.action_needed,
    row.problem,
    row.notes,
  ].filter(Boolean).join(' ')).trim();
  return text.length > 0;
}

function inferStatusFromSheet(row) {
  if (!sheetHasManagerWork(row)) return 'new';
  const text = String([
    row.status,
    row.action_needed,
    row.problem,
    row.interest,
    row.notes,
  ].filter(Boolean).join(' ')).toLowerCase().replace(/ё/g, 'е');

  if (/отказ|не\s+интерес|неинтерес|нет\s+интерес/.test(text)) return 'lost';
  if (/договор|закуп|готов/.test(text)) return 'negotiation';
  if (/коммерческ|оферт|предложен|\bкп\b/.test(text)) return 'offer_sent';
  if (/встреч|срещ|дума|цена|жд[уе]т|ответит/.test(text)) return 'negotiation';
  return 'contacted';
}

function syncFacebookLeadsWithSheets() {
  ensureLeadSheetColumns();
  const leads = db.raw.prepare("SELECT * FROM leads WHERE source = 'facebook'").all();
  let matched = 0;
  let movedFromNew = 0;
  let materials = 0;
  let services = 0;

  for (const lead of leads) {
    const match = findSheetMatchForLead(lead);
    if (!match) continue;
    matched += 1;
    if (match.sheet_name === 'МАТЕРИАЛЫ') materials += 1;
    if (match.sheet_name === 'УСЛУГИ') services += 1;

    const nextStatus = inferStatusFromSheet(match);
    const sheetNote = `Google Sheets ${match.sheet_name} row ${match.row_number}: ${[
      match.status,
      match.action_needed,
      match.problem,
    ].filter(Boolean).join(' / ')}`;
    const notes = String(lead.notes || '').includes(`Google Sheets ${match.sheet_name} row ${match.row_number}`)
      ? lead.notes
      : [lead.notes, sheetNote].filter(Boolean).join(' | ');
    const interest = match.sheet_name === 'МАТЕРИАЛЫ'
      ? (lead.interest_products || match.interest || 'Materials')
      : (lead.interest_products || match.problem || 'Services');

    db.raw.prepare(`
      UPDATE leads
      SET status = CASE WHEN status = 'new' THEN ? ELSE status END,
          google_sheet_name = ?,
          google_sheet_row = ?,
          interest_products = COALESCE(NULLIF(?, ''), interest_products),
          notes = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, match.sheet_name, match.row_number, interest, notes, lead.id);

    if (lead.status === 'new' && nextStatus !== 'new') {
      movedFromNew += 1;
      db.raw.prepare(`
        INSERT INTO lead_activities (lead_id, action, description, old_value, new_value, performed_by)
        VALUES (?, 'status_change', ?, 'new', ?, 'google_sheets')
      `).run(lead.id, `Статус обновлён по листу ${match.sheet_name}`, nextStatus);
    }
  }

  return { checked: leads.length, matched, moved_from_new: movedFromNew, materials, services };
}

ensureLeadSheetColumns();

// GET all leads
router.get('/', async (req, res) => {
  try {
    const { status, source, priority, search, view, date_range, sort = 'date_desc', limit = 50, offset = 0 } = req.query;
    let where = [];
    let params = [];

    if (status) { where.push('status = ?'); params.push(status); }
    if (source) { where.push('source = ?'); params.push(source); }
    if (priority) { where.push('priority = ?'); params.push(priority); }
    if (view === 'facebook') {
      where.push('source = ?');
      params.push('facebook');
    }
    if (view === 'materials') {
      where.push("google_sheet_name = 'МАТЕРИАЛЫ'");
    }
    if (view === 'services') {
      where.push("google_sheet_name = 'УСЛУГИ'");
    }
    if (search) {
      where.push("(company_name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ? OR notes LIKE ? OR interest_products LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s, s);
    }
    if (date_range === 'today') {
      where.push("date(created_at) = date('now')");
    }
    if (date_range === 'week') {
      where.push("datetime(created_at) >= datetime('now', '-7 days')");
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const orderBy = sort === 'date_asc'
      ? 'datetime(created_at) ASC'
      : sort === 'status'
        ? "CASE status WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'qualified' THEN 3 WHEN 'offer_sent' THEN 4 WHEN 'negotiation' THEN 5 WHEN 'won' THEN 6 WHEN 'lost' THEN 7 ELSE 8 END, datetime(created_at) DESC"
        : "datetime(created_at) DESC, CASE priority WHEN 'hot' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";

    const { rows } = db.query(`
      SELECT * FROM leads ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    const countRes = db.query(`SELECT COUNT(*) as count FROM leads ${whereClause}`, params);

    res.json({ leads: rows, total: countRes.rows[0]?.count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET lead summary for tabs and status filters
router.get('/summary', async (req, res) => {
  try {
    const total = db.raw.prepare('SELECT COUNT(*) as count FROM leads').get()?.count || 0;
    const byStatus = db.raw.prepare('SELECT status, COUNT(*) as count FROM leads GROUP BY status').all();
    const bySource = db.raw.prepare('SELECT source, COUNT(*) as count FROM leads GROUP BY source').all();
    const today = db.raw.prepare("SELECT COUNT(*) as count FROM leads WHERE date(created_at) = date('now')").get()?.count || 0;
    const week = db.raw.prepare("SELECT COUNT(*) as count FROM leads WHERE datetime(created_at) >= datetime('now', '-7 days')").get()?.count || 0;
    const materials = db.raw.prepare(`
      SELECT COUNT(*) as count FROM leads
      WHERE google_sheet_name = 'МАТЕРИАЛЫ'
    `).get()?.count || 0;
    const services = db.raw.prepare(`
      SELECT COUNT(*) as count FROM leads
      WHERE google_sheet_name = 'УСЛУГИ'
    `).get()?.count || 0;

    res.json({
      total,
      facebook: bySource.find(row => row.source === 'facebook')?.count || 0,
      materials,
      services,
      today,
      week,
      statuses: byStatus,
      sources: bySource,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST sync FB leads against Google Sheets operational tabs
router.post('/sync-sheets', async (req, res) => {
  try {
    if (googleSheets.initialized) {
      await googleSheets.pullBusinessSheets();
    }
    const result = syncFacebookLeadsWithSheets();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET pipeline stats
router.get('/stats/pipeline', async (req, res) => {
  try {
    const { rows } = db.query(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(estimated_value), 0) as total_value
      FROM leads GROUP BY status
      ORDER BY CASE status
        WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'qualified' THEN 3
        WHEN 'offer_sent' THEN 4 WHEN 'negotiation' THEN 5
        WHEN 'won' THEN 6 WHEN 'lost' THEN 7
      END
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single lead
router.get('/:id', async (req, res) => {
  try {
    const { rows: leads } = db.query('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!leads.length) return res.status(404).json({ error: 'Not found' });

    const { rows: activities } = db.query(
      'SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY created_at DESC', [req.params.id]
    );

    res.json({ lead: leads[0], activities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create lead
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const result = db.raw.prepare(`
      INSERT INTO leads (company_name, contact_name, email, phone, city, lead_type, source, status, priority, company_type, interest_products, estimated_value, notes, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.company_name, b.contact_name, b.email, b.phone, b.city,
      b.lead_type || 'inquiry', b.source || 'website', b.status || 'new',
      b.priority || 'medium', b.company_type, b.interest_products,
      b.estimated_value, b.notes, b.assigned_to
    );

    const lead = db.raw.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);

    db.raw.prepare(
      'INSERT INTO lead_activities (lead_id, action, description, new_value, performed_by) VALUES (?, ?, ?, ?, ?)'
    ).run(lead.id, 'created', `Нов лид от ${b.source || 'website'}`, lead.status, 'system');

    res.status(201).json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update lead
router.put('/:id', async (req, res) => {
  try {
    const old = db.raw.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Not found' });

    const b = req.body;
    const fields = [];
    const params = [];

    for (const [key, val] of Object.entries(b)) {
      if (val !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        params.push(val);
      }
    }
    fields.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.raw.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    if (b.status && b.status !== old.status) {
      db.raw.prepare(
        'INSERT INTO lead_activities (lead_id, action, description, old_value, new_value) VALUES (?, ?, ?, ?, ?)'
      ).run(req.params.id, 'status_change', `Статус: ${old.status} → ${b.status}`, old.status, b.status);
    }

    const updated = db.raw.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE lead
router.delete('/:id', async (req, res) => {
  try {
    db.raw.prepare('DELETE FROM lead_activities WHERE lead_id = ?').run(req.params.id);
    db.raw.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
