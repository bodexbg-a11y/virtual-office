const express = require('express');
const router = express.Router();
const db = require('../db');
const googleSheets = require('../services/googleSheets');
const CRM_STAGES = ['new', 'interested', 'catalog_sent', 'thinking', 'offer_sent', 'negotiation', 'office_meeting', 'contract', 'purchase', 'won', 'lost'];
const LEGACY_STATUS_MAP = {
  contacted: 'interested',
  qualified: 'interested',
};

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

  if (!cols.includes('google_sheet_status')) {
    await db.query(`ALTER TABLE leads ADD COLUMN google_sheet_status TEXT`);
  }

  if (!cols.includes('google_sheet_action')) {
    await db.query(`ALTER TABLE leads ADD COLUMN google_sheet_action TEXT`);
  }

  if (!cols.includes('next_followup_at')) {
    await db.query(`ALTER TABLE leads ADD COLUMN next_followup_at TIMESTAMP`);
  }

  if (!cols.includes('last_contact_at')) {
    await db.query(`ALTER TABLE leads ADD COLUMN last_contact_at TIMESTAMP`);
  }

  if (!cols.includes('premium_manual')) {
    await db.query(`ALTER TABLE leads ADD COLUMN premium_manual BOOLEAN DEFAULT FALSE`);
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
    interested: 'interested',
    contacted: 'interested',
    qualified: 'interested',
    catalog_sent: 'catalog_sent',
    thinking: 'thinking',
    offer_sent: 'offer_sent',
    negotiation: 'negotiation',
    office_meeting: 'office_meeting',
    contract: 'contract',
    purchase: 'purchase',
    won: 'won',
    lost: 'lost',
  };
  return map[status] || null;
}

function normalizeCrmStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'new';
  const mapped = LEGACY_STATUS_MAP[normalized] || normalized;
  return CRM_STAGES.includes(mapped) ? mapped : 'new';
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLeadPayload(payload = {}) {
  const normalized = {};

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      normalized[key] = trimmed === '' ? null : trimmed;
    } else {
      normalized[key] = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'estimated_value')) {
    const parsed = Number(normalized.estimated_value);
    normalized.estimated_value = Number.isFinite(parsed) ? parsed : null;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'premium_manual')) {
    normalized.premium_manual = normalized.premium_manual === true
      || normalized.premium_manual === 'true'
      || normalized.premium_manual === '1'
      || normalized.premium_manual === 1;
  }

  return normalized;
}

function extractLeadAreaLabel(lead = {}) {
  const text = String(lead.notes || '').replace(/\r/g, '');
  if (!text) return null;

  const patterns = [
    /Обем\s*\/\s*тип\s*запитване\s*:\s*([^\n|]+)/i,
    /какъв[\s_]*тип[\s_]*запитване[^\n:]*:\s*([^\n|]+)/i,
    /обем[^\n:]*:\s*([^\n|]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    return humanizeAreaValue(match[1]);
  }

  return null;
}

function humanizeAreaValue(value = '') {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/м2/gi, 'м²')
    .replace(/m2/gi, 'm²')
    .replace(/\s*\+\s*/g, '+')
    .trim();
}

function isFreshWithin24Hours(value) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return (Date.now() - timestamp) <= (24 * 60 * 60 * 1000);
}

function isSpecificObjectByArea(areaLabel = '') {
  return /конкретен\s+обект/i.test(String(areaLabel || ''));
}

function hasRegularMonthlyDelivery(notes = '') {
  return /(регулярн\w*\s+месечн\w*\s+доставк\w*|ежемес\w*\s+доставк\w*|regular\s+monthly\s+deliver\w*|monthly\s+supply|регулярни\s+месечни)/i.test(String(notes || ''));
}

function isGoldLeadByArea(areaLabel = '', notes = '') {
  const areaValue = String(areaLabel || '').toLowerCase();
  const notesValue = String(notes || '').toLowerCase();

  if (!areaValue && !notesValue) return false;

  if (/(400\s*\+|400\s*м²|400\s*m²|400\s*или\s*повече|400\s*or\s*more|над\s*400|от\s*400)/i.test(areaValue)) {
    return true;
  }

  if (/(1000\s*\+|1000\s*м²|1000\s*m²|над\s*1000|от\s*1000|1000\s*или\s*повече|1000\s*or\s*more)/i.test(areaValue)) {
    return true;
  }

  if (hasRegularMonthlyDelivery(notesValue)) {
    return true;
  }

  return false;
}

