const express = require('express');
const router = express.Router();
const db = require('../db');

async function ensureConstructionFirmsTable() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS construction_firms (
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
      role TEXT,
      manager_comment TEXT,
      call_result TEXT,
      contact_date TEXT,
      owner_name TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_construction_firms_company_name ON construction_firms(company_name);
    CREATE INDEX IF NOT EXISTS idx_construction_firms_city ON construction_firms(city);
    CREATE INDEX IF NOT EXISTS idx_construction_firms_is_active ON construction_firms(is_active);
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS public_contact TEXT;
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS website TEXT;
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS contact_status TEXT;
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS priority TEXT;
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS role TEXT;
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS manager_comment TEXT;
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS call_result TEXT;
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS contact_date TEXT;
    ALTER TABLE construction_firms ADD COLUMN IF NOT EXISTS owner_name TEXT;
    CREATE TABLE IF NOT EXISTS construction_firm_comments (
      id SERIAL PRIMARY KEY,
      firm_id INTEGER NOT NULL,
      comment TEXT NOT NULL,
      performed_by TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_construction_firm_comments_firm_id ON construction_firm_comments(firm_id);
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
    role: String(body.role || '').trim(),
    manager_comment: String(body.manager_comment || '').trim(),
    call_result: String(body.call_result || '').trim(),
    contact_date: String(body.contact_date || '').trim(),
    owner_name: String(body.owner_name || '').trim(),
    notes: String(body.notes || '').trim(),
    is_active: body.is_active === false ? false : true,
  };
}

function normalizeCompanyName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/\b(еоод|оод|еад|ад|ltd|llc|gmbh|inc|kg|ag|group|firm|company)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D+/g, '');
}

function extractEmails(value = '') {
  return Array.from(new Set(
    String(value || '')
      .toLowerCase()
      .match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/g) || []
  ));
}

function companyNamesLikelyMatch(a = '', b = '') {
  const left = normalizeCompanyName(a);
  const right = normalizeCompanyName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 8 && right.includes(left)) return true;
  if (right.length >= 8 && left.includes(right)) return true;
  return false;
}

function firmMatchesLead(firm, lead) {
  const firmCompany = firm.company_name || '';
  const leadCompany = lead.company_name || '';
  if (companyNamesLikelyMatch(firmCompany, leadCompany)) return true;

  const firmPhones = [
    normalizePhone(firm.phone),
    ...String(firm.public_contact || '')
      .split(/[;,]/)
      .map(normalizePhone)
      .filter(Boolean),
  ].filter(Boolean);
  const leadPhone = normalizePhone(lead.phone || '');
  if (leadPhone && firmPhones.some(phone => phone && (phone.includes(leadPhone) || leadPhone.includes(phone)))) {
    return true;
  }

  const firmEmails = [
    ...extractEmails(firm.email),
    ...extractEmails(firm.public_contact),
  ];
  const leadEmails = [
    ...extractEmails(lead.email),
    ...extractEmails(lead.notes),
  ];
  if (firmEmails.length && leadEmails.length && firmEmails.some(email => leadEmails.includes(email))) {
    return true;
  }

  return false;
}

function crmFlagsForFirm(firm, leads = []) {
  const matches = leads.filter(lead => firmMatchesLead(firm, lead));
  const statuses = matches.map(lead => String(lead.status || ''));
  const existingInCrm = matches.length > 0;
  const hadCall = matches.some(lead => lead.first_manager_comment_at || lead.latest_comment);
  const isPartner = matches.some(lead => {
    const status = String(lead.status || '').toLowerCase();
    const segment = String(lead.crm_segment || '').toLowerCase();
    return segment === 'distributor'
      || ['partner_active', 'partner_test_order', 'partner_terms_sent', 'partner_negotiation', 'partner_meeting', 'won', 'contract', 'purchase'].includes(status);
  });

  return {
    existing_in_crm: existingInCrm,
    had_call: hadCall,
    is_partner: isPartner,
    matched_leads: matches.length,
    matched_statuses: Array.from(new Set(statuses)).filter(Boolean),
  };
}

