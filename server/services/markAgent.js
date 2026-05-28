const axios = require('axios');
const db = require('../db');

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
      SELECT sku, name, name_bg, category, description_bg, source_url
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
    await db.run(`
      UPDATE agent_runs
      SET status = 'done', message = ?, rows_created = ?, finished_at = NOW()
      WHERE id = ?
    `, [`Готов отчёт по ${reportRows.length} продуктам`, reportRows.length, runId]);

    return {
      success: true,
      run_id: runId,
      rows: reportRows.length,
      storage: 'database+html',
      message: `Mark готов: HTML-отчёт по ${reportRows.length} продуктам сохранён в БД.`,
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
  `, [runId, JSON.stringify({
    rows: objects,
    html: buildHtmlReport(objects, runId),
  })]);
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
      recommendation: 'Нет валидного источника для анализа. Добавьте SERPAPI_KEY или GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX на Render, либо заполните source_url у продуктов.',
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
        : 'Источник найден, но цена не распознана. Mark должен проверить вручную и добавить точный URL в карточку продукта.',
    };
  } catch (err) {
    return {
      source,
      price: '',
      currency: '',
      confidence: 'low',
      status: 'scan_error',
      recommendation: `Не удалось автоматически прочитать источник: ${err.message}. Добавьте прямой URL поставщика/конкурента в карточку продукта.`,
    };
  }
}

async function getConfiguredSources(product, query) {
  const urls = [product.source_url, process.env.MARK_DEFAULT_SOURCE_URL]
    .filter(isValidHttpUrl);
  return [...new Set(urls)];
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

function buildHtmlReport(rows, runId) {
  const generatedAt = new Date().toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' });
  const totals = rows.reduce((acc, row) => {
    acc.total += 1;
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, { total: 0 });

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BODEX Mark Market Report #${escapeHtml(runId)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#08081a;color:#f4f4f5}
    main{max-width:1180px;margin:0 auto;padding:32px}
    h1{margin:0 0 8px;font-size:28px}
    .muted{color:#a1a1aa}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}
    .card{border:1px solid #242449;background:#121229;border-radius:10px;padding:16px}
    .num{font-size:28px;font-weight:800;color:#8b8cff}
    table{width:100%;border-collapse:collapse;background:#101025;border:1px solid #242449}
    th,td{padding:10px;border-bottom:1px solid #242449;text-align:left;vertical-align:top;font-size:13px}
    th{color:#a1a1aa;text-transform:uppercase;font-size:11px;letter-spacing:.08em}
    a{color:#7dd3fc}
    .pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#1f2937;color:#e5e7eb;font-weight:700}
    .price_found{background:#14532d;color:#bbf7d0}
    .source_missing,.scan_error{background:#7f1d1d;color:#fecaca}
    .no_clear_price{background:#713f12;color:#fde68a}
  </style>
</head>
<body>
<main>
  <h1>BODEX · Mark Market Report</h1>
  <div class="muted">Run #${escapeHtml(runId)} · ${escapeHtml(generatedAt)} · хранится в БД, без Google Sheets</div>
  <section class="stats">
    <div class="card"><div class="muted">Продуктов</div><div class="num">${totals.total || 0}</div></div>
    <div class="card"><div class="muted">Цена найдена</div><div class="num">${totals.price_found || 0}</div></div>
    <div class="card"><div class="muted">Нужна ручная проверка</div><div class="num">${totals.no_clear_price || 0}</div></div>
    <div class="card"><div class="muted">Нет источника</div><div class="num">${totals.source_missing || 0}</div></div>
  </section>
  <table>
    <thead><tr><th>SKU</th><th>Продукт</th><th>Категория</th><th>Запрос</th><th>Источник</th><th>Цена</th><th>Статус</th><th>Рекомендация</th></tr></thead>
    <tbody>
      ${rows.map(row => `<tr>
        <td>${escapeHtml(row.sku)}</td>
        <td><strong>${escapeHtml(row.product)}</strong></td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(row.query)}</td>
        <td>${row.source ? `<a href="${escapeAttr(row.source)}" target="_blank" rel="noreferrer">${escapeHtml(row.source)}</a>` : '—'}</td>
        <td>${row.price ? `${escapeHtml(row.price)} ${escapeHtml(row.currency)}` : '—'}</td>
        <td><span class="pill ${escapeAttr(row.status)}">${escapeHtml(row.status)}</span></td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
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
