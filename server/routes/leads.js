const express = require('express');
const router = express.Router();
const db = require('../db');
const googleSheets = require('../services/googleSheets');

async function ensureLeadSheetColumns() {
  const result = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'leads'
  `);

  const cols = result.rows.map(col => col.column_name);

  if (!cols.includes('google_sheet_name')) {
    await db.query(`ALTER TABLE leads ADD COLUMN google_sheet_name TEXT`);
  }

  if (!cols.includes('google_sheet_row')) {
    await db.query(`ALTER TABLE leads ADD COLUMN google_sheet_row INTEGER`);
  }
}

async function ensureDealOverrides() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS deal_status_overrides (
      sheet_name TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      stage_id TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (sheet_name, row_number)
    );
  `);
}

async function ensureIgnoredFacebookLeads() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ignored_fb_leads (
      fb_lead_id TEXT PRIMARY KEY,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

function dealStageFromLeadStatus(status) {
  const map = {
    new: 'new',
    contacted: 'interested',
    qualified: 'interested',
    offer_sent: 'offer_sent',
    negotiation: 'negotiation',
    won: 'won',
    lost: 'lost',
  };
  return map[status] || null;
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function findSheetMatchForLead(lead) {
  const phone = normalizePhone(lead.phone);
  const email = normalizeEmail(lead.email);
  if (!phone && !email) return null;

  const { rows } = await db.query(`
    SELECT sheet_name, row_number, company_name, contact_name, phone, email, status, action_needed, problem, interest, notes
    FROM sheet_clients
    WHERE sheet_name IN ('МАТЕРИАЛЫ', 'УСЛУГИ')
      AND (
        (? != '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = ?)
        OR (? != '' AND lower(COALESCE(email, '')) = ?)
      )
    ORDER BY CASE sheet_name WHEN 'МАТЕРИАЛЫ' THEN 1 WHEN 'УСЛУГИ' THEN 2 ELSE 3 END, row_number
    LIMIT 1
  `, [phone, phone, email, email]);

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

async function syncFacebookLeadsWithSheets() {
  await ensureLeadSheetColumns();

  const { rows: leads } = await db.query(`SELECT * FROM leads WHERE source = 'facebook'`);

  let matched = 0;
  let movedFromNew = 0;
  let materials = 0;
  let services = 0;
  let skippedExisting = 0;

  for (const lead of leads) {
    if (lead.status !== 'new' || lead.google_sheet_name) {
      skippedExisting += 1;
      continue;
    }

    const match = await findSheetMatchForLead(lead);
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

    await db.query(`
      UPDATE leads
      SET status = CASE WHEN status = 'new' THEN ? ELSE status END,
          google_sheet_name = ?,
          google_sheet_row = ?,
          interest_products = COALESCE(NULLIF(?, ''), interest_products),
          notes = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [nextStatus, match.sheet_name, match.row_number, interest, notes, lead.id]);

    if (lead.status === 'new' && nextStatus !== 'new') {
      movedFromNew += 1;

      await db.query(`
        INSERT INTO lead_activities (lead_id, action, description, old_value, new_value, performed_by)
        VALUES (?, 'status_change', ?, 'new', ?, 'google_sheets')
      `, [lead.id, `Статус обновлён по листу ${match.sheet_name}`, nextStatus]);
    }
  }

  return {
    checked: leads.length,
    matched,
    moved_from_new: movedFromNew,
    materials,
    services,
    skipped_existing: skippedExisting,
  };
}

ensureLeadSheetColumns().catch(err => {
  console.error('❌ ensureLeadSheetColumns error:', err.message);
});

// GET all leads
router.get('/', async (req, res) => {
  try {
    const {
      status,
      source,
      priority,
      search,
      view,
      date_range,
      sort = 'date_desc',
      limit = 50,
      offset = 0,
    } = req.query;

    const where = [];
    const params = [];

    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    if (source) {
      where.push('source = ?');
      params.push(source);
    }

    if (priority) {
      where.push('priority = ?');
      params.push(priority);
    }

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
      where.push(`(
        company_name ILIKE ?
        OR contact_name ILIKE ?
        OR email ILIKE ?
        OR phone ILIKE ?
        OR city ILIKE ?
        OR notes ILIKE ?
        OR interest_products ILIKE ?
      )`);

      const s = `%${search}%`;
      params.push(s, s, s, s, s, s, s);
    }

    if (date_range === 'today') {
      where.push('DATE(created_at) = CURRENT_DATE');
    }

    if (date_range === 'week') {
      where.push("created_at >= NOW() - INTERVAL '7 days'");
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const orderBy = sort === 'date_asc'
      ? 'created_at ASC'
      : sort === 'status'
        ? `CASE status
            WHEN 'new' THEN 1
            WHEN 'contacted' THEN 2
            WHEN 'qualified' THEN 3
            WHEN 'offer_sent' THEN 4
            WHEN 'negotiation' THEN 5
            WHEN 'won' THEN 6
            WHEN 'lost' THEN 7
            ELSE 8
          END, created_at DESC`
        : `created_at DESC,
          CASE priority
            WHEN 'hot' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END`;

    const { rows } = await db.query(`
      SELECT * FROM leads ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, Number(limit), Number(offset)]);

    const countRes = await db.query(`
      SELECT COUNT(*)::int as count FROM leads ${whereClause}
    `, params);

    res.json({
      leads: rows,
      total: countRes.rows[0]?.count || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET lead summary
router.get('/summary', async (req, res) => {
  try {
    const totalRes = await db.query(`SELECT COUNT(*)::int as count FROM leads`);
    const byStatusRes = await db.query(`SELECT status, COUNT(*)::int as count FROM leads GROUP BY status`);
    const bySourceRes = await db.query(`SELECT source, COUNT(*)::int as count FROM leads GROUP BY source`);

    const todayRes = await db.query(`
      SELECT COUNT(*)::int as count
      FROM leads
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const weekRes = await db.query(`
      SELECT COUNT(*)::int as count
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);

    const materialsRes = await db.query(`
      SELECT COUNT(*)::int as count FROM leads
      WHERE google_sheet_name = 'МАТЕРИАЛЫ'
    `);

    const servicesRes = await db.query(`
      SELECT COUNT(*)::int as count FROM leads
      WHERE google_sheet_name = 'УСЛУГИ'
    `);

    const bySource = bySourceRes.rows;
    const byStatus = byStatusRes.rows;

    res.json({
      total: totalRes.rows[0]?.count || 0,
      facebook: bySource.find(row => row.source === 'facebook')?.count || 0,
      materials: materialsRes.rows[0]?.count || 0,
      services: servicesRes.rows[0]?.count || 0,
      today: todayRes.rows[0]?.count || 0,
      week: weekRes.rows[0]?.count || 0,
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

    const result = await syncFacebookLeadsWithSheets();

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET pipeline stats
router.get('/stats/pipeline', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT status, COUNT(*)::int as count, COALESCE(SUM(estimated_value), 0) as total_value
      FROM leads
      GROUP BY status
      ORDER BY CASE status
        WHEN 'new' THEN 1
        WHEN 'contacted' THEN 2
        WHEN 'qualified' THEN 3
        WHEN 'offer_sent' THEN 4
        WHEN 'negotiation' THEN 5
        WHEN 'won' THEN 6
        WHEN 'lost' THEN 7
        ELSE 8
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
    const { rows: leads } = await db.query(
      'SELECT * FROM leads WHERE id = ?',
      [req.params.id]
    );

    if (!leads.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { rows: activities } = await db.query(`
      SELECT * FROM lead_activities
      WHERE lead_id = ?
      ORDER BY created_at DESC
    `, [req.params.id]);

    res.json({
      lead: leads[0],
      activities,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create lead
router.post('/', async (req, res) => {
  try {
    const b = req.body;

    const { rows } = await db.query(`
      INSERT INTO leads (
        company_name,
        contact_name,
        email,
        phone,
        city,
        lead_type,
        source,
        status,
        priority,
        company_type,
        interest_products,
        estimated_value,
        notes,
        assigned_to
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      b.company_name,
      b.contact_name,
      b.email,
      b.phone,
      b.city,
      b.lead_type || 'inquiry',
      b.source || 'website',
      b.status || 'new',
      b.priority || 'medium',
      b.company_type,
      b.interest_products,
      b.estimated_value,
      b.notes,
      b.assigned_to,
    ]);

    const lead = rows[0];

    await db.query(`
      INSERT INTO lead_activities (lead_id, action, description, new_value, performed_by)
      VALUES (?, ?, ?, ?, ?)
    `, [
      lead.id,
      'created',
      `Нов лид от ${b.source || 'website'}`,
      lead.status,
      'system',
    ]);

    res.status(201).json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update lead
router.put('/:id', async (req, res) => {
  try {
    const oldRes = await db.query(
      'SELECT * FROM leads WHERE id = ?',
      [req.params.id]
    );

    const old = oldRes.rows[0];

    if (!old) {
      return res.status(404).json({ error: 'Not found' });
    }

    const b = req.body;
    const fields = [];
    const params = [];

    for (const [key, val] of Object.entries(b)) {
      if (val !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        params.push(val);
      }
    }

    fields.push('updated_at = NOW()');
    params.push(req.params.id);

    if (!fields.length) {
      return res.json(old);
    }

    const updatedRes = await db.query(`
      UPDATE leads
      SET ${fields.join(', ')}
      WHERE id = ?
      RETURNING *
    `, params);

    const updated = updatedRes.rows[0];

    if (b.status && b.status !== old.status) {
      await db.query(`
        INSERT INTO lead_activities (lead_id, action, description, old_value, new_value)
        VALUES (?, ?, ?, ?, ?)
      `, [
        req.params.id,
        'status_change',
        `Статус: ${old.status} → ${b.status}`,
        old.status,
        b.status,
      ]);

      const stageId = dealStageFromLeadStatus(b.status);

      if (stageId && old.google_sheet_name && old.google_sheet_row) {
        await ensureDealOverrides();

        await db.query(`
          INSERT INTO deal_status_overrides (sheet_name, row_number, stage_id, updated_at)
          VALUES (?, ?, ?, NOW())
          ON CONFLICT(sheet_name, row_number) DO UPDATE SET
            stage_id = EXCLUDED.stage_id,
            updated_at = NOW()
        `, [
          old.google_sheet_name,
          old.google_sheet_row,
          stageId,
        ]);
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE lead
router.delete('/:id', async (req, res) => {
  try {
    const leadRes = await db.query(
      'SELECT source, fb_lead_id FROM leads WHERE id = ?',
      [req.params.id]
    );

    const lead = leadRes.rows[0];

    if (lead?.source === 'facebook' && lead.fb_lead_id) {
      await ensureIgnoredFacebookLeads();

      await db.query(`
        INSERT INTO ignored_fb_leads (fb_lead_id, reason, created_at)
        VALUES (?, 'deleted_in_app', NOW())
        ON CONFLICT(fb_lead_id) DO UPDATE SET
          reason = EXCLUDED.reason
      `, [lead.fb_lead_id]);
    }

    await db.query(
      'DELETE FROM lead_activities WHERE lead_id = ?',
      [req.params.id]
    );

    await db.query(
      'DELETE FROM leads WHERE id = ?',
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;