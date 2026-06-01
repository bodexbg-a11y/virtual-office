const axios = require('axios');
const db = require('../db');

const LEGACY_UNMATCHED_FB_CUTOFF = '2026-05-27 00:00:00';

async function ensureIgnoredFacebookLeads() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ignored_fb_leads (
      fb_lead_id TEXT PRIMARY KEY,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function ensureFacebookLeadColumns() {
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_campaign_id TEXT`);
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_campaign_name TEXT`);
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_ad_id TEXT`);
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_ad_name TEXT`);
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_form_id TEXT`);
}

class FacebookAdsService {
  constructor() {
    this.accessToken = process.env.FB_ACCESS_TOKEN;
    this.adAccountId = process.env.FB_AD_ACCOUNT_ID;
    this.baseUrl = 'https://graph.facebook.com/v19.0';
    this.initialized = false;
  }

  init() {
    if (this.accessToken && this.adAccountId) {
      this.initialized = true;
      console.log('✅ Facebook Ads API configured');
    } else {
      console.log('⚠️  Facebook Ads: credentials not configured, running in demo mode');
    }
  }

  async syncCampaigns() {
    if (!this.initialized) {
      return { success: true, demo: true, message: 'Demo: would sync campaigns' };
    }

    try {
      await db.query(`ALTER TABLE fb_campaigns ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0`);
      await db.query(`ALTER TABLE fb_campaigns ADD COLUMN IF NOT EXISTS insight_window TEXT`);
      await ensureFacebookLeadColumns();

      const res = await axios.get(`${this.baseUrl}/${this.adAccountId}/campaigns`, {
        params: {
          fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time',
          access_token: this.accessToken,
          limit: 50,
        },
      });

      let withInsights = 0;

      for (const c of res.data.data || []) {
        const insights = await this.getCampaignInsights(c.id);
        if (insights.hasData) withInsights += 1;

        await db.query(`
          INSERT INTO fb_campaigns (
            fb_campaign_id,
            name,
            status,
            objective,
            daily_budget,
            lifetime_budget,
            insight_window,
            reach,
            impressions,
            clicks,
            ctr,
            cpc,
            spend,
            leads_count,
            cost_per_lead,
            start_date,
            end_date,
            synced_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON CONFLICT(fb_campaign_id) DO UPDATE SET
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            objective = EXCLUDED.objective,
            daily_budget = EXCLUDED.daily_budget,
            lifetime_budget = EXCLUDED.lifetime_budget,
            insight_window = EXCLUDED.insight_window,
            reach = EXCLUDED.reach,
            impressions = EXCLUDED.impressions,
            clicks = EXCLUDED.clicks,
            ctr = EXCLUDED.ctr,
            cpc = EXCLUDED.cpc,
            spend = EXCLUDED.spend,
            leads_count = EXCLUDED.leads_count,
            cost_per_lead = EXCLUDED.cost_per_lead,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            synced_at = NOW(),
            updated_at = NOW()
        `, [
          c.id,
          c.name,
          c.status,
          c.objective,
          centsToMoney(c.daily_budget),
          centsToMoney(c.lifetime_budget),
          insights.date_preset,
          insights.reach,
          insights.impressions,
          insights.clicks,
          insights.ctr,
          insights.cpc,
          insights.spend,
          insights.leads,
          insights.cpl,
          c.start_time || null,
          c.stop_time || null,
        ]);
      }

      const leadFallback = await this.syncCampaignLeadCountsFromLeads();

      return {
        success: true,
        campaigns: res.data.data?.length || 0,
        campaigns_with_insights: withInsights,
        campaigns_with_lead_fallback: leadFallback.updated_campaigns,
      };
    } catch (err) {
      throw new Error(facebookErrorMessage(err));
    }
  }

  async getCampaignInsights(campaignId) {
    const presets = ['today', 'last_7d', 'last_30d'];
    let fallback = null;

    for (const preset of presets) {
      const insights = await this.fetchCampaignInsights(campaignId, preset);
      if (!fallback && insights.hasData) fallback = insights;
      if (hasUsefulInsights(insights)) return insights;
    }

    return fallback || emptyInsights();
  }

  async fetchCampaignInsights(campaignId, datePreset) {
    const res = await axios.get(`${this.baseUrl}/${campaignId}/insights`, {
      params: {
        fields: 'reach,impressions,clicks,ctr,cpc,spend,actions,cost_per_action_type',
        date_preset: datePreset,
        access_token: this.accessToken,
        limit: 1,
      },
    });

    const row = res.data.data?.[0];
    if (!row) return emptyInsights();

    const leads = actionValue(row.actions, [
      'lead',
      'offsite_conversion.lead',
      'onsite_conversion.lead',
      'onsite_conversion.lead_grouped',
      'offsite_conversion.fb_pixel_lead',
      'onsite_conversion.fb_pixel_lead',
      'leadgen',
      'leadgen_grouped',
      'onsite_conversion.leadgen',
      'onsite_conversion.leadgen_grouped',
    ], { max: true });

    const cpl = actionValue(row.cost_per_action_type, [
      'lead',
      'offsite_conversion.lead',
      'onsite_conversion.lead',
      'onsite_conversion.lead_grouped',
      'offsite_conversion.fb_pixel_lead',
      'onsite_conversion.fb_pixel_lead',
      'leadgen',
      'leadgen_grouped',
      'onsite_conversion.leadgen',
      'onsite_conversion.leadgen_grouped',
    ]);

    return {
      hasData: true,
      date_preset: datePreset,
      reach: toInt(row.reach),
      impressions: toInt(row.impressions),
      clicks: toInt(row.clicks),
      ctr: round(row.ctr),
      cpc: round(row.cpc),
      spend: round(row.spend),
      leads,
      cpl: cpl || (leads > 0 ? round(Number(row.spend || 0) / leads) : 0),
    };
  }

  async syncLeadForms() {
    if (!this.initialized) {
      return { success: true, demo: true, message: 'Demo: would sync lead forms' };
    }

    try {
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_fb_lead_id
        ON leads(fb_lead_id)
        WHERE fb_lead_id IS NOT NULL
      `);

      await ensureFacebookLeadColumns();
      await ensureIgnoredFacebookLeads();

      const pages = await this.getPages();

      let formsChecked = 0;
      let fbLeadsChecked = 0;
      let newLeads = 0;
      let updatedLeads = 0;
      let skippedExisting = 0;
      let skippedLegacyUnmatched = 0;

      for (const page of pages) {
        const pageToken = page.access_token || this.accessToken;
        const forms = await this.getLeadForms(page.id, pageToken);
        formsChecked += forms.length;

        for (const form of forms) {
          const leads = await this.getFormLeads(form.id, pageToken);
          fbLeadsChecked += leads.length;

          for (const fbLead of leads) {
            const mapped = mapFacebookLead(fbLead, page, form);

            const ignoredRes = await db.query(
              'SELECT 1 FROM ignored_fb_leads WHERE fb_lead_id = ?',
              [mapped.fb_lead_id]
            );

            if (ignoredRes.rows.length) {
              skippedLegacyUnmatched += 1;
              continue;
            }

            const existingRes = await db.query(
              'SELECT id, status FROM leads WHERE fb_lead_id = ?',
              [mapped.fb_lead_id]
            );

            const existing = existingRes.rows[0];

            if (existing) {
              skippedExisting += 1;
              continue;
            }

            const sheetMatch = await findOperationalSheetMatch(mapped);

            if (sheetMatch) {
              mapped.status = inferLeadStatusFromSheet(sheetMatch);
              mapped.google_sheet_name = sheetMatch.sheet_name;
              mapped.google_sheet_row = sheetMatch.row_number;
              mapped.notes = `${mapped.notes} | Google Sheets ${sheetMatch.sheet_name} row ${sheetMatch.row_number}: ${[
                sheetMatch.status,
                sheetMatch.action_needed,
                sheetMatch.problem,
              ].filter(Boolean).join(' / ')}`;
            }

            if (!sheetMatch && mapped.created_at && mapped.created_at < LEGACY_UNMATCHED_FB_CUTOFF) {
              skippedLegacyUnmatched += 1;
              continue;
            }

            const insertRes = await db.query(`
              INSERT INTO leads (
                company_name,
                contact_name,
                email,
                phone,
                city,
                lead_type,
                source,
                status,
                priority,
                company_type,
                interest_products,
                notes,
                assigned_to,
                fb_lead_id,
                fb_campaign_id,
                fb_campaign_name,
                fb_ad_id,
                fb_ad_name,
                fb_form_id,
                google_sheet_name,
                google_sheet_row,
                created_at
              )
              VALUES (?, ?, ?, ?, ?, 'fb_lead', 'facebook', ?, ?, ?, ?, ?, 'rostislav', ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?::timestamp, NOW()))
              RETURNING id
            `, [
              mapped.company_name,
              mapped.contact_name,
              mapped.email,
              mapped.phone,
              mapped.city,
              mapped.status || 'new',
              mapped.priority,
              mapped.company_type,
              mapped.interest_products,
              mapped.notes,
              mapped.fb_lead_id,
              mapped.fb_campaign_id,
              mapped.fb_campaign_name,
              mapped.fb_ad_id,
              mapped.fb_ad_name,
              mapped.fb_form_id,
              mapped.google_sheet_name || null,
              mapped.google_sheet_row || null,
              mapped.created_at,
            ]);

            const leadId = insertRes.rows[0].id;

            await db.query(`
              INSERT INTO lead_activities (
                lead_id,
                action,
                description,
                new_value,
                performed_by
              )
              VALUES (?, 'created', ?, ?, 'facebook')
            `, [
              leadId,
              `Facebook lead form: ${form.name || form.id}`,
              mapped.status || 'new',
            ]);

            if (mapped.status && mapped.status !== 'new') {
              await db.query(`
                INSERT INTO lead_activities (
                  lead_id,
                  action,
                  description,
                  old_value,
                  new_value,
                  performed_by
                )
                VALUES (?, 'status_change', ?, 'new', ?, 'google_sheets')
              `, [
                leadId,
                `Статус обновлён по листу ${mapped.google_sheet_name || 'Google Sheets'}`,
                mapped.status,
              ]);
            }

            newLeads += 1;
          }
        }
      }

      return {
        success: true,
        pages: pages.length,
        forms: formsChecked,
        leads_checked: fbLeadsChecked,
        new_leads: newLeads,
        updated_leads: updatedLeads,
        skipped_existing: skippedExisting,
        skipped_legacy_unmatched: skippedLegacyUnmatched,
      };
    } catch (err) {
      throw new Error(facebookErrorMessage(err));
    }
  }

  async syncCampaignLeadCountsFromLeads() {
    await ensureFacebookLeadColumns();

    const { rows: campaigns } = await db.query(`
      SELECT fb_campaign_id, spend, leads_count, insight_window
      FROM fb_campaigns
      WHERE fb_campaign_id IS NOT NULL
        AND fb_campaign_id NOT LIKE 'camp_%'
    `);

    let updatedCampaigns = 0;

    for (const campaign of campaigns) {
      const window = campaign.insight_window || 'last_30d';
      const dateClause = campaignLeadDateClause(window);
      const { rows } = await db.query(`
        SELECT COUNT(*)::int as leads
        FROM leads
        WHERE source = 'facebook'
          AND fb_campaign_id = ?
          ${dateClause}
      `, [campaign.fb_campaign_id]);

      const fallbackLeads = Number(rows[0]?.leads || 0);
      const currentLeads = Number(campaign.leads_count || 0);

      if (fallbackLeads <= currentLeads) continue;

      await db.query(`
        UPDATE fb_campaigns
        SET
          leads_count = ?,
          cost_per_lead = CASE
            WHEN ? > 0 THEN ROUND((COALESCE(spend, 0) / ?)::numeric, 2)
            ELSE cost_per_lead
          END,
          updated_at = NOW()
        WHERE fb_campaign_id = ?
      `, [
        fallbackLeads,
        fallbackLeads,
        fallbackLeads,
        campaign.fb_campaign_id,
      ]);

      updatedCampaigns += 1;
    }

    return { updated_campaigns: updatedCampaigns };
  }

  async getPages() {
    const res = await axios.get(`${this.baseUrl}/me/accounts`, {
      params: {
        fields: 'id,name,access_token',
        access_token: this.accessToken,
        limit: 50,
      },
    });

    return res.data.data || [];
  }

  async getLeadForms(pageId, accessToken) {
    const res = await axios.get(`${this.baseUrl}/${pageId}/leadgen_forms`, {
      params: {
        fields: 'id,name,status,leads_count',
        access_token: accessToken,
        limit: 100,
      },
    });

    return res.data.data || [];
  }

  async getFormLeads(formId, accessToken) {
    const res = await axios.get(`${this.baseUrl}/${formId}/leads`, {
      params: {
        fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id,platform',
        access_token: accessToken,
        limit: 100,
      },
    });

    return res.data.data || [];
  }

  async getCampaigns() {
    const { rows } = await db.query(`
      SELECT * FROM fb_campaigns
      WHERE fb_campaign_id NOT LIKE 'camp_%'
      ORDER BY synced_at DESC
    `);

    return rows;
  }

  async getSummary() {
    const { rows } = await db.query(`
      SELECT
        COUNT(*)::int as total_campaigns,
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END), 0)::int as active_campaigns,
        COALESCE(SUM(spend), 0)::numeric as total_spend,
        COALESCE(SUM(clicks), 0)::int as total_clicks,
        COALESCE(SUM(impressions), 0)::int as total_impressions,
        COALESCE(SUM(leads_count), 0)::int as total_leads,
        CASE
          WHEN SUM(clicks) > 0 THEN ROUND((SUM(spend) / SUM(clicks))::numeric, 2)
          ELSE 0
        END as avg_cpc,
        CASE
          WHEN SUM(leads_count) > 0 THEN ROUND((SUM(spend) / SUM(leads_count))::numeric, 2)
          ELSE 0
        END as avg_cpl,
        CASE
          WHEN SUM(impressions) > 0 THEN ROUND(((SUM(clicks)::numeric / SUM(impressions)::numeric) * 100), 2)
          ELSE 0
        END as avg_ctr
      FROM fb_campaigns
      WHERE fb_campaign_id NOT LIKE 'camp_%'
    `);

    return rows[0] || {};
  }
}

