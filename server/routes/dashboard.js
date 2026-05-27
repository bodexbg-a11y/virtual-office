const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../services/auth');

const DEAL_STAGES = [
  { id: 'new', label: 'Новый лид', short: 'Новый' },
  { id: 'interested', label: 'Интерес / горячий', short: 'Интерес' },
  { id: 'catalog_sent', label: 'Каталог / презентация', short: 'Каталог' },
  { id: 'thinking', label: 'Думают', short: 'Думают' },
  { id: 'offer_sent', label: 'Коммерческое предложение', short: 'КП' },
  { id: 'negotiation', label: 'Переговоры', short: 'Переговоры' },
  { id: 'contract', label: 'Договор', short: 'Договор' },
  { id: 'purchase', label: 'Закупка', short: 'Закупка' },
  { id: 'won', label: 'Закрыто успешно', short: 'Закрыто' },
  { id: 'lost', label: 'Отказ / неактуально', short: 'Отказ' },
];

const DEAL_SECTIONS = [
  { id: 'materials', label: 'Материалы', description: 'МАТЕРИАЛЫ', sheets: ['МАТЕРИАЛЫ'] },
  { id: 'services', label: 'Услуги', description: 'УСЛУГИ и ПРОЕКТЫ', sheets: ['УСЛУГИ', 'ПРОЕКТЫ'] },
];

const WORKERS = [
  {
    id: 'rostislav',
    name: 'Ростислав',
    type: 'human',
    role: 'Главный менеджер',
    avatar_emoji: '📞',
    color: '#f59e0b',
    mission: 'Звонить клиентам, писать в Viber, вести лиды и доводить их до следующего действия.',
  },
  {
    id: 'mark',
    name: 'Mark',
    type: 'ai',
    role: 'Research Manager',
    avatar_emoji: '🔎',
    color: '#42a5f5',
    mission: 'Сканировать рынок, смотреть цены на материалы и готовить отчёт в таблице.',
  },
  {
    id: 'maria',
    name: 'Maria',
    type: 'ai',
    role: 'Facebook Ads Manager',
    avatar_emoji: '📢',
    color: '#ec4899',
    mission: 'Делать отчёты по рекламным кампаниям, анализировать результаты и давать рекомендации.',
  },
  {
    id: 'steve',
    name: 'Steve',
    type: 'ai',
    role: 'SEO анализатор',
    avatar_emoji: '🌐',
    color: '#10b981',
    mission: 'Анализировать bodexbg.com, SEO позиции, контент и технические улучшения сайта.',
  },
];

