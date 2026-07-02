const express = require('express');
const router = express.Router();
const db = require('../db');

async function ensureContractorsTable() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contractors (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      public_contact TEXT,
      phone TEXT,
      email TEXT,
      city TEXT,
      regions TEXT,
      specialties TEXT,
      website TEXT,
      contact_status TEXT,
      priority TEXT,
      manager_comment TEXT,
      call_result TEXT,
      contact_date TEXT,
      owner_name TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_contractors_company_name ON contractors(company_name);
    CREATE INDEX IF NOT EXISTS idx_contractors_city ON contractors(city);
    CREATE INDEX IF NOT EXISTS idx_contractors_is_active ON contractors(is_active);
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS public_contact TEXT;
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS website TEXT;
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS contact_status TEXT;
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS priority TEXT;
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS manager_comment TEXT;
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS call_result TEXT;
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS contact_date TEXT;
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS owner_name TEXT;
  `);
}

function payloadFromBody(body = {}) {
  return {
    company_name: String(body.company_name || '').trim(),
    contact_name: String(body.contact_name || '').trim(),
    public_contact: String(body.public_contact || '').trim(),
    phone: String(body.phone || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    city: String(body.city || '').trim(),
    regions: String(body.regions || '').trim(),
    specialties: String(body.specialties || '').trim(),
    website: String(body.website || '').trim(),
    contact_status: String(body.contact_status || '').trim(),
    priority: String(body.priority || '').trim(),
    manager_comment: String(body.manager_comment || '').trim(),
    call_result: String(body.call_result || '').trim(),
    contact_date: String(body.contact_date || '').trim(),
    owner_name: String(body.owner_name || '').trim(),
    notes: String(body.notes || '').trim(),
    is_active: body.is_active === false ? false : true,
  };
}

router.get('/', async (req, res) => {
  try {
    await ensureContractorsTable();
    const q = String(req.query.q || '').trim().toLowerCase();
    const active = String(req.query.active || '').trim();
    const params = [];
    const where = [];

    if (active === '1') {
      where.push('is_active = TRUE');
    } else if (active === '0') {
      where.push('is_active = FALSE');
    }

    if (q) {
      where.push(`lower(concat_ws(' ',
        coalesce(company_name, ''),
        coalesce(contact_name, ''),
        coalesce(public_contact, ''),
        coalesce(phone, ''),
        coalesce(email, ''),
        coalesce(city, ''),
        coalesce(regions, ''),
        coalesce(specialties, ''),
        coalesce(website, ''),
        coalesce(contact_status, ''),
        coalesce(priority, ''),
        coalesce(manager_comment, ''),
        coalesce(call_result, ''),
        coalesce(contact_date, ''),
        coalesce(owner_name, ''),
        coalesce(notes, '')
      )) LIKE ?`);
      params.push(`%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(`
      SELECT *
      FROM contractors
      ${whereSql}
      ORDER BY is_active DESC, company_name ASC, created_at DESC
    `, params);

    const summary = await db.get(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
        COUNT(*) FILTER (WHERE is_active = FALSE)::int AS inactive
      FROM contractors
    `);

    res.json({
      rows,
      summary: {
        total: Number(summary?.total || 0),
        active: Number(summary?.active || 0),
        inactive: Number(summary?.inactive || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureContractorsTable();
    const payload = payloadFromBody(req.body);
    if (!payload.company_name) return res.status(400).json({ error: 'Company name is required' });

    const { rows } = await db.query(`
      INSERT INTO contractors (
        company_name, contact_name, public_contact, phone, email, city, regions, specialties,
        website, contact_status, priority, manager_comment, call_result, contact_date, owner_name,
        notes, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      payload.company_name,
      payload.contact_name,
      payload.public_contact,
      payload.phone,
      payload.email,
      payload.city,
      payload.regions,
      payload.specialties,
      payload.website,
      payload.contact_status,
      payload.priority,
      payload.manager_comment,
      payload.call_result,
      payload.contact_date,
      payload.owner_name,
      payload.notes,
      payload.is_active,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureContractorsTable();
    const existing = await db.get('SELECT id FROM contractors WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Contractor not found' });

    const payload = payloadFromBody(req.body);
    if (!payload.company_name) return res.status(400).json({ error: 'Company name is required' });

    const { rows } = await db.query(`
      UPDATE contractors
      SET company_name = ?,
          contact_name = ?,
          public_contact = ?,
          phone = ?,
          email = ?,
          city = ?,
          regions = ?,
          specialties = ?,
          website = ?,
          contact_status = ?,
          priority = ?,
          manager_comment = ?,
          call_result = ?,
          contact_date = ?,
          owner_name = ?,
          notes = ?,
          is_active = ?,
          updated_at = NOW()
      WHERE id = ?
      RETURNING *
    `, [
      payload.company_name,
      payload.contact_name,
      payload.public_contact,
      payload.phone,
      payload.email,
      payload.city,
      payload.regions,
      payload.specialties,
      payload.website,
      payload.contact_status,
      payload.priority,
      payload.manager_comment,
      payload.call_result,
      payload.contact_date,
      payload.owner_name,
      payload.notes,
      payload.is_active,
      req.params.id,
    ]);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