function buildLeadScore(lead = {}, extra = {}) {
  const reasons = [];
  let score = 0;
  const areaLabel = extra.area_label || extractLeadAreaLabel(lead) || null;
  const status = normalizeCrmStatus(lead.status);
  const phone = String(lead.phone || '').trim();
  const email = String(lead.email || '').trim();
  const priority = String(lead.priority || '').toLowerCase();
  const commentsCount = Number(extra.comments_count || 0);
  const offerCount = Number(extra.offer_count || 0);

  if (isGoldLeadByArea(areaLabel, lead.notes)) {
    score += 35;
    reasons.push('premium объём / регулярные поставки');
  }
  if (isSpecificObjectByArea(areaLabel)) {
    score += 20;
    reasons.push('конкретный объект');
  }
  if (phone && email) {
    score += 15;
    reasons.push('есть телефон и email');
  } else if (phone || email) {
    score += 8;
    reasons.push('есть контакт');
  }
  if (priority === 'hot') {
    score += 18;
    reasons.push('hot priority');
  } else if (priority === 'high') {
    score += 12;
    reasons.push('high priority');
  }
  if (['interested', 'catalog_sent', 'thinking', 'negotiation', 'office_meeting'].includes(status)) {
    score += 10;
    reasons.push('лид уже в работе');
  }
  if (status === 'offer_sent') {
    score += 14;
    reasons.push('ждёт ответ по КП');
  }
  if (commentsCount > 0) {
    score += 6;
    reasons.push('есть история общения');
  }
  if (lead.next_followup_at) {
    score += 6;
    reasons.push('назначен следующий контакт');
  }
  if (offerCount > 0) {
    score += 8;
    reasons.push('КП уже создано');
  }

  score = Math.min(100, score);
  return {
    value: score,
    label: score >= 75 ? 'hot' : score >= 45 ? 'warm' : 'new',
    reasons,
  };
}

function buildLeadSnapshot(lead = {}, extra = {}) {
  const areaLabel = extra.area_label || extractLeadAreaLabel(lead) || null;
  const status = normalizeCrmStatus(lead.status);
  const score = buildLeadScore(lead, { ...extra, area_label: areaLabel });
  const latestComment = extra.latest_comment || '';
  const nextAction = status === 'offer_sent'
    ? 'Получить обратную связь по КП'
    : status === 'catalog_sent'
      ? 'Проверить, посмотрел ли каталог'
      : status === 'thinking'
        ? 'Сделать follow-up по сроку ответа'
        : status === 'interested'
          ? 'Уточнить объект, объём и срок'
          : status === 'new'
            ? 'Первичный контакт'
            : status === 'negotiation'
              ? 'Дожать цену / сроки / решение'
              : status === 'office_meeting'
                ? 'Подготовить и провести встречу в офисе'
                : status === 'contract'
                ? 'Подготовить договор и оплату'
                : status === 'purchase'
                  ? 'Довести до поставки'
                  : 'Обновить следующий шаг';

  return {
    stage: status,
    score,
    area_label: areaLabel,
    is_specific_object: isSpecificObjectByArea(areaLabel),
    is_premium: isGoldLeadByArea(areaLabel, lead.notes),
    has_regular_delivery: hasRegularMonthlyDelivery(lead.notes),
    latest_comment: latestComment || null,
    latest_comment_at: extra.latest_comment_at || null,
    has_fresh_comment: isFreshWithin24Hours(extra.latest_comment_at),
    next_action: nextAction,
    forms_count: Number(extra.forms_count || 0),
    offers_count: Number(extra.offer_count || 0),
    contact_channels: {
      phone: !!String(lead.phone || '').trim(),
      email: !!String(lead.email || '').trim(),
    },
    waiting_for_offer: Number(extra.offer_count || 0) === 0 && ['interested', 'catalog_sent', 'thinking', 'negotiation', 'office_meeting'].includes(status),
  };
}

