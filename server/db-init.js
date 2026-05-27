const db = require('./db');

const schema = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_bg TEXT,
  category TEXT NOT NULL,
  description TEXT,
  description_bg TEXT,
  price_per_kg REAL,
  min_order_kg REAL DEFAULT 50,
  in_stock INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  lead_type TEXT DEFAULT 'inquiry',
  source TEXT,
  status TEXT DEFAULT 'new',
  priority TEXT DEFAULT 'medium',
  company_type TEXT,
  interest_products TEXT,
  estimated_value REAL,
  notes TEXT,
  assigned_to TEXT,
  fb_lead_id TEXT,
  google_sheet_row INTEGER,
  last_contact_at TEXT,
  next_followup_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  old_value TEXT,
  new_value TEXT,
  performed_by TEXT DEFAULT 'system',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id),
  offer_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'draft',
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL,
  discount_pct REAL DEFAULT 0,
  total REAL,
  valid_until TEXT,
  notes TEXT,
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fb_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fb_campaign_id TEXT UNIQUE,
  name TEXT,
  status TEXT,
  objective TEXT,
  daily_budget REAL,
  lifetime_budget REAL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  spend REAL DEFAULT 0,
  leads_count INTEGER DEFAULT 0,
  cost_per_lead REAL DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fb_leads_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fb_lead_id TEXT UNIQUE,
  fb_form_id TEXT,
  fb_campaign_id TEXT,
  data TEXT,
  processed INTEGER DEFAULT 0,
  lead_id INTEGER REFERENCES leads(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sheets_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_name TEXT,
  direction TEXT,
  rows_affected INTEGER DEFAULT 0,
  status TEXT,
  error_message TEXT,
  synced_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  visitor_name TEXT,
  visitor_phone TEXT,
  visitor_email TEXT,
  messages TEXT DEFAULT '[]',
  recommended_products TEXT,
  converted_to_lead INTEGER DEFAULT 0,
  lead_id INTEGER REFERENCES leads(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_emoji TEXT,
  color TEXT,
  status TEXT DEFAULT 'online',
  current_task TEXT,
  tasks_completed INTEGER DEFAULT 0,
  last_active_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER REFERENCES agents(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL DEFAULT (date('now')),
  new_leads INTEGER DEFAULT 0,
  qualified_leads INTEGER DEFAULT 0,
  offers_sent INTEGER DEFAULT 0,
  deals_won INTEGER DEFAULT 0,
  fb_spend REAL DEFAULT 0,
  fb_leads INTEGER DEFAULT 0,
  fb_clicks INTEGER DEFAULT 0,
  chatbot_conversations INTEGER DEFAULT 0,
  chatbot_leads INTEGER DEFAULT 0,
  revenue REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
`;

try {
  db.raw.exec(schema);
  console.log('✅ Database schema created');
} catch (err) {
  console.error('❌ Error:', err.message);
}
