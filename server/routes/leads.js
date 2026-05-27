const express = require('express');
const router = express.Router();
const db = require('../db');

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
      where.push("(COALESCE(interest_products, '') != '' OR LOWER(COALESCE(notes, '')) LIKE '%материал%' OR LOWER(COALESCE(notes, '')) LIKE '%material%')");
    }
    if (view === 'services') {
      where.push("(LOWER(COALESCE(notes, '')) LIKE '%услуг%' OR LOWER(COALESCE(notes, '')) LIKE '%service%' OR LOWER(COALESCE(notes, '')) LIKE '%оглед%')");
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
      WHERE COALESCE(interest_products, '') != ''
         OR LOWER(COALESCE(notes, '')) LIKE '%материал%'
         OR LOWER(COALESCE(notes, '')) LIKE '%material%'
    `).get()?.count || 0;
    const services = db.raw.prepare(`
      SELECT COUNT(*) as count FROM leads
      WHERE LOWER(COALESCE(notes, '')) LIKE '%услуг%'
         OR LOWER(COALESCE(notes, '')) LIKE '%service%'
         OR LOWER(COALESCE(notes, '')) LIKE '%оглед%'
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