async function ensureWorkers() {
  await db.exec(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS worker_code TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_worker_code ON agents(worker_code);

    CREATE TABLE IF NOT EXISTS worker_results (
      id SERIAL PRIMARY KEY,
      worker_id TEXT NOT NULL,
      title TEXT NOT NULL,
      value TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS worker_tasks (
      id SERIAL PRIMARY KEY,
      worker_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      source TEXT DEFAULT 'admin',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'todo',
      due_date TEXT DEFAULT (CURRENT_DATE),
      assigned_by TEXT DEFAULT 'admin',
      result_note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_worker_tasks_worker ON worker_tasks(worker_id);
    CREATE INDEX IF NOT EXISTS idx_worker_tasks_due ON worker_tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_worker_tasks_status ON worker_tasks(status);

    CREATE TABLE IF NOT EXISTS worker_task_events (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES worker_tasks(id) ON DELETE CASCADE,
      worker_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      note TEXT,
      changed_by TEXT DEFAULT 'system',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_worker_task_events_task ON worker_task_events(task_id);
    CREATE INDEX IF NOT EXISTS idx_worker_task_events_worker ON worker_task_events(worker_id);
  `);

  const currentTasks = {
    rostislav: 'Обработва топли клиенти и B2B контакти без статус',
    mark: 'Сравнява пазарни цени и конкурентни оферти',
    maria: 'Анализира Facebook кампании, CPL и CTR',
    steve: 'Проверява SEO задачи за bodexbg.com',
  };
  for (const w of WORKERS) {
    await db.run(`
      INSERT INTO agents (worker_code, name, role, avatar_emoji, color, status, current_task, tasks_completed, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW())
      ON CONFLICT(worker_code) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        avatar_emoji = EXCLUDED.avatar_emoji,
        color = EXCLUDED.color,
        current_task = EXCLUDED.current_task,
        last_active_at = NOW()
    `, [w.id, w.name, w.role, w.avatar_emoji, w.color, 'online', currentTasks[w.id]]);
  }
}

async function ensureDealOverrides() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS deal_status_overrides (
      sheet_name TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      stage_id TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (sheet_name, row_number)
    );
  `);
}

async function workerData() {
  await ensureWorkers();
  const clients = await safeGet(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IS NULL OR status = '' THEN 1 ELSE 0 END) as no_status,
      SUM(CASE WHEN priority IN ('hot','high') THEN 1 ELSE 0 END) as high_priority,
      SUM(CASE WHEN LOWER(COALESCE(status,'') || ' ' || COALESCE(interest,'') || ' ' || COALESCE(problem,'') || ' ' || COALESCE(notes,'')) LIKE '%интерес%' THEN 1 ELSE 0 END) as interested,
      SUM(CASE WHEN sheet_name = 'b2b' THEN 1 ELSE 0 END) as b2b
    FROM sheet_clients
  `);
  const leads = await safeGet(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_leads,
      SUM(CASE WHEN status IN ('qualified','offer_sent','negotiation') THEN 1 ELSE 0 END) as active,
      COALESCE(SUM(CASE WHEN status != 'lost' THEN estimated_value ELSE 0 END), 0) as pipeline
    FROM leads
  `);
  const fb = await safeGet(`
    SELECT
      COUNT(*) as campaigns,
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_campaigns,
      COALESCE(SUM(spend), 0) as spend,
      COALESCE(SUM(leads_count), 0) as leads,
      ROUND(COALESCE(AVG(NULLIF(ctr, 0)), 0), 2) as avg_ctr,
      ROUND(COALESCE(AVG(NULLIF(cost_per_lead, 0)), 0), 2) as avg_cpl
    FROM fb_campaigns
    WHERE fb_campaign_id NOT LIKE 'camp_%'
  `);
  const products = await safeGet('SELECT COUNT(*) as total FROM products');

  const data = [];
  for (const worker of WORKERS) {
    data.push({
    ...worker,
    status: 'online',
    monthlyGoals: monthlyGoalsFor(worker.id),
    tasks: await getAssignedTasks(worker.id),
    recommendations: tasksFor(worker.id, { clients, leads, fb, products }),
    results: resultsFor(worker.id, { clients, leads, fb, products }),
    });
  }
  return data;
}

function monthlyGoalsFor(id) {
  const goals = {
    rostislav: {
      minimum: '1 закрытый заказ на поставку материалов в месяц',
      optimal: '3-4 закрытых заказа на поставку материалов в месяц',
      reward: 'При 3-4 заказах ориентир зарплаты около 2000 EUR',
      daily: 'Каждый день звонить, пинговать клиентов, писать в Viber/email, уточнять статус и двигать клиента к заказу.',
      measurement: [
        'Кол-во звонков и Viber/email касаний за день',
        'Кол-во обновлённых статусов в Google таблице',
        'Кол-во клиентов, переведённых в “ждут цены”, “встреча”, “оферта”, “готовы закупать”',
        'Кол-во закрытых заказов за месяц',
      ],
    },
    mark: {
      minimum: 'Дневной KPI: отчёт по ценам на материалы на болгарском рынке',
      optimal: 'Ежедневный ценовой мониторинг + пополнение B2B базы новыми компаниями',
      reward: 'Главная ценность: давать администратору и Ростиславу актуальную картину рынка',
      daily: 'Сканировать болгарский рынок: цены на материалы, упаковки, условия поставки, минимальные заказы и конкурентов.',
      measurement: [
        'Новые цены/конкуренты, добавленные в отчёт',
        'Новые B2B компании, добавленные или уточнённые в базе',
        'Рекомендации по ценам и условиям для B2B клиентов',
        'Обновление таблицы с источниками данных',
      ],
    },
    maria: {
      minimum: 'KPI: анализ рекламных кампаний, когда они запущены',
      optimal: 'Ежедневный анализ кампаний + рекомендации: усилить, остановить, изменить креатив/аудиторию',
      reward: 'Главная ценность: снижать CPL и давать Ростиславу качественные лиды',
      daily: 'Проверять spend, leads, CTR, CPL, качество лидов и передавать выводы по кампаниям.',
      measurement: [
        'Отчёт по spend / leads / CPL / CTR',
        'Рекомендации по каждой активной кампании',
        'Какие лиды переданы Ростиславу',
        'Какие кампании улучшены или остановлены',
      ],
    },
    steve: {
      minimum: 'KPI: рекомендации по SEO для bodexbg.com',
      optimal: 'Еженедельный SEO-план: страницы, статьи, кейсы, технические правки и приоритеты',
      reward: 'Главная ценность: увеличивать органический B2B трафик и заявки с сайта',
      daily: 'Смотреть сайт, SEO структуру, страницы услуг/материалов, контент и точки роста.',
      measurement: [
        'Список SEO рекомендаций по сайту',
        'Новые темы статей/страниц под B2B запросы',
        'Технические SEO правки: title, meta, H1, ссылки',
        'Идеи кейс-стади и контента для доверия крупных клиентов',
      ],
    },
  };
  return goals[id] || { minimum: '', optimal: '', reward: '', daily: '', measurement: [] };
}

async function getAssignedTasks(workerId) {
  await ensureTaskTableOnly();
  return db.all(`
    SELECT * FROM worker_tasks
    WHERE worker_id = ?
      AND COALESCE(NULLIF(due_date::text, ''), CURRENT_DATE::text)::date >= (CURRENT_DATE - 1)
    ORDER BY
      CASE
        WHEN COALESCE(NULLIF(due_date::text, ''), CURRENT_DATE::text)::date = CURRENT_DATE THEN 1
        WHEN COALESCE(NULLIF(due_date::text, ''), CURRENT_DATE::text)::date > CURRENT_DATE THEN 2
        ELSE 3
      END,
      CASE status
        WHEN 'in_progress' THEN 1
        WHEN 'todo' THEN 2
        WHEN 'blocked' THEN 3
        WHEN 'done' THEN 4
        WHEN 'not_done' THEN 5
        ELSE 6
      END,
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      id DESC
  `, [workerId]);
}

async function ensureTaskTableOnly() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS worker_tasks (
      id SERIAL PRIMARY KEY,
      worker_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      source TEXT DEFAULT 'admin',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'todo',
      due_date TEXT DEFAULT (CURRENT_DATE),
      assigned_by TEXT DEFAULT 'admin',
      result_note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

function tasksFor(id, data) {
  const c = data.clients || {};
  const l = data.leads || {};
  const fb = data.fb || {};
  const p = data.products || {};

  const tasks = {
    rostislav: [
      { title: `Позвонить ${Math.min(c.high_priority || 0, 10)} high-priority клиентам`, source: 'Google Sheets', status: 'today' },
      { title: `Заполнить статус звонка у ${c.no_status || 0} контактов без статуса`, source: 'b2b', status: 'today' },
      { title: 'Отправить Viber/email тем, у кого действие: каталог, презентация или форма', source: 'УСЛУГИ / МАТЕРИАЛЫ', status: 'today' },
      { title: `Проверить ${l.new_leads || 0} новых CRM лидов`, source: 'CRM', status: 'today' },
    ],
    mark: [
      { title: 'Собрать цены конкурентов по PU смолам, епоксидным смолам, пакерам и помпам', source: 'Market research', status: 'today' },
      { title: 'Сравнить ARCAN/BODEX с конкурентами по цене, упаковке, минимальному заказу', source: 'Products', status: 'today' },
      { title: `Обновить отчёт по ${p.total || 0} товарам в таблице`, source: 'Products / Google Sheets', status: 'weekly' },
      { title: 'Найти 5 компаний-поставщиков/конкурентов для анализа цен', source: 'B2B база', status: 'today' },
    ],
    maria: [
      { title: `Проверить ${fb.active_campaigns || 0} активных FB кампаний`, source: 'Facebook Ads', status: 'today' },
      { title: `Сделать отчёт: spend $${Number(fb.spend || 0).toFixed(2)}, leads ${fb.leads || 0}, CPL $${fb.avg_cpl || 0}`, source: 'Facebook Ads', status: 'today' },
      { title: 'Дать рекомендации: какие кампании усилить, какие остановить, где заменить креатив', source: 'Facebook Ads', status: 'today' },
      { title: 'Передать Ростиславу лиды из Lead Forms для звонков', source: 'CRM', status: 'daily' },
    ],
    steve: [
      { title: 'Проверить SEO страницы: инжекционни смоли, хидроизолация, ремонт на бетон, укрепване на фундаменти', source: 'bodexbg.com', status: 'today' },
      { title: 'Составить список новых статей и кейс-стади под B2B аудиторию', source: 'SEO content', status: 'weekly' },
      { title: 'Проверить title/meta/H1 и внутренние ссылки ключевых страниц', source: 'Technical SEO', status: 'today' },
      { title: 'Найти поисковые запросы, по которым конкуренты получают трафик', source: 'Research', status: 'weekly' },
    ],
  };
  return tasks[id] || [];
}

function resultsFor(id, data) {
  const c = data.clients || {};
  const l = data.leads || {};
  const fb = data.fb || {};
  const p = data.products || {};
  const results = {
    rostislav: [
      { label: 'Клиенты из таблиц', value: c.total || 0 },
      { label: 'High priority', value: c.high_priority || 0 },
      { label: 'Без статуса звонка', value: c.no_status || 0 },
      { label: 'CRM pipeline', value: `${Number(l.pipeline || 0).toLocaleString()} лв` },
    ],
    mark: [
      { label: 'Товаров в каталоге', value: p.total || 0 },
      { label: 'B2B база для анализа', value: c.b2b || 0 },
      { label: 'Ценовой отчёт', value: 'нужно обновить' },
      { label: 'Фокус', value: 'PU / Epoxy / Packers' },
    ],
    maria: [
      { label: 'FB кампании', value: fb.campaigns || 0 },
      { label: 'Активные', value: fb.active_campaigns || 0 },
      { label: 'Лиды из FB', value: fb.leads || 0 },
      { label: 'Средний CPL', value: `$${fb.avg_cpl || 0}` },
    ],
    steve: [
      { label: 'Сайт', value: 'bodexbg.com' },
      { label: 'SEO темы', value: 4 },
      { label: 'Кейс-стади', value: 'нужно собрать' },
      { label: 'Цель', value: 'B2B трафик' },
    ],
  };
  return results[id] || [];
}

async function safeGet(sql) {
  try {
    return (await db.get(sql)) || {};
  } catch {
    return {};
  }
}

async function getWorkerSummary() {
  await ensureWorkers();
  const workers = await workerData();
  const aiRunMap = {};
  try {
    const runs = await db.all(`
      SELECT ar.* FROM agent_runs ar
      INNER JOIN (
        SELECT agent_id, MAX(id) as id
        FROM agent_runs
        GROUP BY agent_id
      ) latest ON latest.id = ar.id
    `);
    runs.forEach(run => {
      aiRunMap[run.agent_id] = run;
    });
  } catch {}

  return workers.map(worker => {
    const tasks = worker.tasks || [];
    const todo = tasks.filter(t => ['todo', 'in_progress', 'blocked'].includes(t.status));
    const done = tasks.filter(t => t.status === 'done');
    const latestResult = tasks.find(t => t.result_note) || done[0] || null;
    const aiRun = aiRunMap[worker.id] || null;
    const recommendation = worker.recommendations?.[0] || null;

    return {
      id: worker.id,
      name: worker.name,
      type: worker.type,
      role: worker.role,
      avatar_emoji: worker.avatar_emoji,
      color: worker.color,
      mission: worker.mission,
      today_focus: recommendation?.title || worker.monthlyGoals?.daily || worker.mission,
      tasks_total: tasks.length,
      tasks_open: todo.length,
      tasks_done: done.length,
      current_task: todo[0]?.title || recommendation?.title || 'Нет активной задачи',
      latest_result: latestResult ? {
        title: latestResult.title,
        status: latestResult.status,
        note: latestResult.result_note || taskStatusLabel(latestResult.status),
        updated_at: latestResult.updated_at,
      } : null,
      ai_run: aiRun ? {
        status: aiRun.status,
        message: aiRun.message,
        rows_created: aiRun.rows_created,
        finished_at: aiRun.finished_at,
      } : null,
    };
  });
}

function taskStatusLabel(status) {
  const labels = {
    todo: 'к выполнению',
    in_progress: 'в работе',
    done: 'выполнено',
    not_done: 'не выполнено',
    blocked: 'блокер',
  };
  return labels[status] || status || '—';
}

function normalizeDealText(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е');
}

function matchAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function classifyDeal(row) {
  const text = normalizeDealText([
    row.status,
    row.action_needed,
    row.interest,
    row.result,
    row.deal,
    row.notes,
    row.problem,
    row.priority,
  ].join(' '));

  if (matchAny(text, [/отказ/, /(^|[\s|,;:/-])не\s+актуал/, /(^|[\s|,;:/-])не\s+интерес/, /неинтерес/, /(^|[\s|,;:/-])нет\s+интерес/, /refus/, /lost/, /cancel/])) return 'lost';
  if (matchAny(text, [/закрыт/, /заключен/, /подписан/, /оплат/, /купил/, /купув/, /спечел/, /won/, /договор\s+подпис/])) return 'won';
  if (matchAny(text, [/закуп/, /готовы\s+закуп/, /готови\s+да\s+куп/])) return 'purchase';
  if (matchAny(text, [/договор/, /contract/, /фактур/, /invoice/])) return 'contract';
  if (matchAny(text, [/переговор/, /жд[уе]т\s+цен/, /ожида.*цен/, /встреч/, /срещ/, /meeting/, /цена/, /оферт.*обсуж/])) return 'negotiation';
  if (matchAny(text, [/коммерческ/, /предложен/, /\bкп\b/, /оферт/, /proposal/, /quote/])) return 'offer_sent';
  if (matchAny(text, [/дума/, /посмотрит/, /смотрит/, /чакат/, /ожида/, /повторить/, /follow/, /ответит/])) return 'thinking';
  if (matchAny(text, [/каталог/, /презентац/, /presentation/, /catalog/])) return 'catalog_sent';
  if (matchAny(text, [/очень\s+интерес/, /заинтерес/, /интерес/, /hot/, /high/, /средн/])) return 'interested';
  return 'new';
}

function nextDealAction(stageId, row) {
  if (row.action_needed) return row.action_needed;
  const byStage = {
    new: 'Уточнить потребность и заполнить интерес / контекст',
    interested: 'Связаться сегодня, понять объект и нужные материалы',
    catalog_sent: 'Проверить, посмотрел ли клиент каталог / презентацию',
    thinking: 'Дать короткий follow-up и зафиксировать следующий срок ответа',
    offer_sent: 'Дожать обратную связь по коммерческому предложению',
    negotiation: 'Уточнить цену, срок поставки и следующий шаг',
    contract: 'Подготовить договор, реквизиты и условия оплаты',
    purchase: 'Довести до оплаты, поставки и закрытия заказа',
    won: 'Зафиксировать результат и запросить повторный заказ',
    lost: 'Оставить причину отказа и дату возможного возврата',
  };
  return byStage[stageId] || 'Обновить статус в таблице';
}

function leadStatusFromDealStage(stageId) {
  const map = {
    new: 'new',
    interested: 'contacted',
    catalog_sent: 'contacted',
    thinking: 'contacted',
    offer_sent: 'offer_sent',
    negotiation: 'negotiation',
    contract: 'negotiation',
    purchase: 'negotiation',
    won: 'won',
    lost: 'lost',
  };
  return map[stageId] || 'contacted';
}

async function buildDealsPayload() {
  await ensureDealOverrides();
  const { rows } = await db.query(`
    SELECT
      id, sheet_name, row_number, segment, company_name, contact_name, phone, email, city,
      object_type, problem, interest, action_needed, status, priority, result, deal, notes, synced_at
    FROM sheet_clients
    ORDER BY
      CASE priority WHEN 'hot' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      sheet_name,
      row_number
  `);
  const overrides = await db.all('SELECT sheet_name, row_number, stage_id FROM deal_status_overrides');
  const overrideByKey = new Map(overrides.map(row => [`${row.sheet_name}:${row.row_number}`, row.stage_id]));

  const dealRows = rows.filter(row => DEAL_SECTIONS.some(section => section.sheets.includes(row.sheet_name)));
  const summary = {
    total: dealRows.length,
    interested: 0,
    catalog_or_offer: 0,
    contract_purchase_won: 0,
    lost: 0,
    last_sync: null,
  };

  const sections = DEAL_SECTIONS.map(section => {
    const stages = DEAL_STAGES.map(stage => ({ ...stage, count: 0, clients: [] }));
    return {
      ...section,
      summary: {
        total: 0,
        interested: 0,
        catalog_or_offer: 0,
        contract_purchase_won: 0,
        lost: 0,
      },
      stages,
    };
  });
  const sectionById = Object.fromEntries(sections.map(section => [section.id, section]));

  dealRows.forEach(row => {
    const section = sections.find(item => item.sheets.includes(row.sheet_name));
    if (!section) return;
    const key = `${row.sheet_name}:${row.row_number}`;
    const stageId = overrideByKey.get(key) || classifyDeal(row);
    const stage = section.stages.find(item => item.id === stageId) || section.stages[0];
    const client = {
      ...row,
      section_id: section.id,
      stage_id: stage.id,
      stage_label: stage.label,
      status_override: overrideByKey.has(key),
      next_action: nextDealAction(stage.id, row),
    };
    stage.clients.push(client);
    stage.count += 1;
    section.summary.total += 1;
    if (stage.id === 'interested') {
      summary.interested += 1;
      section.summary.interested += 1;
    }
    if (['catalog_sent', 'offer_sent'].includes(stage.id)) {
      summary.catalog_or_offer += 1;
      section.summary.catalog_or_offer += 1;
    }
    if (['contract', 'purchase', 'won'].includes(stage.id)) {
      summary.contract_purchase_won += 1;
      section.summary.contract_purchase_won += 1;
    }
    if (stage.id === 'lost') {
      summary.lost += 1;
      section.summary.lost += 1;
    }
    if (row.synced_at && (!summary.last_sync || row.synced_at > summary.last_sync)) summary.last_sync = row.synced_at;
  });

  return { summary, sections, stages: sectionById.services?.stages || [] };
}

router.get('/stats', async (req, res) => {
  try {
    const leadStats = await db.query(`
      SELECT
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_leads,
        SUM(CASE WHEN status IN ('qualified','offer_sent','negotiation') THEN 1 ELSE 0 END) as active_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_deals,
        SUM(CASE WHEN date(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) as today_leads,
        COALESCE(SUM(CASE WHEN status != 'lost' THEN estimated_value ELSE 0 END), 0) as pipeline_value,
        COALESCE(SUM(CASE WHEN status = 'won' THEN estimated_value ELSE 0 END), 0) as won_value
      FROM leads
    `);

    const sourceStats = await db.query(`
      SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC
    `);

    const fbStats = await db.query(`
      SELECT
        COUNT(*) as campaigns,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_campaigns,
        COALESCE(SUM(spend), 0) as spend,
        COALESCE(SUM(leads_count), 0) as leads,
        CASE WHEN SUM(leads_count) > 0 THEN ROUND(SUM(spend) / SUM(leads_count), 2) ELSE NULL END as avg_cpl,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks) / SUM(impressions) * 100, 2) ELSE NULL END as avg_ctr
      FROM fb_campaigns
      WHERE fb_campaign_id NOT LIKE 'camp_%'
    `);

    const trend = await db.query(`
      SELECT date(created_at) as date, COUNT(*) as new_leads
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY date(created_at)
      ORDER BY date(created_at)
    `);

    await ensureWorkers();
    const agents = await db.query('SELECT * FROM agents ORDER BY id');

    res.json({
      leads: leadStats.rows[0] || {},
      sources: sourceStats.rows,
      fb: fbStats.rows[0] || {},
      trend: trend.rows,
      agents: agents.rows,
      worker_summary: await getWorkerSummary(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/agents', async (req, res) => {
  try {
    await ensureWorkers();
    const { rows } = await db.query('SELECT * FROM agents ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/workers', async (req, res) => {
  try {
    res.json(await workerData());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/workers/:id', async (req, res) => {
  try {
    const worker = (await workerData()).find(w => w.id === req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json(worker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/deals', async (req, res) => {
  try {
    res.json(await buildDealsPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/deals/status', async (req, res) => {
  try {
    await ensureDealOverrides();
    const { sheet_name, row_number, stage_id } = req.body || {};
    const stage = DEAL_STAGES.find(item => item.id === stage_id);
    if (!sheet_name || !row_number || !stage) {
      return res.status(400).json({ error: 'sheet_name, row_number and valid stage_id are required' });
    }

    const exists = await db.get(`
      SELECT 1 FROM sheet_clients
      WHERE sheet_name = ? AND row_number = ?
      LIMIT 1
    `, [sheet_name, row_number]);
    if (!exists) return res.status(404).json({ error: 'Deal row not found' });

    await db.run(`
      INSERT INTO deal_status_overrides (sheet_name, row_number, stage_id, updated_at)
      VALUES (?, ?, ?, NOW())
      ON CONFLICT(sheet_name, row_number) DO UPDATE SET
        stage_id = excluded.stage_id,
        updated_at = NOW()
    `, [sheet_name, row_number, stage.id]);

    const nextLeadStatus = leadStatusFromDealStage(stage.id);
    const matchedLeads = await db.all(`
      SELECT id, status FROM leads
      WHERE google_sheet_name = ? AND google_sheet_row = ?
    `, [sheet_name, row_number]);
    for (const lead of matchedLeads) {
      if (lead.status === nextLeadStatus) continue;
      await db.run(`
        UPDATE leads SET status = ?, updated_at = NOW()
        WHERE id = ?
      `, [nextLeadStatus, lead.id]);
      await db.run(`
        INSERT INTO lead_activities (lead_id, action, description, old_value, new_value, performed_by)
        VALUES (?, 'status_change', ?, ?, ?, 'deals')
      `, [
        lead.id,
        `Статус обновлён через сделку ${sheet_name} row ${row_number}`,
        lead.status,
        nextLeadStatus,
      ]);
    }

    res.json({ success: true, sheet_name, row_number, stage_id: stage.id, stage_label: stage.label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/workers/:id/tasks', auth.requireAdmin, async (req, res) => {
  try {
    await ensureWorkers();
    const worker = WORKERS.find(w => w.id === req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const { title, description, priority, due_date, source } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const info = await db.run(`
      INSERT INTO worker_tasks (worker_id, title, description, priority, due_date, source, status, assigned_by)
      VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_DATE), ?, 'todo', 'admin')
      RETURNING id
    `, [
      worker.id,
      String(title).trim(),
      description ? String(description).trim() : '',
      ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      due_date || null,
      source ? String(source).trim() : 'admin',
    ]);

    await db.run(`
      INSERT INTO worker_task_events (task_id, worker_id, event_type, new_status, note, changed_by)
      VALUES (?, ?, 'created', 'todo', ?, 'admin')
    `, [info.lastInsertRowid, worker.id, `Создана задача: ${String(title).trim()}`]);

    const task = await db.get('SELECT * FROM worker_tasks WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/worker-tasks/:id', async (req, res) => {
  try {
    await ensureTaskTableOnly();
    const allowedStatuses = ['todo', 'in_progress', 'done', 'not_done', 'blocked'];
    const task = await db.get('SELECT * FROM worker_tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const status = allowedStatuses.includes(req.body?.status) ? req.body.status : task.status;
    const resultNote = req.body?.result_note !== undefined ? String(req.body.result_note || '') : task.result_note;

    await db.run(`
      UPDATE worker_tasks
      SET status = ?, result_note = ?, updated_at = NOW()
      WHERE id = ?
    `, [status, resultNote, req.params.id]);

    const eventType = status !== task.status ? 'status_changed' : 'result_updated';
    await db.run(`
      INSERT INTO worker_task_events (task_id, worker_id, event_type, old_status, new_status, note, changed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      task.id,
      task.worker_id,
      eventType,
      task.status,
      status,
      resultNote !== task.result_note ? resultNote : null,
      'worker',
    ]);

    if (status === 'done' && task.status !== 'done') {
      await db.run(`
        UPDATE agents
        SET tasks_completed = COALESCE(tasks_completed, 0) + 1
        WHERE worker_code = ?
      `, [task.worker_id]);
    }

    res.json(await db.get('SELECT * FROM worker_tasks WHERE id = ?', [req.params.id]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/worker-tasks/:id', auth.requireAdmin, async (req, res) => {
  try {
    await ensureTaskTableOnly();
    await db.run('DELETE FROM worker_tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/agents/:id', async (req, res) => {
  try {
    const { status, current_task } = req.body;
    await db.run(
      "UPDATE agents SET status = COALESCE(?, status), current_task = COALESCE(?, current_task), last_active_at = NOW() WHERE id = ?"
    , [status, current_task, req.params.id]);
    const agent = await db.get('SELECT * FROM agents WHERE id = ?', [req.params.id]);
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM products ORDER BY category, name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/feed', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM (
        SELECT 'lead' as type, la.action, la.description as text,
               l.company_name as context, la.created_at
        FROM lead_activities la LEFT JOIN leads l ON l.id = la.lead_id
        ORDER BY la.created_at DESC LIMIT 10
      )
      UNION ALL
      SELECT * FROM (
        SELECT 'sync' as type, direction as action,
               sheet_name || ': ' || rows_affected || ' rows' as text,
               status as context, synced_at as created_at
        FROM sheets_sync_log ORDER BY synced_at DESC LIMIT 5
      )
      ORDER BY created_at DESC LIMIT 30
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