function enrichLeadRow(lead = {}) {
  const areaLabel = extractLeadAreaLabel(lead);
  const isPremium = Boolean(lead.premium_manual) || isGoldLeadByArea(areaLabel, lead.notes);
  const score = buildLeadScore(lead, {
    area_label: areaLabel,
    comments_count: lead.latest_comment ? 1 : 0,
  });
  return {
    ...lead,
    status: normalizeCrmStatus(lead.status),
    area_label: areaLabel,
    is_gold_lead: isPremium,
    has_fresh_comment: isFreshWithin24Hours(lead.latest_comment_at),
    lead_score: score.value,
    lead_score_label: score.label,
  };
}

const LEAD_TEXT_SQL = "lower(concat_ws(' ', coalesce(lead_type, ''), coalesce(interest_products, ''), coalesce(notes, '')))";
const NORMALIZED_STATUS_SQL = `CASE
  WHEN status IN ('contacted', 'qualified') THEN 'interested'
  ELSE status
END`;
const MATERIAL_LEAD_SQL = `(
  google_sheet_name = 'МАТЕРИАЛЫ'
  OR (
    google_sheet_name IS NULL
    AND ${LEAD_TEXT_SQL} ~ '(материал|material|materials|смол|smola|polymer|полимер|epoxy|епокс|pu|полиуретан|инжекц|packer|пакер|arcan)'
  )
)`;
const SERVICE_LEAD_SQL = `(
  google_sheet_name = 'УСЛУГИ'
  OR (
    google_sheet_name IS NULL
    AND NOT ${MATERIAL_LEAD_SQL}
    AND ${LEAD_TEXT_SQL} ~ '(услуг|service|ремонт|обект|объект|теч|хидроизолац|укреп|фундамент)'
  )
)`;
const TOUCHED_TODAY_SQL = `EXISTS (
  SELECT 1
  FROM lead_activities la
  WHERE la.lead_id = leads.id
    AND la.action IN ('comment', 'status_change', 'followup_change')
    AND la.created_at::date = CURRENT_DATE
)`;
const DAILY_CALLS_WHERE_SQL = `status NOT IN ('won', 'lost')
  AND ${MATERIAL_LEAD_SQL}
  AND (
    (next_followup_at IS NOT NULL AND next_followup_at < (CURRENT_DATE + INTERVAL '1 day'))
    OR status = 'new'
    OR priority IN ('hot', 'high')
  )
  AND NOT ${TOUCHED_TODAY_SQL}`;

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

async function findSheetRowByLeadReference(lead) {
  if (!lead.google_sheet_name || !lead.google_sheet_row) return null;

  const { rows } = await db.query(`
    SELECT sheet_name, row_number, company_name, contact_name, phone, email, status, action_needed, problem, interest, notes
    FROM sheet_clients
    WHERE sheet_name = ?
      AND row_number = ?
    LIMIT 1
  `, [lead.google_sheet_name, lead.google_sheet_row]);

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
  if (/закрыт|заключен|спечел|оплат|купил/.test(text)) return 'won';
  if (/закуп|готов/.test(text)) return 'purchase';
  if (/договор|contract/.test(text)) return 'contract';
  if (/встреч.*офис|офис.*встреч|срещ.*офис|офис.*срещ/.test(text)) return 'office_meeting';
  if (/коммерческ|оферт|предложен|\bкп\b/.test(text)) return 'offer_sent';
  if (/каталог|презентац|presentation|catalog/.test(text)) return 'catalog_sent';
  if (/дума/.test(text)) return 'thinking';
  if (/встреч|срещ|дума|цена|жд[уе]т|ответит/.test(text)) return 'negotiation';

  return 'interested';
}

