const db = require('./db');

const schema = `
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_bg TEXT,
  category TEXT NOT NULL,
  description TEXT,
  description_bg TEXT,
  price_per_kg NUMERIC,
  min_order_kg NUMERIC DEFAULT 50,
  in_stock INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
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
  estimated_value NUMERIC,
  notes TEXT,
  assigned_to TEXT,
  fb_lead_id TEXT,
  google_sheet_name TEXT,
  google_sheet_row INTEGER,
  last_contact_at TIMESTAMP,
  next_followup_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  old_value TEXT,
  new_value TEXT,
  performed_by TEXT DEFAULT 'system',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  offer_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'draft',
  items TEXT NOT NULL DEFAULT '[]',
  subtotal NUMERIC,
  discount_pct NUMERIC DEFAULT 0,
  total NUMERIC,
  currency TEXT DEFAULT 'EUR',
  valid_until TIMESTAMP,
  notes TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fb_campaigns (
  id SERIAL PRIMARY KEY,
  fb_campaign_id TEXT UNIQUE,
  name TEXT,
  status TEXT,
  objective TEXT,
  daily_budget NUMERIC,
  lifetime_budget NUMERIC,
  insight_window TEXT,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  cpc NUMERIC DEFAULT 0,
  spend NUMERIC DEFAULT 0,
  leads_count INTEGER DEFAULT 0,
  cost_per_lead NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fb_leads_raw (
  id SERIAL PRIMARY KEY,
  fb_lead_id TEXT UNIQUE,
  fb_form_id TEXT,
  fb_campaign_id TEXT,
  data TEXT,
  processed INTEGER DEFAULT 0,
  lead_id INTEGER REFERENCES leads(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sheets_sync_log (
  id SERIAL PRIMARY KEY,
  sheet_name TEXT,
  direction TEXT,
  rows_affected INTEGER DEFAULT 0,
  status TEXT,
  error_message TEXT,
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id SERIAL PRIMARY KEY,
  session_id TEXT,
  visitor_name TEXT,
  visitor_phone TEXT,
  visitor_email TEXT,
  messages TEXT DEFAULT '[]',
  recommended_products TEXT,
  converted_to_lead INTEGER DEFAULT 0,
  lead_id INTEGER REFERENCES leads(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_emoji TEXT,
  color TEXT,
  status TEXT DEFAULT 'online',
  current_task TEXT,
  tasks_completed INTEGER DEFAULT 0,
  last_active_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_activities (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  new_leads INTEGER DEFAULT 0,
  qualified_leads INTEGER DEFAULT 0,
  offers_sent INTEGER DEFAULT 0,
  deals_won INTEGER DEFAULT 0,
  fb_spend NUMERIC DEFAULT 0,
  fb_leads INTEGER DEFAULT 0,
  fb_clicks INTEGER DEFAULT 0,
  chatbot_conversations INTEGER DEFAULT 0,
  chatbot_leads INTEGER DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
`;

(async () => {
  try {
    await db.exec(schema);
    console.log('✅ Database schema created');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
