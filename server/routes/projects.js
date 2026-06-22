const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../services/auth');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const PROJECT_STATUSES = ['new', 'discovery', 'estimate', 'offer_preparation', 'offer_sent', 'waiting_client', 'approved', 'archived'];
router.use(auth.requireAdmin);
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
    estimated_value: 0,
    currency: 'EUR',
    status: normalizeStatus(body.status),
    next_step: String(body.next_step || '').trim(),
    notes: String(body.notes || '').trim(),
  };
}

router.get('/meta', async (req, res) => {
  try {
    await ensureProjectsTable();
    const { rows: leads } = await db.query(`
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
    `);
    res.json({ leads });
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
        l.company_name AS lead_company_name,
        l.contact_name AS lead_contact_name
      FROM projects p
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

router.post('/', async (req, res) => {
  try {
    await ensureProjectsTable();
    const payload = payloadFromBody(req.body);
    if (!payload.title) return res.status(400).json({ error: 'Project title is required' });

    const { rows } = await db.query(`
      INSERT INTO projects (
        title, lead_id, client_name, contact_name, phone, email, city, site_address,
        object_type, approximate_area_m2, problem_description, repair_scope, client_answers, materials_needed, photos_info,
        estimated_value, currency, status, next_step, notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      payload.title,
      payload.lead_id,
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
      payload.estimated_value,
      payload.currency,
      payload.status,
      payload.next_step,
      payload.notes,
      'admin',
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
      payload.lead_id,
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
