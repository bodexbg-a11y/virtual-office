const axios = require('axios');
const db = require('../db');

const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY || '';
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || '';
const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
const EUR_TO_BGN = 1.95583;
let activeRun = null;

const MARKET_CATEGORIES = [
  {
    id: 'injection-pu-resin',
    name: 'Инжекционные полиуретановые смолы',
    family: 'Полимерные / PU injection',
    unit: 'kg',
    bgQuery: 'полиуретанова инжекционна смола цена България kg',
    euQuery: 'polyurethane injection resin price Europe kg',
    note: 'Для остановки течей, бетонных трещин и гидроизоляции.',
  },
  {
    id: 'injection-epoxy-resin',
    name: 'Инжекционные эпоксидные смолы',
    family: 'Полимерные / Epoxy injection',
    unit: 'kg',
    bgQuery: 'епоксидна инжекционна смола цена България kg',
    euQuery: 'epoxy injection resin price Europe kg',
    note: 'Для структурного ремонта бетона и заполнения трещин.',
  },
  {
    id: 'acrylic-injection-gel',
    name: 'Акрилатные инжекционные гели',
    family: 'Полимерные / Acrylic gel',
    unit: 'kg',
    bgQuery: 'акрилатен инжекционен гел цена България kg',
    euQuery: 'acrylic injection gel price Europe kg',
    note: 'Для curtain injection, деформационных швов и грунтовой воды.',
  },
  {
    id: 'polymer-cement-waterproofing',
    name: 'Полимер-цементная гидроизоляция',
    family: 'Полимерцементные материалы',
    unit: 'kg',
    bgQuery: 'полимер циментова хидроизолация цена България kg',
    euQuery: 'polymer cement waterproofing price Europe kg',
    note: 'Для поверхностной гидроизоляции бетона и фундамента.',
  },
  {
    id: 'injection-packers',
    name: 'Инжекционные пакеры',
    family: 'Инъекционное оборудование',
    unit: 'pcs',
    bgQuery: 'инжекционни пакери цена България',
    euQuery: 'injection packers price Europe',
    note: 'Расходник к смолам, важен для комплексного коммерческого предложения.',
  },
  {
    id: 'injection-pumps',
    name: 'Инжекционные насосы',
    family: 'Инъекционное оборудование',
    unit: 'pcs',
    bgQuery: 'инжекционна помпа цена България',
    euQuery: 'injection pump price Europe',
    note: 'Оборудование для подрядчиков, можно использовать как B2B upsell.',
  },
];

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
    const reportRows = [];
    for (const category of MARKET_CATEGORIES) {
      const result = await scanCategoryMarket(category);
      reportRows.push(result);
    }

    await saveReportToDb(runId, reportRows);
    await db.run(`
      UPDATE agent_runs
      SET status = 'done', message = ?, rows_created = ?, finished_at = NOW()
      WHERE id = ?
    `, [`Готов ценовой отчёт по ${reportRows.length} категориям материалов`, reportRows.length, runId]);

    return {
      success: true,
      run_id: runId,
      rows: reportRows.length,
      storage: 'database+html',
      message: `Mark готов: ценовой HTML-отчёт по ${reportRows.length} категориям сохранён в БД.`,
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
  await db.run(`
    INSERT INTO agent_reports (agent_id, report_type, run_id, payload_json)
    VALUES ('mark', 'market_scan', ?, ?)
  `, [runId, JSON.stringify({
    summary: buildPriceSummary(rows),
    rows,
    html: buildHtmlReport(rows, runId),
  })]);
}

async function scanCategoryMarket(category) {
  const bg = await scanMarketScope(category, 'bg', category.bgQuery);
  const eu = await scanMarketScope(category, 'eu', category.euQuery);
  const markup = recommendMarkup(bg, eu);

  return {
    date: new Date().toISOString(),
    category_id: category.id,
    category: category.name,
    family: category.family,
    unit: category.unit,
    bg_query: category.bgQuery,
    eu_query: category.euQuery,
    bg_price_min: bg.min || '',
    bg_price_max: bg.max || '',
    bg_avg_bgn: bg.avg_bgn || '',
    eu_price_min: eu.min || '',
    eu_price_max: eu.max || '',
    eu_avg_bgn: eu.avg_bgn || '',
    currency_note: 'BGN normalized; EUR converted at 1.95583',
    bg_sources: bg.sources.join('\n'),
    eu_sources: eu.sources.join('\n'),
    confidence: confidenceFromScopes(bg, eu),
    status: statusFromScopes(bg, eu),
    recommended_markup_pct: markup.range,
    recommended_pricing_logic: markup.logic,
    recommendation: markup.recommendation,
    note: category.note,
  };
}

