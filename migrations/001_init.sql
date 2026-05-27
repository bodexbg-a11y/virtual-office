-- BODEX Virtual Office Database Schema

-- ===== PRODUCTS (ARCAN catalog) =====
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  name_bg VARCHAR(200),
  category VARCHAR(50) NOT NULL, -- water, structural, gel, equip, additive, masonry
  description TEXT,
  description_bg TEXT,
  price_per_kg DECIMAL(10,2),
  min_order_kg DECIMAL(10,2) DEFAULT 50,
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== LEADS / CLIENTS =====
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(200),
  contact_name VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  city VARCHAR(100),
  lead_type VARCHAR(50) DEFAULT 'inquiry', -- inquiry, fb_lead, chatbot, referral, google
  source VARCHAR(50), -- website, facebook, phone, email, chatbot
  status VARCHAR(30) DEFAULT 'new', -- new, contacted, qualified, offer_sent, negotiation, won, lost
  priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, hot
  company_type VARCHAR(50), -- construction, designer, distributor, other
  interest_products TEXT, -- comma-separated product SKUs
  estimated_value DECIMAL(12,2),
  notes TEXT,
  assigned_to VARCHAR(100),
  fb_lead_id VARCHAR(100),
  google_sheet_name VARCHAR(100),
  google_sheet_row INTEGER,
  last_contact_at TIMESTAMP,
  next_followup_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== LEAD ACTIVITY LOG =====
CREATE TABLE IF NOT EXISTS lead_activities (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- created, status_change, note_added, email_sent, call, followup, offer_sent
  description TEXT,
  old_value VARCHAR(100),
  new_value VARCHAR(100),
  performed_by VARCHAR(100) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== OFFERS =====
CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  offer_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(30) DEFAULT 'draft', -- draft, sent, viewed, accepted, rejected, expired
  items JSONB NOT NULL DEFAULT '[]', -- [{product_id, qty_kg, price_per_kg, total}]
  subtotal DECIMAL(12,2),
  discount_pct DECIMAL(5,2) DEFAULT 0,
  total DECIMAL(12,2),
  valid_until DATE,
  notes TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== FB ADS CAMPAIGNS =====
CREATE TABLE IF NOT EXISTS fb_campaigns (
  id SERIAL PRIMARY KEY,
  fb_campaign_id VARCHAR(100) UNIQUE,
  name VARCHAR(200),
  status VARCHAR(30), -- ACTIVE, PAUSED, ARCHIVED
  objective VARCHAR(50),
  daily_budget DECIMAL(10,2),
  lifetime_budget DECIMAL(10,2),
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2) DEFAULT 0,
  cpc DECIMAL(10,2) DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  leads_count INTEGER DEFAULT 0,
  cost_per_lead DECIMAL(10,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== FB LEAD FORMS =====
CREATE TABLE IF NOT EXISTS fb_leads_raw (
  id SERIAL PRIMARY KEY,
  fb_lead_id VARCHAR(100) UNIQUE,
  fb_form_id VARCHAR(100),
  fb_campaign_id VARCHAR(100),
  data JSONB, -- raw lead form data
  processed BOOLEAN DEFAULT false,
  lead_id INTEGER REFERENCES leads(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== GOOGLE SHEETS SYNC LOG =====
CREATE TABLE IF NOT EXISTS sheets_sync_log (
  id SERIAL PRIMARY KEY,
  sheet_name VARCHAR(100),
  direction VARCHAR(10), -- push, pull
  rows_affected INTEGER DEFAULT 0,
  status VARCHAR(20), -- success, error
  error_message TEXT,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- ===== CHATBOT CONVERSATIONS =====
CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100),
  visitor_name VARCHAR(200),
  visitor_phone VARCHAR(50),
  visitor_email VARCHAR(200),
  messages JSONB DEFAULT '[]',
  recommended_products TEXT,
  converted_to_lead BOOLEAN DEFAULT false,
  lead_id INTEGER REFERENCES leads(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== VIRTUAL EMPLOYEES (agents) =====
CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL,
  avatar_emoji VARCHAR(10),
  color VARCHAR(20),
  status VARCHAR(20) DEFAULT 'online', -- online, busy, away, offline
  current_task TEXT,
  tasks_completed INTEGER DEFAULT 0,
  last_active_at TIMESTAMP DEFAULT NOW()
);

-- ===== AGENT ACTIVITY LOG =====
CREATE TABLE IF NOT EXISTS agent_activities (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== DASHBOARD STATS (daily snapshots) =====
CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  new_leads INTEGER DEFAULT 0,
  qualified_leads INTEGER DEFAULT 0,
  offers_sent INTEGER DEFAULT 0,
  deals_won INTEGER DEFAULT 0,
  fb_spend DECIMAL(10,2) DEFAULT 0,
  fb_leads INTEGER DEFAULT 0,
  fb_clicks INTEGER DEFAULT 0,
  chatbot_conversations INTEGER DEFAULT 0,
  chatbot_leads INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_fb_campaigns_status ON fb_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_agent_activities_agent ON agent_activities(agent_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