function emptyInsights() {
  return {
    hasData: false,
    date_preset: '',
    reach: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    spend: 0,
    leads: 0,
    cpl: 0,
  };
}

function hasUsefulInsights(insights) {
  return Boolean(
    Number(insights.reach || 0) > 0 ||
    Number(insights.impressions || 0) > 0 ||
    Number(insights.clicks || 0) > 0 ||
    Number(insights.spend || 0) > 0 ||
    Number(insights.leads || 0) > 0
  );
}

function centsToMoney(value) {
  return value ? Number(value) / 100 : null;
}

function toInt(value) {
  return Number.parseInt(value || 0, 10) || 0;
}

function round(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function actionValue(actions, names, options = {}) {
  const normalizedNames = names.map(name => String(name).toLowerCase());
  const matches = (actions || []).filter(item => {
    const type = String(item.action_type || '').toLowerCase();
    return normalizedNames.includes(type) || type.includes('lead') || type.includes('leadgen');
  });

  if (options.max) {
    return round(Math.max(0, ...matches.map(item => Number(item.value || 0))));
  }

  const found = matches.find(item => Number(item.value || 0) > 0) || matches[0];
  return found ? round(found.value) : 0;
}

function campaignLeadDateClause(window) {
  if (window === 'today') return 'AND created_at::date = CURRENT_DATE';
  if (window === 'last_7d') return "AND created_at >= NOW() - INTERVAL '7 days'";
  return "AND created_at >= NOW() - INTERVAL '30 days'";
}

function mapFacebookLead(lead, page, form) {
  const fields = {};

  for (const item of lead.field_data || []) {
    fields[item.name] = Array.isArray(item.values)
      ? item.values.join(', ')
      : item.values || '';
  }

  const get = (...names) => {
    for (const name of names) {
      if (fields[name]) return String(fields[name]).trim();
    }

    return '';
  };

  const fullName = get('full_name', 'name', 'имя', 'име');
  const company = get('company_name', 'company', 'фирма', 'компания', 'company_/_фирма');
  const materialInterest = get('interest_products', 'materials', 'material', 'материали', 'материалы', 'product');
  const serviceInterest = get('service', 'услуга', 'услуги', 'problem', 'проблем');
  const formAnswers = formatFacebookFormAnswers(fields);
  const campaign = lead.campaign_name || lead.ad_name || '';
  const formName = form.name || '';
  const combined = `${materialInterest} ${serviceInterest} ${campaign} ${formName}`.toLowerCase();

  return {
    fb_lead_id: lead.id,
    fb_campaign_id: lead.campaign_id || null,
    fb_campaign_name: lead.campaign_name || null,
    fb_ad_id: lead.ad_id || null,
    fb_ad_name: lead.ad_name || null,
    fb_form_id: lead.form_id || form.id || null,
    created_at: lead.created_time ? lead.created_time.replace('T', ' ').replace(/\+\d{4}$/, '') : null,
    status: 'new',
    company_name: company || fullName || `Facebook Lead ${lead.id}`,
    contact_name: company ? fullName : '',
    email: get('email', 'e-mail'),
    phone: get('phone_number', 'phone', 'телефон', 'mobile_phone_number'),
    city: get('city', 'град'),
    priority: combined.includes('urgent') || combined.includes('спеш') ? 'hot' : 'high',
    company_type: company ? 'construction' : 'other',
    interest_products: materialInterest || serviceInterest || campaign || formName,
    notes: formAnswers,
  };
}

function formatFacebookFormAnswers(fields) {
  return Object.entries(fields || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${humanizeFacebookFieldName(key)}: ${humanizeFacebookAnswer(value, key)}`)
    .join('\n');
}

function humanizeFacebookFieldName(key) {
  const normalized = String(key || '').toLowerCase();
  if (normalized.includes('full_name') || normalized === 'name') return 'Име';
  if (normalized.includes('phone')) return 'Телефон';
  if (normalized.includes('email')) return 'Email';
  if (normalized.includes('company_name')) return 'Компания';
  if (normalized.includes('какъв_тип_компания') || normalized.includes('тип_компания')) return 'Тип компания';
  if (normalized.includes('какви_материали') || normalized.includes('материали')) return 'Материалы';
  if (normalized.includes('какъв_тип_запитване') || normalized.includes('запитване')) return 'Обем / тип запитване';
  if (normalized.includes('city')) return 'Град';
  return String(key || '').replace(/_/g, ' ').replace(/\?+$/g, '').trim();
}

function humanizeFacebookAnswer(value, key) {
  const raw = String(value || '').trim();
  if (/email/i.test(key) || /phone/i.test(key) || raw.includes('@')) return raw;
  return raw
    .split(',')
    .map(item => item.trim().replace(/_/g, ' '))
    .filter(Boolean)
    .join(', ');
}

function normalizeContact(value) {
  return String(value || '').toLowerCase().replace(/[^a-zа-я0-9@.]/gi, '');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

async function findOperationalSheetMatch(mapped) {
  const phone = normalizePhone(mapped.phone);
  const email = normalizeContact(mapped.email);

  const { rows } = await db.query(`
    SELECT sheet_name, row_number, company_name, contact_name, phone, email, status, action_needed, problem, interest, notes
    FROM sheet_clients
    WHERE sheet_name IN ('МАТЕРИАЛЫ', 'УСЛУГИ')
      AND (
        (? != '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = ?)
        OR (? != '' AND lower(COALESCE(email, '')) = ?)
      )
    ORDER BY CASE sheet_name
      WHEN 'МАТЕРИАЛЫ' THEN 1
      WHEN 'УСЛУГИ' THEN 2
      ELSE 3
    END, row_number
    LIMIT 1
  `, [
    phone,
    phone,
    email,
    email,
  ]);

  return rows[0] || null;
}

function inferLeadStatusFromSheet(row) {
  const text = String([
    row.status,
    row.action_needed,
    row.problem,
    row.interest,
    row.notes,
  ].filter(Boolean).join(' ')).toLowerCase().replace(/ё/g, 'е');

  if (!text.trim()) return 'new';
  if (/отказ|не\s+интерес|неинтерес|нет\s+интерес/.test(text)) return 'lost';
  if (/договор|закуп|готов/.test(text)) return 'negotiation';
  if (/коммерческ|оферт|предложен|\bкп\b/.test(text)) return 'offer_sent';
  if (/встреч|срещ|дума|цена|жд[уе]т|ответит/.test(text)) return 'negotiation';
  if (/поговор|говор|звон|вайбер|пинг|пропинг|посмотр|интерес|каталог|презентац|форма/.test(text)) return 'contacted';

  return 'contacted';
}

function facebookErrorMessage(err) {
  const message = err.response?.data?.error?.message ||
    err.response?.data?.error?.error_user_msg ||
    err.message;

  if (/api access blocked/i.test(message)) {
    return 'Meta API access blocked. Facebook заблокировал API-доступ для этого токена или приложения. Проверьте, что приложение Maria активно, токен создан от пользователя/системного пользователя с доступом к рекламному аккаунту, а permissions ads_read, ads_management, leads_retrieval и business_management реально выданы для этого ad account.';
  }

  return message;
}

module.exports = new FacebookAdsService();