async function scanMarketScope(category, scope, query) {
  const sources = await discoverSources(query, scope);
  const prices = [];
  const sourceNotes = [];

  for (const source of sources.slice(0, 4)) {
    try {
      const html = await fetchHtml(source);
      const found = extractPrices(html)
        .map(price => ({ ...price, source }))
        .filter(price => isReasonablePrice(price, category.unit));

      prices.push(...found);
      sourceNotes.push(`${source}${found.length ? ` (${found.map(p => `${p.value} ${p.currency}`).join(', ')})` : ' (цена не распознана)'}`);
    } catch (err) {
      sourceNotes.push(`${source} (scan error: ${err.message})`);
    }
  }

  const normalized = prices.map(price => ({
    ...price,
    bgn: normalizePriceToBgn(price),
  })).filter(price => Number.isFinite(price.bgn));

  normalized.sort((a, b) => a.bgn - b.bgn);
  const values = normalized.map(p => p.bgn);

  return {
    scope,
    query,
    unit: category.unit,
    sources: sourceNotes,
    prices: normalized,
    min: values.length ? roundMoney(values[0]) : '',
    max: values.length ? roundMoney(values[values.length - 1]) : '',
    avg_bgn: values.length ? roundMoney(values.reduce((sum, value) => sum + value, 0) / values.length) : '',
  };
}

function recommendMarkup(bg, eu) {
  const bgAvg = Number(bg.avg_bgn || 0);
  const euAvg = Number(eu.avg_bgn || 0);

  if (!bgAvg && !euAvg) {
    return {
      range: 'нет данных',
      logic: 'Недостаточно рыночных цен для расчёта.',
      recommendation: 'Добавить SERPAPI_KEY или Google CSE на Render и/или прямые URL конкурентов, затем повторить отчёт.',
    };
  }

  const base = euAvg || bgAvg;
  const bgGap = bgAvg && euAvg ? Math.round(((bgAvg - euAvg) / euAvg) * 100) : null;

  if (bgGap !== null && bgGap >= 35) {
    return {
      range: '25-40%',
      logic: `Болгарский рынок примерно на ${bgGap}% выше европейского ориентира; есть место для конкурентной цены.`,
      recommendation: `Держать BODEX ниже средней BG цены на 5-10%, но выше европейской закупочной базы. Ориентир продажи: ${roundMoney(base * 1.25)}-${roundMoney(base * 1.4)} BGN/${bg.unit || 'unit'}.`,
    };
  }

  if (bgGap !== null && bgGap <= 10) {
    return {
      range: '15-25%',
      logic: `Разница BG/EU небольшая (${bgGap}%), рынок чувствителен к цене.`,
      recommendation: `Ставить умеренную наценку и выигрывать сервисом: наличие, доставка, консультация. Ориентир продажи: ${roundMoney(base * 1.15)}-${roundMoney(base * 1.25)} BGN/${bg.unit || 'unit'}.`,
    };
  }

  return {
    range: '20-35%',
    logic: bgGap === null ? 'Есть только один рынок для ориентира.' : `BG/EU gap около ${bgGap}%.`,
    recommendation: `Оптимально тестировать наценку 20-35%, отдельно для B2B объёма давать скидку. Ориентир продажи: ${roundMoney(base * 1.2)}-${roundMoney(base * 1.35)} BGN.`,
  };
}

function confidenceFromScopes(bg, eu) {
  const count = (bg.prices?.length || 0) + (eu.prices?.length || 0);
  if (count >= 4) return 'medium';
  if (count >= 2) return 'low-medium';
  return 'low';
}

function statusFromScopes(bg, eu) {
  const count = (bg.prices?.length || 0) + (eu.prices?.length || 0);
  if (count >= 2) return 'price_range_found';
  if ((bg.sources?.length || 0) + (eu.sources?.length || 0) > 0) return 'sources_found_no_clear_price';
  return 'source_missing';
}

async function discoverSources(query, scope) {
  const serpapi = await searchWithSerpApi(query, scope);
  if (serpapi.length) return serpapi;

  const cse = await searchWithGoogleCse(query, scope);
  if (cse.length) return cse;

  return [];
}

