const axios = require('axios');
const db = require('../db');

const SITE_URL = process.env.SEO_SITE_URL || 'https://bodexbg.com/';
let activeRun = null;

async function ensureAgentTables() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id SERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      rows_created INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (NOW()),
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);

    CREATE TABLE IF NOT EXISTS agent_reports (
      id SERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL,
      report_type TEXT NOT NULL,
      run_id INTEGER,
      payload_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_agent_reports_agent ON agent_reports(agent_id, created_at DESC);
  `);
}

async function run() {
  if (activeRun) return activeRun;
  activeRun = executeRun().finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function executeRun() {
  await ensureAgentTables();
  const runInfo = await db.run(`
    INSERT INTO agent_runs (agent_id, status, message)
    VALUES ('steve', 'running', 'Steve запускает SEO аудит bodexbg.com')
    RETURNING id
  `);
  const runId = runInfo.lastInsertRowid;

  try {
    const html = await fetchHtml(SITE_URL);
    const report = buildSeoReport(html, SITE_URL);

    await db.run(`
      INSERT INTO agent_reports (agent_id, report_type, run_id, payload_json)
      VALUES ('steve', 'seo_audit', ?, ?)
    `, [runId, JSON.stringify(report)]);

    await db.run(`
      UPDATE agent_runs
      SET status = 'done', message = ?, rows_created = ?, finished_at = NOW()
      WHERE id = ?
    `, [
      `Steve готов: ${report.checks.length} проверок, ${report.recommendations.length} рекомендаций`,
      report.recommendations.length,
      runId,
    ]);

    return {
      success: true,
      run_id: runId,
      checks: report.checks.length,
      recommendations: report.recommendations.length,
      message: 'Steve SEO аудит сохранён в БД.',
    };
  } catch (err) {
    await db.run(`
      UPDATE agent_runs
      SET status = 'error', message = ?, finished_at = NOW()
      WHERE id = ?
    `, [err.message, runId]);
    throw err;
  }
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    maxRedirects: 4,
    headers: {
      'User-Agent': 'Mozilla/5.0 BODEX-Steve-SEO-Agent/1.0 (+https://bodexbg.com)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return String(res.data || '');
}

function buildSeoReport(html, url) {
  const title = firstMatch(html, /<title[^>]*>(.*?)<\/title>/is);
  const description = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const canonical = firstMatch(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const h1Count = countMatches(html, /<h1\b/gi);
  const h2Count = countMatches(html, /<h2\b/gi);
  const imageCount = countMatches(html, /<img\b/gi);
  const imagesWithAlt = countMatches(html, /<img\b[^>]*\balt=["'][^"']+["'][^>]*>/gi);
  const internalLinks = extractInternalLinks(html, url);
  const text = htmlToText(html);

  const checks = [
    check('Title', Boolean(title), title || 'Title не найден'),
    check('Meta description', Boolean(description), description || 'Description не найден'),
    check('Canonical', Boolean(canonical), canonical || 'Canonical не найден'),
    check('H1', h1Count === 1, `${h1Count} H1 на странице`),
    check('H2 structure', h2Count >= 3, `${h2Count} H2 заголовков`),
    check('Image alt', imageCount === 0 || imagesWithAlt / imageCount >= 0.8, `${imagesWithAlt}/${imageCount} изображений с alt`),
    check('Internal links', internalLinks.length >= 6, `${internalLinks.length} внутренних ссылок найдено`),
    check('B2B keywords', hasB2bKeywords(text), 'Проверка ключевых B2B слов на странице'),
  ];

  const recommendations = buildRecommendations({ title, description, canonical, h1Count, h2Count, imageCount, imagesWithAlt, internalLinks, text });
  const linkbuilding = [
    'Добавить BODEX в болгарские B2B каталоги строительных поставщиков и подрядчиков.',
    'Собрать партнёрские ссылки от инженерных бюро, проектантов, строителни фирми и хидроизолационни изпълнители.',
    'Сделать 3 кейса: течове в подземен паркинг, инжектиране на пукнатини, укрепване/повдигане на плочи.',
    'Публиковать экспертные материалы на болгарском: инжекционни смоли, хидроизолация на бетон, спиране на течове.',
    'Запросить ссылки у поставщиков ARCAN и партнёров на страницу BODEX Bulgaria.',
  ];

  return {
    url,
    audited_at: new Date().toISOString(),
    summary: `SEO аудит Steve: ${checks.filter(c => c.ok).length}/${checks.length} проверок OK. Главный фокус: B2B ключи, кейсы, внутренние ссылки и линкбилдинг.`,
    checks,
    recommendations,
    linkbuilding,
    next_actions: [
      'Проверить title/description под запросы “инжекционни смоли България” и “хидроизолация бетон”.',
      'Добавить отдельные посадочные страницы под материалы и услуги с коммерческими CTA.',
      'Подготовить список 20 сайтов/каталогов для outreach и линкбилдинга.',
    ],
  };
}

function check(name, ok, detail) {
  return { name, ok, detail };
}

function buildRecommendations(data) {
  const list = [];
  if (!data.title || data.title.length < 25) {
    list.push('Усилить title: добавить BODEX, ключевую услугу и Bulgaria/Bulgaria market.');
  }
  if (!data.description || data.description.length < 80) {
    list.push('Написать meta description как коммерческое предложение: материалы, доставка, B2B, консультация.');
  }
  if (data.h1Count !== 1) {
    list.push('Оставить один главный H1, остальные крупные заголовки перевести в H2/H3.');
  }
  if (data.h2Count < 3) {
    list.push('Добавить структурные H2: Материалы, Услуги, Обекти, За кого работим, Контакт.');
  }
  if (data.imageCount && data.imagesWithAlt / data.imageCount < 0.8) {
    list.push('Добавить alt к изображениям с ключами: инжекционни смоли, бетон, хидроизолация, течове.');
  }
  if (data.internalLinks.length < 6) {
    list.push('Усилить внутреннюю перелинковку между продуктами, услугами, кейсами и формой заявки.');
  }
  if (!hasB2bKeywords(data.text)) {
    list.push('Добавить B2B формулировки: строителни фирми, снабдители, инфраструктура, подземни паркинги, бетонни конструкции.');
  }
  list.push('Сделать отдельный SEO-кластер по каждой группе: течове, пукнатини, фуги, анкериране, повдигане на плочи.');
  return list;
}

function extractInternalLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = [];
  const re = /<a\b[^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const link = new URL(m[1], base);
      if (link.hostname === base.hostname) links.push(link.toString());
    } catch {
      // ignore invalid href
    }
  }
  return [...new Set(links)];
}

function hasB2bKeywords(text) {
  return /строител|хидроизолац|бетон|инжекц|материал|b2b|обект|проект/i.test(text);
}

function firstMatch(text, re) {
  const m = re.exec(String(text || ''));
  return m?.[1] ? stripTags(m[1]).trim() : '';
}

function countMatches(text, re) {
  return (String(text || '').match(re) || []).length;
}

function htmlToText(html) {
  return stripTags(html)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

async function latestRun() {
  await ensureAgentTables();
  const row = await db.get(`
    SELECT * FROM agent_runs
    WHERE agent_id = 'steve'
    ORDER BY id DESC
    LIMIT 1
  `);
  return row || null;
}

module.exports = {
  run,
  isRunning: () => Boolean(activeRun),
  latestRun,
};
