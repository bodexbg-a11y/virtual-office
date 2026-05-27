const express = require('express');
const router = express.Router();
const auth = require('../services/auth');
const db = require('../db');

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

module.exports = router;