async function searchWithSerpApi(query, scope = 'bg') {
  if (!SERPAPI_KEY) return [];
  try {
    const res = await axios.get('https://serpapi.com/search.json', {
      timeout: 9000,
      params: {
        engine: 'google',
        q: query,
        hl: scope === 'bg' ? 'bg' : 'en',
        gl: scope === 'bg' ? 'bg' : 'de',
        num: 8,
        api_key: SERPAPI_KEY,
      },
    });
    return (res.data?.organic_results || [])
      .map(item => item?.link)
      .filter(isValidHttpUrl)
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function searchWithGoogleCse(query, scope = 'bg') {
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) return [];
  try {
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      timeout: 9000,
      params: {
        key: GOOGLE_CSE_API_KEY,
        cx: GOOGLE_CSE_CX,
        q: query,
        num: 8,
        gl: scope === 'bg' ? 'bg' : 'de',
        hl: scope === 'bg' ? 'bg' : 'en',
      },
    });
    return (res.data?.items || [])
      .map(item => item?.link)
      .filter(isValidHttpUrl)
      .slice(0, 5);
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

function extractPrices(html) {
  const text = htmlToText(html);
  const matches = [...text.matchAll(/(?:цена|price|preis)?\s*([0-9]{1,5}(?:[,.][0-9]{1,2})?)\s*(лв\.?|bgn|eur|€)/gi)];
  return matches.slice(0, 12).map(match => ({
    value: Number(String(match[1]).replace(',', '.')),
    currency: normalizeCurrency(match[2]),
  })).filter(price => Number.isFinite(price.value));
}

function isReasonablePrice(price, unit) {
  if (!price.value || price.value <= 0) return false;
  if (unit === 'pcs') return price.value >= 0.1 && price.value <= 20000;
  return price.value >= 0.1 && price.value <= 1000;
}

function normalizePriceToBgn(price) {
  if (price.currency === 'EUR') return price.value * EUR_TO_BGN;
  if (price.currency === 'BGN') return price.value;
  return NaN;
}

function roundMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : '';
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
    <div class="card"><div class="muted">Категорий</div><div class="num">${totals.total || 0}</div></div>
    <div class="card"><div class="muted">Диапазон цен найден</div><div class="num">${totals.price_range_found || 0}</div></div>
    <div class="card"><div class="muted">Нужна ручная проверка</div><div class="num">${totals.sources_found_no_clear_price || 0}</div></div>
    <div class="card"><div class="muted">Нет источника</div><div class="num">${totals.source_missing || 0}</div></div>
  </section>
  <table>
    <thead><tr><th>Категория</th><th>BG рынок</th><th>EU рынок</th><th>Наценка</th><th>Статус</th><th>Рекомендация</th><th>Источники</th></tr></thead>
    <tbody>
      ${rows.map(row => `<tr>
        <td><strong>${escapeHtml(row.category)}</strong><br><span class="muted">${escapeHtml(row.family)} · ${escapeHtml(row.unit)}</span><br>${escapeHtml(row.note)}</td>
        <td>${priceRangeText(row.bg_price_min, row.bg_price_max, row.bg_avg_bgn)}<br><span class="muted">${escapeHtml(row.bg_query)}</span></td>
        <td>${priceRangeText(row.eu_price_min, row.eu_price_max, row.eu_avg_bgn)}<br><span class="muted">${escapeHtml(row.eu_query)}</span></td>
        <td><strong>${escapeHtml(row.recommended_markup_pct)}</strong><br><span class="muted">${escapeHtml(row.recommended_pricing_logic)}</span></td>
        <td><span class="pill ${escapeAttr(row.status)}">${escapeHtml(row.status)}</span></td>
        <td>${escapeHtml(row.recommendation)}</td>
        <td><pre>${escapeHtml([row.bg_sources, row.eu_sources].filter(Boolean).join('\n\n'))}</pre></td>
      </tr>`).join('')}
    </tbody>
  </table>
</main>
</body>
</html>`;
}

function buildPriceSummary(rows) {
  const priced = rows.filter(r => r.status === 'price_range_found').length;
  return `Mark проверил ${rows.length} категорий: найден ценовой диапазон по ${priced}, остальные требуют ручной проверки источников. Цель отчёта: определить рыночный коридор BG/EU и оптимальную наценку BODEX.`;
}

function priceRangeText(min, max, avg) {
  if (!min && !max && !avg) return '—';
  return `${escapeHtml(min || '—')} - ${escapeHtml(max || '—')} BGN<br><span class="muted">avg ${escapeHtml(avg || '—')} BGN</span>`;
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