async function loadLeadUniverse() {
  const { rows } = await db.query(`
    SELECT
      leads.id,
      leads.company_name,
      leads.phone,
      leads.email,
      leads.status,
      leads.crm_segment,
      leads.notes,
      (
        SELECT description
        FROM lead_activities
        WHERE lead_id = leads.id AND action = 'comment'
        ORDER BY created_at DESC
        LIMIT 1
      ) AS latest_comment,
      (
        SELECT created_at
        FROM lead_activities
        WHERE lead_id = leads.id AND action = 'comment'
          AND performed_by IN ('manager', 'admin')
        ORDER BY created_at ASC
        LIMIT 1
      ) AS first_manager_comment_at
    FROM leads
  `);
  return rows;
}

router.get('/', async (req, res) => {
  try {
    await ensureConstructionFirmsTable();
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
        coalesce(role, ''),
        coalesce(manager_comment, ''),
        coalesce(call_result, ''),
        coalesce(contact_date, ''),
        coalesce(owner_name, ''),
        coalesce(notes, '')
      )) LIKE ?`);
      params.push(`%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [{ rows }, summary, leadUniverse] = await Promise.all([
      db.query(`
        SELECT *
        FROM construction_firms
        ${whereSql}
        ORDER BY is_active DESC, company_name ASC, created_at DESC
      `, params),
      db.get(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
          COUNT(*) FILTER (WHERE is_active = FALSE)::int AS inactive
        FROM construction_firms
      `),
      loadLeadUniverse(),
    ]);

    res.json({
      rows: rows.map(row => ({
        ...row,
        crm_flags: crmFlagsForFirm(row, leadUniverse),
      })),
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

router.get('/:id', async (req, res) => {
  try {
    await ensureConstructionFirmsTable();
    const firm = await db.get('SELECT * FROM construction_firms WHERE id = ?', [req.params.id]);
    if (!firm) return res.status(404).json({ error: 'Construction firm not found' });
    const [comments, leadUniverse] = await Promise.all([
      db.query(`
        SELECT id, firm_id, comment, performed_by, created_at
        FROM construction_firm_comments
        WHERE firm_id = ?
        ORDER BY created_at DESC, id DESC
      `, [req.params.id]),
      loadLeadUniverse(),
    ]);
    res.json({
      ...firm,
      comments: comments.rows,
      crm_flags: crmFlagsForFirm(firm, leadUniverse),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureConstructionFirmsTable();
    const payload = payloadFromBody(req.body);
    if (!payload.company_name) return res.status(400).json({ error: 'Company name is required' });

    const { rows } = await db.query(`
      INSERT INTO construction_firms (
        company_name, contact_name, public_contact, phone, email, city, regions, specialties,
        website, contact_status, priority, role, manager_comment, call_result, contact_date, owner_name,
        notes, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      payload.role,
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

router.post('/:id/comments', async (req, res) => {
  try {
    await ensureConstructionFirmsTable();
    const existing = await db.get('SELECT id FROM construction_firms WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Construction firm not found' });

    const comment = String(req.body?.comment || '').trim();
    const performed_by = String(req.body?.performed_by || 'manager').trim();
    if (!comment) return res.status(400).json({ error: 'Comment is required' });

    const { rows } = await db.query(`
      INSERT INTO construction_firm_comments (firm_id, comment, performed_by)
      VALUES (?, ?, ?)
      RETURNING *
    `, [req.params.id, comment, performed_by]);

    await db.query(`
      UPDATE construction_firms
      SET manager_comment = ?, updated_at = NOW()
      WHERE id = ?
    `, [comment, req.params.id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureConstructionFirmsTable();
    const existing = await db.get('SELECT id FROM construction_firms WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Construction firm not found' });

    const payload = payloadFromBody(req.body);
    if (!payload.company_name) return res.status(400).json({ error: 'Company name is required' });

    const { rows } = await db.query(`
      UPDATE construction_firms
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
          role = ?,
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
      payload.role,
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
