const express = require('express');
const router = express.Router();
const auth = require('../services/auth');
const db = require('../db');
const {
  ensureOpsTables,
  syncWonLeadOperations,
} = require('../services/orderOperations');

router.use(auth.requireAdmin);

router.get('/goals', async (req, res) => {
  try {
    const clientStats = await db.get(`
      SELECT
        COUNT(*) as total_clients,
        SUM(CASE WHEN sheet_name = 'b2b' THEN 1 ELSE 0 END) as b2b_clients,
        SUM(CASE WHEN priority IN ('hot', 'high') THEN 1 ELSE 0 END) as high_priority,
        SUM(CASE WHEN sheet_name = 'ПРОЕКТЫ' THEN 1 ELSE 0 END) as projects
      FROM sheet_clients
    `);

    const leadStats = await db.get(`
      SELECT
        COUNT(*) as crm_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_deals,
        COALESCE(SUM(CASE WHEN status != 'lost' THEN estimated_value ELSE 0 END), 0) as pipeline_value
      FROM leads
    `);

    res.json({
      source: 'BODEX_BusinessPlan_2026_with_Charts.pdf',
      summary: {
        company: 'BODEX Bulgaria',
        positioning: 'Официальный дилер ARCAN и B2B поставщик инжекционных систем для бетона в Болгарии.',
        market: 'Крупные строительные компании, подрядчики, инженерные организации и инфраструктурные проекты.',
        strategy: 'Получать крупные B2B контракты через Facebook, SEO и прямые продажи.',
      },
      annualTargets: [
        { label: 'Прогноз выручки 2026', value: '265,000 EUR', note: 'Рост от 25K EUR в Q1 до 90K EUR в Q4.' },
        { label: 'Прогноз прибыли', value: '45,000 - 58,000 EUR', note: 'Целевая маржинальность 18-22%.' },
        { label: 'Крупные B2B контракты', value: '3', note: 'Первый в Q2, второй в Q3, третий в Q4.' },
        { label: 'Средний контракт', value: '80,000 - 90,000 EUR', note: 'Фокус на строительные и инфраструктурные компании.' },
        { label: 'Рост продаж', value: '+35-50%', note: 'За счёт крупных заказов и оптовых поставок.' },
      ],
      quarterlyPlan: [
        {
          quarter: 'Q1 2026',
          revenue: '25K EUR',
          focus: 'Запуск машины лидогенерации и прямых контактов.',
          goals: [
            'Запустить активную Facebook кампанию на B2B аудиторию.',
            'Начать SEO оптимизацию bodexbg.com.',
            'Подготовить список целевых компаний для прямого контакта.',
            'Провести минимум 15 встреч с потенциальными клиентами.',
          ],
        },
        {
          quarter: 'Q2 2026',
          revenue: '65K EUR',
          focus: 'Заключить первый крупный контракт и усилить второй.',
          goals: [
            'Заключить Контракт 1.',
            'Интенсивно вести переговоры по Контракту 2.',
            'Участвовать в строительной выставке или конференции.',
            'Усилить Facebook рекламу на основе результатов Q1.',
          ],
        },
        {
          quarter: 'Q3 2026',
          revenue: '85K EUR',
          focus: 'Заключить второй контракт и использовать первый как кейс.',
          goals: [
            'Заключить Контракт 2.',
            'Начать поставки и работы по Контракту 1.',
            'Продолжить поиск Контракта 3.',
            'Сделать кейс-стади из первого контракта для маркетинга.',
          ],
        },
        {
          quarter: 'Q4 2026',
          revenue: '90K EUR',
          focus: 'Закрыть третий контракт и подготовить базу на 2027.',
          goals: [
            'Заключить Контракт 3.',
            'Завершить поставки по контрактам 1 и 2.',
            'Собрать отзывы и портфолио проектов.',
            'Спланировать инициативы на 2027 год.',
          ],
        },
      ],
      operatingRules: [
        'Каждый день начинать с тёплых клиентов и B2B компаний без статуса звонка.',
        'Каждому лиду должен быть назначен следующий шаг: звонок, Viber, email, каталог, оферта или встреча.',
        'В Google Sheets статусы должны обновляться менеджером сразу после контакта.',
        'ИИ-агенты анализируют таблицы, подсвечивают приоритеты и предлагают действия, но коммерческие решения утверждает админ.',
        'Главный KPI менеджера: встречи, оферты, follow-up и движение к 3 крупным контрактам.',
      ],
      marketingChannels: [
        { name: 'Facebook', role: 'B2B реклама, кейсы, портфолио проектов, лид-формы.' },
        { name: 'SEO', role: 'Статьи и страницы под инжекционные смолы, хидроизолация, ремонт бетона, укрепване.' },
        { name: 'Прямые продажи', role: 'Личные встречи и переговоры с ключевыми компаниями из B2B базы.' },
      ],
      currentData: {
        ...clientStats,
        ...leadStats,
      },
      todayAdminFocus: [
        'Проверить B2B базу: компании без “Статус звонка” идут первыми.',
        'Отфильтровать high priority клиентов и назначить конкретное действие менеджеру.',
        'Посмотреть проекты и понять, где нужна оферта, встреча или техконсультация.',
        'Проверить, какие лиды из материалов/услуг готовы к каталогу, презентации или оферте.',
        'Сверить активность с целями квартала: встречи, оферты, контракты, выручка.',
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/weekly-report', async (req, res) => {
  try {
    const summary = await db.get(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int as new_leads,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days' AND status <> 'new')::int as touched_leads,
        COUNT(*) FILTER (WHERE status = 'won' AND updated_at >= NOW() - INTERVAL '7 days')::int as won_leads,
        COUNT(*) FILTER (WHERE status NOT IN ('won','lost'))::int as active_leads,
        COALESCE(SUM(CASE WHEN status NOT IN ('won','lost') THEN estimated_value ELSE 0 END), 0) as pipeline_value
      FROM leads
    `);

    const premium = await db.get(`
      SELECT COUNT(*)::int as premium_leads
      FROM leads
      WHERE (
        lower(COALESCE(notes, '')) ~ '(регулярн\\w*\\s+месечн\\w*\\s+доставк\\w*|ежемес\\w*\\s+доставк\\w*|regular\\s+monthly\\s+deliver\\w*|monthly\\s+supply|регулярни\\s+месечни)'
        OR lower(COALESCE(notes, '')) ~ '(обем\\s*/\\s*тип\\s*запитване[^\\n:]*:\\s*.*(400\\s*\\+|1000\\s*\\+|над\\s*400|над\\s*1000|от\\s*400|от\\s*1000))'
      )
    `);

    const waitingOffers = await db.get(`
      SELECT COUNT(*)::int as waiting_offer
      FROM (
        SELECT l.id
        FROM leads l
        LEFT JOIN offers o ON o.lead_id = l.id
        WHERE l.status IN ('contacted', 'needs_discovery', 'offer_preparation', 'negotiation', 'office_meeting')
          AND l.status NOT IN ('won', 'lost')
        GROUP BY l.id
        HAVING COUNT(o.id) = 0
      ) q
    `);

    const offers = await db.get(`
      SELECT COUNT(*)::int as offers_sent
      FROM offers
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);

    const followups = await db.get(`
      SELECT COUNT(*)::int as overdue_followups
      FROM leads
      WHERE next_followup_at IS NOT NULL
        AND next_followup_at < NOW()
        AND status NOT IN ('won', 'lost')
    `);

    const tasks = await db.get(`
      SELECT COUNT(*)::int as manager_done
      FROM worker_tasks
      WHERE worker_id = 'rostislav'
        AND status = 'done'
        AND updated_at >= NOW() - INTERVAL '7 days'
    `).catch(() => ({ manager_done: 0 }));

    const topLeads = await db.all(`
      SELECT id, company_name, contact_name, status, priority, next_followup_at, estimated_value
      FROM leads
      WHERE status NOT IN ('won','lost')
      ORDER BY
        CASE priority WHEN 'hot' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        updated_at DESC NULLS LAST
      LIMIT 5
    `);

    res.json({
      period: 'last_7_days',
      summary: {
        ...(summary || {}),
        premium_leads: Number(premium?.premium_leads || 0),
        waiting_offer: Number(waitingOffers?.waiting_offer || 0),
        offers_sent: Number(offers?.offers_sent || 0),
        overdue_followups: Number(followups?.overdue_followups || 0),
        manager_done: Number(tasks?.manager_done || 0),
      },
      top_leads: topLeads || [],
      actions: [
        `Проверить ${Number(waitingOffers?.waiting_offer || 0)} лидов, которые ждут КП.`,
        `Закрыть ${Number(followups?.overdue_followups || 0)} просроченных follow-up.`,
        `Сфокусироваться на premium-лидах: ${Number(premium?.premium_leads || 0)} активных.`,
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/logistics', async (req, res) => {
  try {
    await syncWonLeadOperations();
    const rows = await db.all(`
      SELECT
        lr.*,
        l.company_name as lead_company_name,
        l.contact_name as lead_contact_name,
        l.phone as lead_phone,
        l.email as lead_email
      FROM logistics_records lr
      LEFT JOIN leads l ON l.id = lr.lead_id
      ORDER BY
        CASE lr.status
          WHEN 'in_transit' THEN 0
          WHEN 'planned' THEN 1
          WHEN 'delivered' THEN 2
          ELSE 3
        END,
        lr.planned_date ASC NULLS LAST,
        lr.created_at DESC
    `);

    const summary = await db.get(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'planned')::int as planned,
        COUNT(*) FILTER (WHERE status = 'in_transit')::int as in_transit,
        COUNT(*) FILTER (WHERE status = 'delivered')::int as delivered
      FROM logistics_records
    `);

    res.json({ summary: summary || {}, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logistics', async (req, res) => {
  try {
    await ensureOpsTables();
    const b = req.body || {};
    const row = await db.get(`
      INSERT INTO logistics_records (
        lead_id, client_name, delivery_city, transport_company, vehicle_number,
        driver_name, transport_note_number, tracking_number, planned_date,
        delivered_date, status, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      RETURNING *
    `, [
      b.lead_id || null,
      String(b.client_name || '').trim(),
      b.delivery_city || null,
      b.transport_company || null,
      b.vehicle_number || null,
      b.driver_name || null,
      b.transport_note_number || null,
      b.tracking_number || null,
      b.planned_date || null,
      b.delivered_date || null,
      b.status || 'planned',
      b.notes || null,
    ]);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/logistics/:id', async (req, res) => {
  try {
    await ensureOpsTables();
    const b = req.body || {};
    const row = await db.get(`
      UPDATE logistics_records
      SET
        lead_id = ?,
        client_name = ?,
        delivery_city = ?,
        transport_company = ?,
        vehicle_number = ?,
        driver_name = ?,
        transport_note_number = ?,
        tracking_number = ?,
        planned_date = ?,
        delivered_date = ?,
        status = ?,
        notes = ?,
        updated_at = NOW()
      WHERE id = ?
      RETURNING *
    `, [
      b.lead_id || null,
      String(b.client_name || '').trim(),
      b.delivery_city || null,
      b.transport_company || null,
      b.vehicle_number || null,
      b.driver_name || null,
      b.transport_note_number || null,
      b.tracking_number || null,
      b.planned_date || null,
      b.delivered_date || null,
      b.status || 'planned',
      b.notes || null,
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ error: 'Logistics record not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    await syncWonLeadOperations();
    const rows = await db.all(`
      SELECT
        pr.*,
        l.company_name as lead_company_name,
        o.offer_number
      FROM payment_records pr
      LEFT JOIN leads l ON l.id = pr.lead_id
      LEFT JOIN offers o ON o.id = pr.offer_id
      ORDER BY
        CASE pr.status
          WHEN 'overdue' THEN 0
          WHEN 'sent' THEN 1
          WHEN 'paid' THEN 2
          ELSE 3
        END,
        pr.due_date ASC NULLS LAST,
        pr.created_at DESC
    `);

    const summary = await db.get(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'draft')::int as draft,
        COUNT(*) FILTER (WHERE status = 'sent')::int as sent,
        COUNT(*) FILTER (WHERE status = 'paid')::int as paid,
        COUNT(*) FILTER (WHERE status = 'overdue')::int as overdue,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid_amount
      FROM payment_records
    `);

    res.json({ summary: summary || {}, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments', async (req, res) => {
  try {
    await ensureOpsTables();
    const b = req.body || {};
    const row = await db.get(`
      INSERT INTO payment_records (
        lead_id, offer_id, client_name, invoice_number, amount, currency,
        issue_date, due_date, paid_date, status, payment_method, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      RETURNING *
    `, [
      b.lead_id || null,
      b.offer_id || null,
      String(b.client_name || '').trim(),
      b.invoice_number || null,
      Number(b.amount || 0) || 0,
      b.currency || 'EUR',
      b.issue_date || null,
      b.due_date || null,
      b.paid_date || null,
      b.status || 'draft',
      b.payment_method || null,
      b.notes || null,
    ]);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/payments/:id', async (req, res) => {
  try {
    await ensureOpsTables();
    const b = req.body || {};
    const row = await db.get(`
      UPDATE payment_records
      SET
        lead_id = ?,
        offer_id = ?,
        client_name = ?,
        invoice_number = ?,
        amount = ?,
        currency = ?,
        issue_date = ?,
        due_date = ?,
        paid_date = ?,
        status = ?,
        payment_method = ?,
        notes = ?,
        updated_at = NOW()
      WHERE id = ?
      RETURNING *
    `, [
      b.lead_id || null,
      b.offer_id || null,
      String(b.client_name || '').trim(),
      b.invoice_number || null,
      Number(b.amount || 0) || 0,
      b.currency || 'EUR',
      b.issue_date || null,
      b.due_date || null,
      b.paid_date || null,
      b.status || 'draft',
      b.payment_method || null,
      b.notes || null,
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ error: 'Payment record not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