async function syncFacebookLeadsWithSheets() {
  await ensureLeadSheetColumns();

  const { rows: leads } = await db.query(`SELECT * FROM leads WHERE source = 'facebook'`);

  let matched = 0;
  let statusUpdated = 0;
  let materials = 0;
  let services = 0;
  let alreadyLinked = 0;
  let notFound = 0;

  for (const lead of leads) {
    let match = await findSheetRowByLeadReference(lead);
    if (match) alreadyLinked += 1;

    if (!match) {
      match = await findSheetMatchForLead(lead);
    }

    if (!match) {
      notFound += 1;
      continue;
    }

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
      SET status = ?,
          google_sheet_name = ?,
          google_sheet_row = ?,
          google_sheet_status = ?,
          google_sheet_action = ?,
          interest_products = COALESCE(NULLIF(?, ''), interest_products),
          notes = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [
      nextStatus,
      match.sheet_name,
      match.row_number,
      match.status || null,
      match.action_needed || null,
      interest,
      notes,
      lead.id,
    ]);

    if (lead.status !== nextStatus) {
      statusUpdated += 1;

      await db.query(`
        INSERT INTO lead_activities (lead_id, action, description, old_value, new_value, performed_by)
        VALUES (?, 'status_change', ?, ?, ?, 'google_sheets')
      `, [lead.id, `Статус обновлён по листу ${match.sheet_name}`, lead.status, nextStatus]);
    }
  }

  return {
    checked: leads.length,
    matched,
    status_updated: statusUpdated,
    materials,
    services,
    already_linked: alreadyLinked,
    not_found: notFound,
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
      city,
      view,
      date_range,
      followup,
      sort = 'date_desc',
      limit = 50,
      offset = 0,
    } = req.query;

    const where = [];
    const params = [];

    if (status) {
      where.push(`${NORMALIZED_STATUS_SQL} = ?`);
      params.push(normalizeCrmStatus(status));
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
      where.push(MATERIAL_LEAD_SQL);
    }

    if (view === 'services') {
      where.push(SERVICE_LEAD_SQL);
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

    if (city) {
      where.push(`LOWER(TRIM(COALESCE(city, ''))) = LOWER(TRIM(?))`);
      params.push(city);
    }

    if (date_range === 'today') {
      where.push('DATE(created_at) = CURRENT_DATE');
    }

    if (date_range === 'week') {
      where.push("created_at >= NOW() - INTERVAL '7 days'");
    }

    if (followup === 'due') {
      where.push(DAILY_CALLS_WHERE_SQL);
    }

    if (followup === 'today') {
      where.push('next_followup_at::date = CURRENT_DATE');
      where.push(`${NORMALIZED_STATUS_SQL} NOT IN ('won', 'lost')`);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const orderBy = followup
      ? `CASE
            WHEN next_followup_at IS NOT NULL AND next_followup_at < NOW() THEN 0
            WHEN next_followup_at IS NOT NULL AND next_followup_at::date = CURRENT_DATE THEN 1
            WHEN status = 'new' THEN 2
            WHEN priority = 'hot' THEN 3
            WHEN priority = 'high' THEN 4
            ELSE 5
          END,
          CASE
            WHEN next_followup_at IS NULL THEN 1
            ELSE 0
          END,
          next_followup_at ASC NULLS LAST,
          created_at DESC`
      : sort === 'date_asc'
      ? 'created_at ASC'
      : sort === 'status'
        ? `CASE status
            WHEN 'new' THEN 1
            WHEN 'interested' THEN 2
            WHEN 'contacted' THEN 2
            WHEN 'qualified' THEN 2
            WHEN 'catalog_sent' THEN 3
            WHEN 'thinking' THEN 4
            WHEN 'offer_sent' THEN 5
            WHEN 'negotiation' THEN 6
            WHEN 'office_meeting' THEN 7
            WHEN 'contract' THEN 8
            WHEN 'purchase' THEN 9
            WHEN 'won' THEN 10
            WHEN 'lost' THEN 11
            ELSE 12
          END, created_at DESC`
        : `created_at DESC,
          CASE priority
            WHEN 'hot' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END`;

    const { rows } = await db.query(`
      SELECT leads.*,
        (
          SELECT description
          FROM lead_activities
          WHERE lead_id = leads.id AND action = 'comment'
          ORDER BY created_at DESC
          LIMIT 1
        ) as latest_comment,
        (
          SELECT created_at
          FROM lead_activities
          WHERE lead_id = leads.id AND action = 'comment'
          ORDER BY created_at DESC
          LIMIT 1
        ) as latest_comment_at,
        (
          SELECT created_at
          FROM lead_activities
          WHERE lead_id = leads.id AND action = 'status_change'
          ORDER BY created_at DESC
          LIMIT 1
        ) as latest_status_change_at,
        (
          SELECT created_at
          FROM lead_activities
          WHERE lead_id = leads.id AND action = 'ping_followup'
          ORDER BY created_at DESC
          LIMIT 1
        ) as latest_ping_at
      FROM leads ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, Number(limit), Number(offset)]);

    const countRes = await db.query(`
      SELECT COUNT(*)::int as count FROM leads ${whereClause}
    `, params);

    res.json({
      leads: rows.map(enrichLeadRow),
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
    const byStatusRes = await db.query(`
      SELECT ${NORMALIZED_STATUS_SQL} as status, COUNT(*)::int as count
      FROM leads
      GROUP BY ${NORMALIZED_STATUS_SQL}
    `);
    const bySourceRes = await db.query(`SELECT source, COUNT(*)::int as count FROM leads GROUP BY source`);
    const byCityRes = await db.query(`
      SELECT TRIM(city) as city, COUNT(*)::int as count
      FROM leads
      WHERE TRIM(COALESCE(city, '')) <> ''
      GROUP BY TRIM(city)
      ORDER BY
        CASE LOWER(TRIM(city))
          WHEN 'софия' THEN 0
          WHEN 'sofia' THEN 0
          WHEN 'пловдив' THEN 1
          WHEN 'plovdiv' THEN 1
          WHEN 'варна' THEN 2
          WHEN 'varna' THEN 2
          ELSE 3
        END,
        COUNT(*) DESC,
        TRIM(city) ASC
    `);

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
      WHERE ${MATERIAL_LEAD_SQL}
    `);

    const servicesRes = await db.query(`
      SELECT COUNT(*)::int as count FROM leads
      WHERE ${SERVICE_LEAD_SQL}
    `);

    const bySource = bySourceRes.rows;
    const byStatus = byStatusRes.rows;
    const byCity = byCityRes.rows;

    res.json({
      total: totalRes.rows[0]?.count || 0,
      facebook: bySource.find(row => row.source === 'facebook')?.count || 0,
      materials: materialsRes.rows[0]?.count || 0,
      services: servicesRes.rows[0]?.count || 0,
      today: todayRes.rows[0]?.count || 0,
      week: weekRes.rows[0]?.count || 0,
      followups_due: (await db.query(`
        SELECT COUNT(*)::int as count
        FROM leads
        WHERE ${DAILY_CALLS_WHERE_SQL}
      `)).rows[0]?.count || 0,
      statuses: byStatus,
      sources: bySource,
      cities: byCity,
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
        WHEN 'interested' THEN 2
        WHEN 'contacted' THEN 2
        WHEN 'qualified' THEN 2
        WHEN 'catalog_sent' THEN 3
        WHEN 'thinking' THEN 4
        WHEN 'offer_sent' THEN 5
        WHEN 'negotiation' THEN 6
        WHEN 'office_meeting' THEN 7
        WHEN 'contract' THEN 8
        WHEN 'purchase' THEN 9
        WHEN 'won' THEN 10
        WHEN 'lost' THEN 11
        ELSE 12
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

    const { rows: offerRows } = await db.query(`
      SELECT COUNT(*)::int as count
      FROM offers
      WHERE lead_id = ?
    `, [req.params.id]);

    const formResponses = await googleSheets.getLeadFormResponses(req.params.id);
    const latestComment = activities.find(a => a.action === 'comment')?.description || '';
    const latestCommentAt = activities.find(a => a.action === 'comment')?.created_at || null;
    const lead = enrichLeadRow(leads[0]);
    const snapshot = buildLeadSnapshot(lead, {
      area_label: lead.area_label,
      latest_comment: latestComment,
      latest_comment_at: latestCommentAt,
      comments_count: activities.filter(a => a.action === 'comment').length,
      forms_count: formResponses.length,
      offer_count: offerRows[0]?.count || 0,
    });

    res.json({
      lead,
      snapshot,
      activities,
      form_responses: formResponses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add lead comment/activity
router.post('/:id/comments', async (req, res) => {
  try {
    const comment = String(req.body.comment || '').trim();
    const performedBy = String(req.body.performed_by || 'manager').trim() || 'manager';

    if (!comment) {
      return res.status(400).json({ error: 'Comment is required' });
    }

    const { rows: leads } = await db.query(
      'SELECT id FROM leads WHERE id = ?',
      [req.params.id]
    );

    if (!leads.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { rows } = await db.query(`
      INSERT INTO lead_activities (lead_id, action, description, performed_by)
      VALUES (?, 'comment', ?, ?)
      RETURNING *
    `, [req.params.id, comment, performedBy]);

    await db.query(
      'UPDATE leads SET updated_at = NOW() WHERE id = ?',
      [req.params.id]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE lead comment/activity
router.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    const { rows } = await db.query(`
      DELETE FROM lead_activities
      WHERE id = ? AND lead_id = ? AND action = 'comment'
      RETURNING id
    `, [req.params.commentId, req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await db.query(
      'UPDATE leads SET updated_at = NOW() WHERE id = ?',
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-ping', async (req, res) => {
  try {
    const leadIds = [...new Set(
      (Array.isArray(req.body.lead_ids) ? req.body.lead_ids : [])
        .map(id => Number(id))
        .filter(Number.isInteger)
    )].slice(0, 500);
    const performedBy = String(req.body.performed_by || 'manager').trim() || 'manager';
    const channel = String(req.body.channel || 'followup').trim() || 'followup';

    if (!leadIds.length) {
      return res.status(400).json({ error: 'Lead IDs are required' });
    }

    const placeholders = leadIds.map(() => '?').join(', ');
    const { rows: existing } = await db.query(
      `SELECT id FROM leads WHERE id IN (${placeholders})`,
      leadIds
    );

    await Promise.all(existing.map(lead => db.query(`
      INSERT INTO lead_activities (lead_id, action, description, new_value, performed_by)
      VALUES (?, 'ping_followup', ?, ?, ?)
    `, [
      lead.id,
      `Массовый пинг через ${channel}`,
      channel,
      performedBy,
    ])));

    res.status(201).json({ success: true, count: existing.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/ping', async (req, res) => {
  try {
    const performedBy = String(req.body.performed_by || 'manager').trim() || 'manager';
    const channel = String(req.body.channel || 'followup').trim() || 'followup';

    const { rows: leads } = await db.query(
      'SELECT id FROM leads WHERE id = ?',
      [req.params.id]
    );

    if (!leads.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { rows } = await db.query(`
      INSERT INTO lead_activities (lead_id, action, description, new_value, performed_by)
      VALUES (?, 'ping_followup', ?, ?, ?)
      RETURNING *
    `, [
      req.params.id,
      `Пинг после каталога через ${channel}`,
      channel,
      performedBy,
    ]);

    await db.query(
      'UPDATE leads SET updated_at = NOW() WHERE id = ?',
      [req.params.id]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create lead
router.post('/', async (req, res) => {
  try {
    const b = normalizeLeadPayload(req.body);
    const status = normalizeCrmStatus(b.status || 'new');

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
      status,
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
      status,
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

    const b = normalizeLeadPayload(req.body);
    if (Object.prototype.hasOwnProperty.call(b, 'status')) {
      b.status = normalizeCrmStatus(b.status);
    }
    const fields = [];
    const params = [];

    for (const [key, val] of Object.entries(b)) {
      if (val !== undefined && !['id', 'performed_by'].includes(key)) {
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
        INSERT INTO lead_activities (lead_id, action, description, old_value, new_value, performed_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        req.params.id,
        'status_change',
        `Статус: ${old.status} → ${b.status}`,
        old.status,
        b.status,
        b.performed_by || 'manager',
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

    if (Object.prototype.hasOwnProperty.call(b, 'next_followup_at')) {
      const oldFollowup = old.next_followup_at ? new Date(old.next_followup_at).toISOString() : '';
      const newFollowup = b.next_followup_at ? new Date(b.next_followup_at).toISOString() : '';

      if (oldFollowup !== newFollowup) {
        await db.query(`
          INSERT INTO lead_activities (lead_id, action, description, old_value, new_value, performed_by)
          VALUES (?, 'followup_change', ?, ?, ?, ?)
        `, [
          req.params.id,
          b.next_followup_at ? 'Назначена дата следующего звонка' : 'Дата следующего звонка очищена',
          old.next_followup_at || '',
          b.next_followup_at || '',
          b.performed_by || 'manager',
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

async function normalizeLegacyLeadStatuses() {
  await db.query(`
    UPDATE leads
    SET status = 'interested', updated_at = NOW()
    WHERE status IN ('contacted', 'qualified')
  `);
}

normalizeLegacyLeadStatuses().catch(err => {
  console.error('❌ normalizeLegacyLeadStatuses error:', err.message);
});

module.exports = router;
