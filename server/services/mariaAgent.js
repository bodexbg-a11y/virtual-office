const db = require('../db');
const facebookAds = require('./facebookAds');

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
    VALUES ('maria', 'running', 'Maria синхронизирует Facebook Ads и считает CPL/CTR/CPC')
    RETURNING id
  `);
  const runId = runInfo.lastInsertRowid;

  try {
    await facebookAds.syncCampaigns();
    const campaigns = await facebookAds.getCampaigns();
    const rows = campaigns.map(analyzeCampaign);
    const overview = buildOverview(rows);
    await saveReportToDb(runId, rows, overview);

    const summary = overview.summary;
    await db.run(`
      UPDATE agent_runs
      SET status = 'done', message = ?, rows_created = ?, finished_at = NOW()
      WHERE id = ?
    `, [summary, rows.length, runId]);

    return {
      success: true,
      run_id: runId,
      rows: rows.length,
      storage: 'database+html',
      message: summary,
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

async function getAnalysis() {
  await ensureAgentTables();
  const latestStored = await db.get(`
    SELECT payload_json
    FROM agent_reports
    WHERE agent_id = 'maria' AND report_type = 'ads_analysis'
    ORDER BY id DESC
    LIMIT 1
  `);
  if (latestStored?.payload_json) {
    const payload = JSON.parse(latestStored.payload_json);
    return {
      summary: payload.summary || '',
      overview: payload.overview || {},
      rows: payload.rows || [],
      latest: await latestRun(),
    };
  }

  const campaigns = await facebookAds.getCampaigns();
  const rows = campaigns.map(analyzeCampaign);
  const overview = buildOverview(rows);
  return {
    summary: overview.summary,
    overview,
    rows,
    latest: await latestRun(),
  };
}

function analyzeCampaign(campaign) {
  const spend = Number(campaign.spend || 0);
  const leads = Number(campaign.leads_count || 0);
  const cpl = Number(campaign.cost_per_lead || 0);
  const ctr = Number(campaign.ctr || 0);
  const clicks = Number(campaign.clicks || 0);
  const impressions = Number(campaign.impressions || 0);
  const active = campaign.status === 'ACTIVE';

  let verdict = 'Наблюдать';
  let recommendation = 'Данных пока мало. Держать кампанию под наблюдением и собрать больше кликов/лидов.';

  if (!active && leads > 0 && cpl > 0 && cpl <= 8) {
    verdict = 'Запустить снова';
    recommendation = 'Кампания на паузе, но исторически даёт дешёвые лиды. Можно запустить с небольшим дневным бюджетом и контролем качества лидов.';
  } else if (!active && leads > 0) {
    verdict = 'Тестово запустить';
    recommendation = 'Кампания на паузе, но лиды были. Запускать только тестом: ограничить бюджет, проверить аудиторию и качество заявок.';
  } else if (!active) {
    verdict = 'Не запускать';
    recommendation = 'Кампания на паузе и нет убедительного выхлопа. Не запускать без нового оффера/креатива.';
  } else if (spend > 0 && leads === 0 && clicks >= 20) {
    verdict = 'Плохо';
    recommendation = 'Остановить или заменить аудиторию/креатив: есть клики и расход, но нет лидов.';
  } else if (leads > 0 && cpl > 80) {
    verdict = 'Дорого';
    recommendation = 'Снизить CPL: сузить аудиторию, поменять оффер, протестировать новый креатив и форму заявки.';
  } else if (leads > 0 && cpl <= 50 && ctr >= 1) {
    verdict = 'Эффективно';
    recommendation = 'Можно масштабировать бюджет постепенно на 15-25%, сохраняя контроль CPL.';
  } else if (ctr > 0 && ctr < 0.7 && impressions >= 1000) {
    verdict = 'Слабый CTR';
    recommendation = 'Заменить креатив/первую строку текста. Объявление показывается, но плохо цепляет аудиторию.';
  } else if (leads > 0) {
    verdict = 'Работает';
    recommendation = 'Продолжать и проверить качество лидов у Ростислава: дозвон, интерес, оферта.';
  }

  const playbook = campaignPlaybook({
    name: campaign.name,
    leads,
    cpl,
    ctr,
    verdict,
  });

  return {
    date: new Date().toISOString(),
    campaign_id: campaign.fb_campaign_id,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective || '',
    impressions,
    clicks,
    ctr,
    cpc: Number(campaign.cpc || 0),
    spend,
    leads,
    cpl,
    verdict,
    recommendation,
    quality_signal: playbook.quality_signal,
    audience_recommendation: playbook.audience_recommendation,
    creative_recommendation: playbook.creative_recommendation,
    conversion_recommendation: playbook.conversion_recommendation,
    launch_plan: playbook.launch_plan,
  };
}

function summarize(rows) {
  return buildOverview(rows).summary;
}

function campaignPlaybook(row) {
  const name = String(row.name || '').toLowerCase();
  const common = {
    quality_signal: row.leads >= 10 && row.cpl <= 8
      ? 'Лидов много и CPL низкий, но качество нужно проверить звонками: дешёвый лид не всегда готов купить.'
      : 'Лидов мало или CPL выше лучшей кампании, качество нужно валидировать вручную.',
    audience_recommendation: 'Сузить аудиторию до B2B: строителни фирми, хидроизолация, ремонт бетон, тунели, фундаменти, дистрибутори материалов.',
    creative_recommendation: 'Креатив должен показывать конкретную проблему: течь, бетонная трещина, инъекционная смола, результат до/после и быстрый расчёт цены.',
    conversion_recommendation: 'Добавить квалифицирующие вопросы в lead form: объект, материал, объём, срок, город, телефон/Viber.',
    launch_plan: 'Запускать тестом 24-48 часов, бюджет ограничить, после первых лидов Ростислав проверяет качество.',
  };

  if (name.includes('material')) {
    return {
      quality_signal: 'Лучший CPL и больше всего лидов, но качество может быть средним: часть людей может искать розничную цену, а не B2B поставку.',
      audience_recommendation: 'Оставить Materials как главный тест, но отфильтровать аудиторию: строителни компании, снабдители, дистрибуторы, ремонт бетон/хидроизолация. Исключить слишком широкую “строительные материалы для дома”.',
      creative_recommendation: 'Сделать креатив не “материалы вообще”, а “инъекционные смолы и пакеры для профессионального ремонта течей”. Добавить фото упаковки, применение, B2B доставка по Болгарии.',
      conversion_recommendation: 'В форму добавить: “Вы компания или частное лицо?”, “Какой объект?”, “Какой материал нужен?”, “Объём закупки?”. Это снизит мусорные лиды.',
      launch_plan: 'Золотой запуск: включить Materials первой с небольшим бюджетом, смотреть не только CPL, а долю качественных B2B лидов после звонков Ростислава.',
    };
  }

  if (name.includes('услуг') || name.includes('service')) {
    return {
      ...common,
      audience_recommendation: 'Для услуг делать аудиторию по проблеме: течи, подземные паркинги, фундаменты, тунели, промышленные объекты. Не смешивать с продажей материалов.',
      creative_recommendation: 'Креатив должен продавать диагностику/решение проблемы, а не каталог. Лучше: “Теч в бетон? Получете решение и оферта”.',
      conversion_recommendation: 'Форма: тип объекта, проблема, фото/описание, город, срочность. Так лиды будут понятнее для Ростислава.',
      launch_plan: 'Запускать отдельно от Materials, потому что это другой спрос: не покупка материала, а заявка на услугу/решение.',
    };
  }

  if (name.includes('bodex')) {
    return {
      ...common,
      audience_recommendation: 'Bodex BG MAY использовать как общий брендовый ретаргетинг или тест доверия, но не как главный лидогенератор.',
      creative_recommendation: 'Добавить конкретику: продукты, кейсы, доставка, B2B условия. Общий бренд без оффера обычно даёт дороже.',
      conversion_recommendation: 'Проверить, какие лиды пришли: если они слабые, заменить оффер на конкретный продукт или проблему.',
      launch_plan: 'Не запускать первой. Использовать после Materials/Услуги как поддерживающую кампанию или ретаргетинг.',
    };
  }

  return common;
}

function buildOverview(rows) {
  const active = rows.filter(r => r.status === 'ACTIVE').length;
  const spend = rows.reduce((sum, r) => sum + r.spend, 0);
  const leads = rows.reduce((sum, r) => sum + r.leads, 0);
  const avgCpl = leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0;
  const bad = rows.filter(r => ['Плохо', 'Дорого', 'Слабый CTR'].includes(r.verdict)).length;
  const sortedByLeads = [...rows].sort((a, b) => b.leads - a.leads);
  const sortedByCpl = [...rows].filter(r => r.leads > 0).sort((a, b) => a.cpl - b.cpl);
  const best = sortedByCpl[0] || sortedByLeads[0] || null;
  const weakest = sortedByCpl.length ? sortedByCpl[sortedByCpl.length - 1] : null;
  const launch = rows.filter(r => ['Запустить снова', 'Тестово запустить', 'Эффективно', 'Работает'].includes(r.verdict));
  const optimize = rows.filter(r => ['Дорого', 'Слабый CTR', 'Наблюдать'].includes(r.verdict));
  const stop = rows.filter(r => ['Плохо', 'Не запускать'].includes(r.verdict));

  const nextActions = [];
  if (best) {
    nextActions.push(`Первым тестировать/возобновить “${best.name}”: ${best.leads} лидов, CPL $${best.cpl}.`);
  }
  if (weakest && best && weakest.campaign_id !== best.campaign_id) {
    nextActions.push(`“${weakest.name}” запускать осторожно: CPL $${weakest.cpl}, сначала проверить качество лидов.`);
  }
  if (!active && launch.length) {
    nextActions.push('Сейчас активных кампаний нет. Запускать не всё сразу: начать с 1 лучшей кампании и смотреть CPL первые 24-48 часов.');
  }
  if (leads > 0) {
    nextActions.push('Передать все новые FB лиды Ростиславу: звонок/Viber, статус, качество лида и причина отказа/интереса.');
  }

  return {
    summary: `Maria готова: ${rows.length} кампаний, активных ${active}, spend $${spend.toFixed(2)}, leads ${leads}, CPL $${avgCpl}, требуют внимания ${bad}.`,
    total_campaigns: rows.length,
    active_campaigns: active,
    spend: Number(spend.toFixed(2)),
    leads,
    avg_cpl: avgCpl,
    avg_ctr: rows.length ? Math.round((rows.reduce((sum, r) => sum + r.ctr, 0) / rows.length) * 100) / 100 : 0,
    best_campaign: best,
    weakest_campaign: weakest,
    golden_recommendation: best
      ? `Золотая рекомендация Maria: запускать сейчас “${best.name}”, но с фильтрацией качества лидов. Цель не просто дешёвый CPL, а B2B лиды, которым реально нужны материалы/поставка.`
      : 'Золотая рекомендация Maria: сначала собрать данные по кампаниям, потом запускать лучший тест.',
    launch,
    optimize,
    stop,
    next_actions: nextActions,
  };
}

async function saveReportToDb(runId, rows, overview) {
  await db.run(`
    INSERT INTO agent_reports (agent_id, report_type, run_id, payload_json)
    VALUES ('maria', 'ads_analysis', ?, ?)
  `, [runId, JSON.stringify({
    summary: overview.summary,
    overview,
    rows,
    html: buildHtmlReport(rows, overview, runId),
  })]);
}

function buildHtmlReport(rows, overview, runId) {
  const generatedAt = new Date().toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' });
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BODEX Maria Ads Report #${escapeHtml(runId)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#08081a;color:#f4f4f5}
    main{max-width:1180px;margin:0 auto;padding:32px}
    h1{margin:0 0 8px;font-size:28px}
    .muted{color:#a1a1aa}
    .summary{border:1px solid #242449;background:#121229;border-radius:10px;padding:16px;margin:22px 0;line-height:1.55}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}
    .card{border:1px solid #242449;background:#121229;border-radius:10px;padding:16px}
    .num{font-size:28px;font-weight:800;color:#8b8cff}
    table{width:100%;border-collapse:collapse;background:#101025;border:1px solid #242449}
    th,td{padding:10px;border-bottom:1px solid #242449;text-align:left;vertical-align:top;font-size:13px}
    th{color:#a1a1aa;text-transform:uppercase;font-size:11px;letter-spacing:.08em}
    .pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#1f2937;color:#e5e7eb;font-weight:700}
  </style>
</head>
<body>
<main>
  <h1>BODEX · Maria Ads Report</h1>
  <div class="muted">Run #${escapeHtml(runId)} · ${escapeHtml(generatedAt)} · хранится в БД, без Google Sheets</div>
  <section class="stats">
    <div class="card"><div class="muted">Кампаний</div><div class="num">${overview.total_campaigns || 0}</div></div>
    <div class="card"><div class="muted">Spend</div><div class="num">$${overview.spend || 0}</div></div>
    <div class="card"><div class="muted">Leads</div><div class="num">${overview.leads || 0}</div></div>
    <div class="card"><div class="muted">Avg CPL</div><div class="num">$${overview.avg_cpl || 0}</div></div>
  </section>
  <div class="summary"><strong>Золотая рекомендация:</strong><br>${escapeHtml(overview.golden_recommendation || overview.summary || '')}</div>
  <table>
    <thead><tr><th>Кампания</th><th>Статус</th><th>Spend</th><th>Leads</th><th>CPL</th><th>CTR</th><th>Оценка</th><th>Рекомендация</th><th>Аудитория/креатив</th></tr></thead>
    <tbody>
      ${rows.map(row => `<tr>
        <td><strong>${escapeHtml(row.name)}</strong><br><span class="muted">${escapeHtml(row.campaign_id)}</span></td>
        <td>${escapeHtml(row.status)}</td>
        <td>$${escapeHtml(row.spend)}</td>
        <td>${escapeHtml(row.leads)}</td>
        <td>$${escapeHtml(row.cpl)}</td>
        <td>${escapeHtml(row.ctr)}%</td>
        <td><span class="pill">${escapeHtml(row.verdict)}</span></td>
        <td>${escapeHtml(row.recommendation)}</td>
        <td>${escapeHtml(row.audience_recommendation)}<br><br>${escapeHtml(row.creative_recommendation)}</td>
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

async function latestRun() {
  await ensureAgentTables();
  const row = await db.get(`
    SELECT * FROM agent_runs
    WHERE agent_id = 'maria'
    ORDER BY id DESC
    LIMIT 1
  `);
  return row || null;
}

module.exports = {
  run,
  isRunning: () => Boolean(activeRun),
  latestRun,
  getAnalysis,
};
