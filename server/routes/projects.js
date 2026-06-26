const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../services/auth');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const PROJECT_STATUSES = ['new', 'discovery', 'estimate', 'offer_preparation', 'offer_sent', 'waiting_client', 'approved', 'archived'];
const PROJECT_UPLOAD_DIR = path.join(__dirname, '..', '..', 'client', 'uploads', 'projects');

if (!fs.existsSync(PROJECT_UPLOAD_DIR)) {
  fs.mkdirSync(PROJECT_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PROJECT_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10) || '.jpg';
    const safeBase = path.basename(file.originalname || 'photo', path.extname(file.originalname || ''))
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .slice(0, 40) || 'photo';
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  },
});
const upload = multer({ storage });

async function ensureProjectsTable() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contractors (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      city TEXT,
      regions TEXT,
      specialties TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      client_name TEXT,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      city TEXT,
      site_address TEXT,
      object_type TEXT,
      approximate_area_m2 TEXT,
      problem_description TEXT,
      repair_scope TEXT,
      client_answers TEXT,
      materials_needed TEXT,
      photos_info TEXT,
      project_photos JSONB DEFAULT '[]'::jsonb,
      contractor_required BOOLEAN DEFAULT FALSE,
      contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
      contractor_company TEXT,
      contractor_notes TEXT,
      estimated_value NUMERIC(12,2) DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      status TEXT DEFAULT 'new',
      next_step TEXT,
      notes TEXT,
      created_by TEXT DEFAULT 'worker',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_projects_lead ON projects(lead_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_city ON projects(city);
    CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

    ALTER TABLE projects ADD COLUMN IF NOT EXISTS approximate_area_m2 TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_answers TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_photos JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_required BOOLEAN DEFAULT FALSE;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_company TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_notes TEXT;
  `);
}

function normalizeStatus(value) {
  const status = String(value || 'new').trim();
  return PROJECT_STATUSES.includes(status) ? status : 'new';
}

function payloadFromBody(body = {}) {
  return {
    title: String(body.title || '').trim(),
    lead_id: body.lead_id ? Number(body.lead_id) : null,
    client_name: String(body.client_name || '').trim(),
    contact_name: String(body.contact_name || '').trim(),
    phone: String(body.phone || '').trim(),
    email: String(body.email || '').trim(),
    city: String(body.city || '').trim(),
    site_address: String(body.site_address || '').trim(),
    object_type: String(body.object_type || '').trim(),
    approximate_area_m2: String(body.approximate_area_m2 || '').trim(),
    problem_description: String(body.problem_description || '').trim(),
    repair_scope: String(body.repair_scope || '').trim(),
    client_answers: String(body.client_answers || '').trim(),
    materials_needed: String(body.materials_needed || '').trim(),
    photos_info: String(body.photos_info || '').trim(),
    contractor_required: body.contractor_required === true || String(body.contractor_required || '') === '1',
    contractor_id: body.contractor_id ? Number(body.contractor_id) : null,
    contractor_company: String(body.contractor_company || '').trim(),
    contractor_notes: String(body.contractor_notes || '').trim(),
    estimated_value: 0,
    currency: 'EUR',
    status: normalizeStatus(body.status),
    next_step: String(body.next_step || '').trim(),
    notes: String(body.notes || '').trim(),
  };
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function mapProjectStatusToLeadStatus(status = '') {
  const map = {
    new: 'new',
    discovery: 'needs_discovery',
    estimate: 'offer_preparation',
    offer_preparation: 'offer_preparation',
    offer_sent: 'offer_sent',
    waiting_client: 'negotiation',
    approved: 'won',
    archived: 'lost',
  };
  return map[String(status || '').trim()] || 'needs_discovery';
}

function buildProjectLeadNotes(payload = {}) {
  const lines = [
    payload.site_address ? `Проект: ${payload.site_address}` : '',
    payload.object_type ? `Тип объекта: ${payload.object_type}` : '',
    payload.approximate_area_m2 ? `Примерно м²: ${payload.approximate_area_m2}` : '',
    payload.problem_description ? `Проблема: ${payload.problem_description}` : '',
    payload.repair_scope ? `Объём работ: ${payload.repair_scope}` : '',
    payload.client_answers ? `Ответы клиента: ${payload.client_answers}` : '',
    payload.materials_needed ? `Материалы: ${payload.materials_needed}` : '',
    payload.contractor_required ? `Нужен подрядчик: ${payload.contractor_company || 'Да'}` : '',
    payload.contractor_notes ? `Комментарий по подрядчику: ${payload.contractor_notes}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

async function ensureLinkedLead(payload = {}, currentLeadId = null, performedBy = 'manager') {
  const normalizedEmail = normalizeEmail(payload.email);
  const normalizedPhone = normalizePhone(payload.phone);
  const companyName = String(payload.client_name || '').trim();
  const contactName = String(payload.contact_name || '').trim();
  const leadStatus = mapProjectStatusToLeadStatus(payload.status);
  const leadNotes = buildProjectLeadNotes(payload);

  if (!companyName && !contactName && !normalizedEmail && !normalizedPhone) {
    return currentLeadId || null;
  }

  if (currentLeadId) {
    await db.query(`
      UPDATE leads
      SET company_name = COALESCE(NULLIF(?, ''), company_name),
          contact_name = COALESCE(NULLIF(?, ''), contact_name),
          email = COALESCE(NULLIF(?, ''), email),
          phone = COALESCE(NULLIF(?, ''), phone),
          city = COALESCE(NULLIF(?, ''), city),
          lead_type = COALESCE(NULLIF(?, ''), lead_type),
          interest_products = COALESCE(NULLIF(?, ''), interest_products),
          notes = COALESCE(NULLIF(?, ''), notes),
          status = COALESCE(NULLIF(?, ''), status),
          crm_segment = 'objects',
          updated_at = NOW()
      WHERE id = ?
    `, [
      companyName,
      contactName,
      normalizedEmail,
      payload.phone || '',
      payload.city || '',
      payload.object_type || 'project_object',
      payload.materials_needed || payload.object_type || '',
      leadNotes,
      leadStatus,
      currentLeadId,
    ]);
    return currentLeadId;
  }

  const params = [];
  const where = [];
  if (normalizedEmail) {
    where.push('lower(coalesce(email, \'\')) = ?');
    params.push(normalizedEmail);
  }
  if (normalizedPhone) {
    where.push('regexp_replace(coalesce(phone, \'\'), \'\\D\', \'\', \'g\') = ?');
    params.push(normalizedPhone);
  }
  if (companyName) {
    where.push('lower(coalesce(company_name, \'\')) = ?');
    params.push(companyName.toLowerCase());
  }

  let existing = null;
  if (where.length) {
    existing = await db.get(`
      SELECT id FROM leads
      WHERE ${where.join(' OR ')}
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `, params);
  }

  if (existing?.id) {
    await db.query(`
      UPDATE leads
      SET company_name = COALESCE(NULLIF(?, ''), company_name),
          contact_name = COALESCE(NULLIF(?, ''), contact_name),
          email = COALESCE(NULLIF(?, ''), email),
          phone = COALESCE(NULLIF(?, ''), phone),
          city = COALESCE(NULLIF(?, ''), city),
          lead_type = COALESCE(NULLIF(?, ''), lead_type),
          interest_products = COALESCE(NULLIF(?, ''), interest_products),
          notes = COALESCE(NULLIF(?, ''), notes),
          crm_segment = 'objects',
          updated_at = NOW()
      WHERE id = ?
    `, [
      companyName,
      contactName,
      normalizedEmail,
      payload.phone || '',
      payload.city || '',
      payload.object_type || 'project_object',
      payload.materials_needed || payload.object_type || '',
      leadNotes,
      existing.id,
    ]);
    return existing.id;
  }

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
      interest_products,
      notes,
      assigned_to,
      crm_segment
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [
    companyName || contactName || payload.title || 'Проектный клиент',
    contactName,
    normalizedEmail,
    payload.phone || '',
    payload.city || '',
    payload.object_type || 'project_object',
    'project',
    leadStatus,
    'medium',
    payload.materials_needed || payload.object_type || 'Материалы под объект',
    leadNotes,
    performedBy,
    'objects',
  ]);

  const leadId = rows[0]?.id || null;
  if (leadId) {
    await db.query(`
      INSERT INTO lead_activities (lead_id, action, description, new_value, performed_by)
      VALUES (?, ?, ?, ?, ?)
    `, [
      leadId,
      'created',
      'Клиент автоматически создан из проекта',
      leadStatus,
      performedBy,
    ]);
  }
  return leadId;
}

router.get('/meta', async (req, res) => {
  try {
    await ensureProjectsTable();
    const [{ rows: leads }, { rows: contractors }] = await Promise.all([
      db.query(`
      SELECT
        id,
        company_name,
        contact_name,
        phone,
        email,
        city,
        status,
        crm_segment,
        lead_type,
        interest_products
      FROM leads
      WHERE COALESCE(lead_type, '') <> 'tire_inquiry'
        AND COALESCE(crm_segment, 'objects') = 'objects'
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 300
    `),
      db.query(`
        SELECT id, company_name, contact_name, phone, email, city, specialties, is_active
        FROM contractors
        WHERE is_active = TRUE
        ORDER BY company_name ASC
      `),
    ]);
    res.json({ leads, contractors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await ensureProjectsTable();
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = req.query.status ? normalizeStatus(req.query.status) : '';
    const params = [];
    const where = [];

    if (status) {
      where.push('p.status = ?');
      params.push(status);
    }
    if (q) {
      where.push(`lower(concat_ws(' ',
        coalesce(p.title, ''),
        coalesce(p.client_name, ''),
        coalesce(p.contact_name, ''),
        coalesce(p.city, ''),
        coalesce(p.object_type, ''),
        coalesce(p.problem_description, ''),
        coalesce(p.materials_needed, '')
      )) LIKE ?`);
      params.push(`%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await db.query(`
      SELECT
        p.*,
        c.company_name AS contractor_name,
        c.contact_name AS contractor_contact_name,
        c.phone AS contractor_phone,
        c.email AS contractor_email,
        l.company_name AS lead_company_name,
        l.contact_name AS lead_contact_name
      FROM projects p
      LEFT JOIN contractors c ON c.id = p.contractor_id
      LEFT JOIN leads l ON l.id = p.lead_id
      ${whereSql}
      ORDER BY p.updated_at DESC, p.created_at DESC
    `, params);

    const summary = await db.get(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('approved', 'archived'))::int AS active,
        COUNT(*) FILTER (WHERE status = 'estimate')::int AS estimate,
        COUNT(*) FILTER (WHERE status = 'offer_sent')::int AS offers,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
      FROM projects
    `);

    res.json({
      rows,
      summary: {
        total: Number(summary?.total || 0),
        active: Number(summary?.active || 0),
        estimate: Number(summary?.estimate || 0),
        offers: Number(summary?.offers || 0),
        approved: Number(summary?.approved || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureProjectsTable();
    const { rows } = await db.query(`
      SELECT *
      FROM projects
      WHERE id = ?
      LIMIT 1
    `, [req.params.id]);
    const project = rows[0];
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureProjectsTable();
    const payload = payloadFromBody(req.body);
    if (!payload.title) return res.status(400).json({ error: 'Project title is required' });
    const performedBy = auth.getRoleFromRequest(req) === 'admin' ? 'admin' : 'manager';
    const linkedLeadId = await ensureLinkedLead(payload, payload.lead_id, performedBy);

    const { rows } = await db.query(`
      INSERT INTO projects (
        title, lead_id, client_name, contact_name, phone, email, city, site_address,
        object_type, approximate_area_m2, problem_description, repair_scope, client_answers, materials_needed, photos_info,
        contractor_required, contractor_id, contractor_company, contractor_notes,
        estimated_value, currency, status, next_step, notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      payload.title,
      linkedLeadId,
      payload.client_name,
      payload.contact_name,
      payload.phone,
      payload.email,
      payload.city,
      payload.site_address,
      payload.object_type,
      payload.approximate_area_m2,
      payload.problem_description,
      payload.repair_scope,
      payload.client_answers,
      payload.materials_needed,
      payload.photos_info,
      payload.contractor_required,
      payload.contractor_id,
      payload.contractor_company,
      payload.contractor_notes,
      payload.estimated_value,
      payload.currency,
      payload.status,
      payload.next_step,
      payload.notes,
      performedBy,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureProjectsTable();
    const existing = await db.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const payload = payloadFromBody(req.body);
    if (!payload.title) return res.status(400).json({ error: 'Project title is required' });
    const performedBy = auth.getRoleFromRequest(req) === 'admin' ? 'admin' : 'manager';
    const linkedLeadId = await ensureLinkedLead(payload, payload.lead_id || existing.lead_id, performedBy);

    const { rows } = await db.query(`
      UPDATE projects
      SET title = ?,
          lead_id = ?,
          client_name = ?,
          contact_name = ?,
          phone = ?,
          email = ?,
          city = ?,
          site_address = ?,
          object_type = ?,
          approximate_area_m2 = ?,
          problem_description = ?,
          repair_scope = ?,
          client_answers = ?,
          materials_needed = ?,
          photos_info = ?,
          contractor_required = ?,
          contractor_id = ?,
          contractor_company = ?,
          contractor_notes = ?,
          estimated_value = ?,
          currency = ?,
          status = ?,
          next_step = ?,
          notes = ?,
          updated_at = NOW()
      WHERE id = ?
      RETURNING *
    `, [
      payload.title,
      linkedLeadId,
      payload.client_name,
      payload.contact_name,
      payload.phone,
      payload.email,
      payload.city,
      payload.site_address,
      payload.object_type,
      payload.approximate_area_m2,
      payload.problem_description,
      payload.repair_scope,
      payload.client_answers,
      payload.materials_needed,
      payload.photos_info,
      payload.contractor_required,
      payload.contractor_id,
      payload.contractor_company,
      payload.contractor_notes,
      payload.estimated_value,
      payload.currency,
      payload.status,
      payload.next_step,
      payload.notes,
      req.params.id,
    ]);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/photos', upload.array('photos', 12), async (req, res) => {
  try {
    await ensureProjectsTable();
    const project = await db.get('SELECT id, project_photos FROM projects WHERE id = ?', [req.params.id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const existing = Array.isArray(project.project_photos) ? project.project_photos : [];
    const uploaded = (req.files || []).map(file => ({
      url: `/uploads/projects/${file.filename}`,
      name: file.originalname,
      uploaded_at: new Date().toISOString(),
    }));
    const merged = [...existing, ...uploaded];

    const { rows } = await db.query(`
      UPDATE projects
      SET project_photos = ?::jsonb,
          updated_at = NOW()
      WHERE id = ?
      RETURNING project_photos
    `, [JSON.stringify(merged), req.params.id]);

    res.json({ success: true, photos: rows[0]?.project_photos || merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
