const axios = require('axios');
const db = require('../db');
const googleSheets = require('./googleSheets');

const REPORT_SHEET = 'Mark Market Report';
const SOURCES_SHEET = 'Mark Sources';
const WRITE_AGENT_REPORTS_TO_SHEETS = String(process.env.AGENT_REPORTS_TO_SHEETS || '').toLowerCase() === 'true';
const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY || '';
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || '';
const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
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
    VALUES ('mark', 'running', 'Mark сканирует рынок цен материалов')
    RETURNING id
  `);
  const runId = runInfo.lastInsertRowid;

  try {
    const products = await db.all(`
      SELECT sku, name, name_bg, category, description_bg
      FROM products
      ORDER BY category, name
    `);

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

    await saveReportToDb(runId, reportRows);
    await writeReport(reportRows);
    await db.run(`
      UPDATE agent_runs
      SET status = 'done', message = ?, rows_created = ?, finished_at = NOW()
      WHERE id = ?
    `, [`Готов отчёт по ${reportRows.length} продуктам`, reportRows.length, runId]);

    return {
      success: true,
      run_id: runId,
      rows: reportRows.length,
      storage: WRITE_AGENT_REPORTS_TO_SHEETS ? 'database+google_sheets' : 'database',
      message: `Mark готов: отчёт по ${reportRows.length} продуктам сохранён в БД.`,
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

async function saveReportToDb(runId, rows) {
  const objects = rows.map(r => ({
    date: r[0],
    sku: r[1],
    product: r[2],
    category: r[3],
    query: r[4],
    source: r[5],
    price: r[6],
    currency: r[7],
    confidence: r[8],
    status: r[9],
    recommendation: r[10],
  }));
  await db.run(`
    INSERT INTO agent_reports (agent_id, report_type, run_id, payload_json)
    VALUES ('mark', 'market_scan', ?, ?)
  `, [runId, JSON.stringify({ rows: objects })]);
}

async function writeReport(rows) {
  if (!WRITE_AGENT_REPORTS_TO_SHEETS) return;
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
  const sources = await discoverSources(product, query);
  if (!sources.length) {
    return {
      source: '',
      price: '',
      currency: '',
      confidence: 'low',
      status: 'source_missing',
      recommendation: 'Нет валидного источника для анализа. Добавьте URL в Mark Sources или подключите SERPAPI_KEY / GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX.',
    };
  }
  const source = sources[0];

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

async function discoverSources(product, query) {
  const configured = await getConfiguredSources(product, query);
  if (configured.length) return configured;

  const serpapi = await searchWithSerpApi(query);
  if (serpapi.length) return serpapi;

  const cse = await searchWithGoogleCse(query);
  if (cse.length) return cse;

  return [];
}

async function searchWithSerpApi(query) {
  if (!SERPAPI_KEY) return [];
  try {
    const res = await axios.get('https://serpapi.com/search.json', {
      timeout: 9000,
      params: {
        engine: 'google',
        q: query,
        hl: 'bg',
        gl: 'bg',
        num: 5,
        api_key: SERPAPI_KEY,
      },
    });
    return (res.data?.organic_results || [])
      .map(item => item?.link)
      .filter(isValidHttpUrl)
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function searchWithGoogleCse(query) {
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) return [];
  try {
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      timeout: 9000,
      params: {
        key: GOOGLE_CSE_API_KEY,
        cx: GOOGLE_CSE_CX,
        q: query,
        num: 5,
        gl: 'bg',
        hl: 'bg',
      },
    });
    return (res.data?.items || [])
      .map(item => item?.link)
      .filter(isValidHttpUrl)
      .slice(0, 3);
  } catch {
    return [];
  }
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

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function latestRun() {
  await ensureAgentTables();
  const row = await db.get(`
    SELECT * FROM agent_runs
    WHERE agent_id = 'mark'
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
