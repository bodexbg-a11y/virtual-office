const axios = require('axios');
const db = require('../db');
const googleSheets = require('./googleSheets');

const REPORT_SHEET = 'Mark Market Report';
const SOURCES_SHEET = 'Mark Sources';
let activeRun = null;

function ensureAgentTables() {
  db.raw.exec(`
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
  ensureAgentTables();
  const runInfo = db.raw.prepare(`
    INSERT INTO agent_runs (agent_id, status, message)
    VALUES ('mark', 'running', 'Mark сканирует рынок цен материалов')
  `).run();
  const runId = runInfo.lastInsertRowid;

  try {
    const products = db.raw.prepare(`
      SELECT sku, name, name_bg, category, description_bg
      FROM products
      ORDER BY category, name
    `).all();

    const reportRows = [];
    for (const product of products) {
      const query = buildQuery(product);
      const result = await scanMarket(product, query);
      reportRows.push([
        new Date().toISOString(),
        product.sku,
        product.name_bg || product.name,
        product.category,
        query,
        result.source,
        result.price || '',
        result.currency || '',
        result.confidence,
        result.status,
        result.recommendation,
      ]);
    }

    await writeReport(reportRows);
    db.raw.prepare(`
      UPDATE agent_runs
      SET status = 'done', message = ?, rows_created = ?, finished_at = NOW()
      WHERE id = ?
    `).run(`Готов отчёт по ${reportRows.length} продуктам`, reportRows.length, runId);

    return {
      success: true,
      run_id: runId,
      rows: reportRows.length,
      sheet: REPORT_SHEET,
      message: `Mark готов: отчёт по ${reportRows.length} продуктам записан в Google Sheets.`,
    };
  } catch (err) {
    db.raw.prepare(`
      UPDATE agent_runs
      SET status = 'error', message = ?, finished_at = NOW()
      WHERE id = ?
    `).run(err.message, runId);
    throw err;
  }
}

async function writeReport(rows) {
  if (!googleSheets.initialized) {
    await googleSheets.init();
  }
  if (!googleSheets.initialized) {
    throw new Error(googleSheets.lastError || 'Google Sheets не подключен');
  }

  await ensureSheet(REPORT_SHEET);
  await ensureSheet(SOURCES_SHEET);

  const header = [
    'Дата',
    'SKU',
    'Продукт',
    'Категория',
    'Запрос',
    'Источник',
    'Цена',
    'Валюта',
    'Уверенность',
    'Статус',
    'Рекомендация Mark',
  ];

  await googleSheets.sheets.spreadsheets.values.update({
    spreadsheetId: googleSheets.spreadsheetId,
    range: `'${REPORT_SHEET}'!A1:K${rows.length + 1}`,
    valueInputOption: 'RAW',
    resource: { values: [header, ...rows] },
  });

  const sourcesHeader = [['SKU/Keyword', 'Source URL', 'Notes']];
  const existing = await googleSheets.sheets.spreadsheets.values.get({
    spreadsheetId: googleSheets.spreadsheetId,
    range: `'${SOURCES_SHEET}'!A1:C2`,
  }).catch(() => ({ data: { values: [] } }));

  if (!existing.data.values || !existing.data.values.length) {
    await googleSheets.sheets.spreadsheets.values.update({
      spreadsheetId: googleSheets.spreadsheetId,
      range: `'${SOURCES_SHEET}'!A1:C1`,
      valueInputOption: 'RAW',
      resource: { values: sourcesHeader },
    });
  }
}

async function ensureSheet(title) {
  const meta = await googleSheets.testConnection();
  if (meta.sheets.includes(title)) return;
  await googleSheets.sheets.spreadsheets.batchUpdate({
    spreadsheetId: googleSheets.spreadsheetId,
    resource: { requests: [{ addSheet: { properties: { title } } }] },
  });
}

function buildQuery(product) {
  const name = product.name_bg || product.name;
  return `${name} цена България строителни материали`;
}

async function scanMarket(product, query) {
  const sources = await getConfiguredSources(product, query);
  const source = sources[0] || `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const html = await fetchHtml(source);
    const price = extractPrice(html);
    const text = htmlToText(html).slice(0, 600);
    return {
      source,
      price: price?.value || '',
      currency: price?.currency || '',
      confidence: price ? 'medium' : 'low',
      status: price ? 'price_found' : 'no_clear_price',
      recommendation: price
        ? `Найдена рыночная цена/упоминание. Проверить вручную источник и сравнить с BODEX условиями. Фрагмент: ${text.slice(0, 220)}`
        : `Источник найден, но цена не распознана. Mark должен проверить вручную и добавить точный URL в ${SOURCES_SHEET}.`,
    };
  } catch (err) {
    return {
      source,
      price: '',
      currency: '',
      confidence: 'low',
      status: 'scan_error',
      recommendation: `Не удалось автоматически прочитать источник: ${err.message}. Добавьте прямой URL поставщика/конкурента во вкладку ${SOURCES_SHEET}.`,
    };
  }
}

async function getConfiguredSources(product, query) {
  if (!googleSheets.initialized) return [];
  await ensureSheet(SOURCES_SHEET);
  const res = await googleSheets.sheets.spreadsheets.values.get({
    spreadsheetId: googleSheets.spreadsheetId,
    range: `'${SOURCES_SHEET}'!A2:C200`,
  }).catch(() => ({ data: { values: [] } }));

  const key = String(product.sku || '').toLowerCase();
  const name = String(product.name_bg || product.name || '').toLowerCase();
  return (res.data.values || [])
    .filter(row => row[1] && matchesSourceRow(row[0], key, name, query))
    .map(row => row[1]);
}

function matchesSourceRow(pattern, sku, name, query) {
  const p = String(pattern || '').toLowerCase().trim();
  if (!p) return false;
  return sku.includes(p) || name.includes(p) || query.toLowerCase().includes(p);
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 9000,
    maxRedirects: 3,
    headers: {
      'User-Agent': 'Mozilla/5.0 BODEX-Mark-Agent/1.0 (+https://bodexbg.com)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return String(res.data || '');
}

function extractPrice(html) {
  const text = htmlToText(html);
  const match = text.match(/(?:цена|price)?\s*([0-9]{1,5}(?:[,.][0-9]{1,2})?)\s*(лв\.?|bgn|eur|€)/i);
  if (!match) return null;
  return {
    value: match[1].replace(',', '.'),
    currency: normalizeCurrency(match[2]),
  };
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCurrency(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('лв') || v.includes('bgn')) return 'BGN';
  if (v.includes('eur') || v.includes('€')) return 'EUR';
  return value;
}

function latestRun() {
  ensureAgentTables();
  return db.raw.prepare(`
    SELECT * FROM agent_runs
    WHERE agent_id = 'mark'
    ORDER BY id DESC
    LIMIT 1
  `).get() || null;
}

module.exports = {
  run,
  isRunning: () => Boolean(activeRun),
  latestRun,
};
