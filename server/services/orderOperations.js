const db = require('../db');

async function ensureOpsTables() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS logistics_records (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      client_name TEXT NOT NULL,
      delivery_city TEXT,
      transport_company TEXT,
      vehicle_number TEXT,
      driver_name TEXT,
      transport_note_number TEXT,
      tracking_number TEXT,
      planned_date DATE,
      delivered_date DATE,
      status TEXT DEFAULT 'planned',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_logistics_lead_id ON logistics_records(lead_id);
    CREATE INDEX IF NOT EXISTS idx_logistics_status ON logistics_records(status);
    CREATE INDEX IF NOT EXISTS idx_logistics_planned_date ON logistics_records(planned_date);

    CREATE TABLE IF NOT EXISTS payment_records (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL,
      client_name TEXT NOT NULL,
      invoice_number TEXT,
      amount NUMERIC(12,2) DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      issue_date DATE,
      due_date DATE,
      paid_date DATE,
      status TEXT DEFAULT 'draft',
      payment_method TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_payments_lead_id ON payment_records(lead_id);
    CREATE INDEX IF NOT EXISTS idx_payments_offer_id ON payment_records(offer_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payment_records(status);
    CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payment_records(due_date);
  `);
}

function clientName(lead) {
  return String(lead.company_name || lead.contact_name || `Клиент #${lead.id}`).trim();
}

async function ensureWonLeadOperations(leadOrId) {
  await ensureOpsTables();
  const lead = typeof leadOrId === 'object'
    ? leadOrId
    : await db.get('SELECT * FROM leads WHERE id = ?', [leadOrId]);

  if (!lead || lead.status !== 'won') return { logistics_created: false, payment_created: false };

  const name = clientName(lead);
  const existingLogistics = await db.get(
    'SELECT id FROM logistics_records WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1',
    [lead.id]
  );
  let logisticsCreated = false;
  if (!existingLogistics) {
    await db.query(`
      INSERT INTO logistics_records (
        lead_id, client_name, delivery_city, status, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, 'planned', ?, NOW(), NOW())
    `, [lead.id, name, lead.city || null, 'Создано автоматически после успешного закрытия клиента']);
    logisticsCreated = true;
  }

  const existingPayment = await db.get(
    'SELECT id, status FROM payment_records WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1',
    [lead.id]
  );
  let paymentCreated = false;
  if (!existingPayment) {
    await db.query(`
      INSERT INTO payment_records (
        lead_id, client_name, amount, currency, paid_date, status, notes, created_at, updated_at
      )
      VALUES (?, ?, NULL, 'EUR', CURRENT_DATE, 'paid', ?, NOW(), NOW())
    `, [lead.id, name, 'Создано автоматически после успешного закрытия клиента']);
    paymentCreated = true;
  } else if (existingPayment.status !== 'paid') {
    await db.query(`
      UPDATE payment_records
      SET status = 'paid', paid_date = COALESCE(paid_date, CURRENT_DATE), updated_at = NOW()
      WHERE id = ?
    `, [existingPayment.id]);
  }

  return { logistics_created: logisticsCreated, payment_created: paymentCreated };
}

async function syncWonLeadOperations() {
  await ensureOpsTables();
  const leads = await db.all(`SELECT * FROM leads WHERE status = 'won'`);
  for (const lead of leads) await ensureWonLeadOperations(lead);
  return leads.length;
}

module.exports = {
  ensureOpsTables,
  ensureWonLeadOperations,
  syncWonLeadOperations,
};
