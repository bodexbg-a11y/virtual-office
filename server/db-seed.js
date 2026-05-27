require('./db-init');
const db = require('./db');

async function main() {
  try {
    const products = [
      ['HB-575', 'HydroBloc 575 Integral', 'ХидроБлок 575 Интеграл', 'water', 'Готова 1К набъбваща смола за пукнатини, фуги и маркучи. KTW сертификат за питейна вода.', 25],
      ['HB-PU500', 'HydroBloc PU 500', 'ХидроБлок PU 500', 'water', 'Набъбваща PU смола за пукнатини и работни фуги. Набъбване до 150%, еластичност ~100%.', 50],
      ['HB-R570', 'HydroBloc Rapid 570', 'ХидроБлок Рапид 570', 'water', 'Много бързо реагираща набъбваща PU смола. За силни течове и дилатационни фуги.', 50],
      ['HB-S510', 'HydroBloc Schaum 510', 'ХидроБлок Шаум 510', 'water', 'Бързо спиране на активни течове. Реакция ~10 сек. Обем пяна до 40 л/кг.', 25],
      ['HB-AC555', 'HydroBloc AC 555', 'ХидроБлок AC 555', 'water', 'Акрилатна инжекционна смола за пукнатини при отрицателни температури.', 50],
      ['HB-G530', 'HydroBloc Gel 530', 'ХидроБлок Гел 530', 'gel', 'Еднокомпонентен акрилатен гел за запечатване на фуги и пукнатини.', 25],
      ['HB-S516', 'HydroBloc Schaum 516', 'ХидроБлок Шаум 516', 'water', 'Двукомпонентна бързореагираща PU пяна за аварийно спиране на течове.', 50],
      ['HB-EP811', 'HydroBloc EP 811', 'ХидроБлок EP 811', 'structural', 'Свръхнисковискозна епоксидна смола за структурно залепване на пукнатини.', 25],
      ['HB-ADD540', 'HydroBloc Add 540', 'ХидроБлок Адд 540', 'additive', 'Добавка-ускорител за акрилатни гелове.', 10],
      ['GR-181', 'GeoRock 181', 'ГеоРок 181', 'masonry', 'Геополимерен разтвор без цимент за ремонт на подове и стени.', 50],
      ['JK-M3', 'Jekto M-3 / M-4 1K', 'Жекто М-3 / М-4 1К', 'equip', 'Инжекционни помпи за еднокомпонентни смоли и пяни. До 220 бара.', 1],
      ['PAK-01', 'Пакери за Инжектиране', 'Пакери за инжектиране', 'equip', 'Метални и специализирани пакери за различни диаметри и налягания.', 10],
    ];

    for (const p of products) {
      await db.run(`
        INSERT INTO products (sku, name, name_bg, category, description_bg, min_order_kg)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (sku) DO NOTHING
      `, p);
    }

    const agents = [
      ['Стефан Димитров', 'FB Ads Manager', '📢', '#1877f2', 'online', 'Оптимизация кампании HydroBloc PU 500'],
      ['Ивана Петрова', 'Lead Manager / CRM', '📋', '#f59e0b', 'online', 'Обработка на нови запитвания'],
      ['Николай Георгиев', 'Content & SEO', '✍️', '#8b5cf6', 'busy', 'SEO статия за инжекционна хидроизолация'],
      ['BodexBot AI', 'Чатбот', '🤖', '#10b981', 'online', 'Авто-отговори на клиенти 24/7'],
      ['Мария Тодорова', 'Аналитик', '📊', '#ec4899', 'online', 'Месечен отчёт ROI'],
    ];

    for (const a of agents) {
      await db.run(`
        INSERT INTO agents (name, role, avatar_emoji, color, status, current_task)
        VALUES (?, ?, ?, ?, ?, ?)
      `, a);
    }

    const campaigns = [
      ['camp_001', 'HydroBloc PU 500 — Строителни фирми', 'ACTIVE', 'LEAD_GENERATION', 50, 12400, 342, 2.76, 0.43, 147.06, 8, 18.38],
      ['camp_002', 'Ремонт на течове — Ретаргетинг', 'ACTIVE', 'LEAD_GENERATION', 30, 8200, 215, 2.62, 0.52, 111.80, 5, 22.36],
      ['camp_003', 'ARCAN Пакери — Проектанти', 'PAUSED', 'TRAFFIC', 25, 5600, 178, 3.18, 0.38, 67.64, 3, 22.55],
      ['camp_004', 'Хидроизолация Тунели — B2B', 'ACTIVE', 'LEAD_GENERATION', 40, 9800, 287, 2.93, 0.47, 134.89, 6, 22.48],
    ];

    for (const c of campaigns) {
      await db.run(`
        INSERT INTO fb_campaigns (fb_campaign_id, name, status, objective, daily_budget, impressions, clicks, ctr, cpc, spend, leads_count, cost_per_lead)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (fb_campaign_id) DO NOTHING
      `, c);
    }

    console.log('✅ Database seeded successfully');
    console.log('   - 12 products');
    console.log('   - 5 agents');
    console.log('   - 4 FB campaigns (demo)');
  } catch (err) {
    console.error('❌ Seed error:', err.message);
  } finally {
    await db.close();
  }
}

main();
