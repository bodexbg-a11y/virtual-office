const { google } = require('googleapis');
const db = require('../db');

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    this.initialized = false;
    this.lastError = null;
  }

  async init() {
    this.lastError = null;
    this.initialized = false;
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (
      !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
      !process.env.GOOGLE_PRIVATE_KEY ||
      !process.env.GOOGLE_SPREADSHEET_ID
    ) {
      console.log('⚠️  Google Sheets: credentials not configured, running in demo mode');
      return;
    }

    try {
      const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

      const auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
      );

      this.sheets = google.sheets({ version: 'v4', auth });

      await this.testConnection();
      await this.ensureBusinessTables();

      this.initialized = true;
      console.log('✅ Google Sheets connected');
    } catch (err) {
      this.lastError = formatGoogleError(err);
      console.error('❌ Google Sheets init error:', this.lastError);
    }
  }

  async testConnection() {
    if (!this.sheets || !this.spreadsheetId) {
      throw new Error('Google Sheets is not configured');
    }

    const res = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'spreadsheetId,properties.title,sheets.properties.title',
    });

    return {
      ok: true,
      spreadsheetId: res.data.spreadsheetId,
      title: res.data.properties?.title || 'Google Sheet',
      sheets: (res.data.sheets || []).map(s => s.properties.title),
    };
  }

  async ensureStructure() {
    const meta = await this.testConnection();
    return {
      ok: true,
      readOnly: true,
      createdSheets: [],
      sheets: meta.sheets,
      message: 'Google Sheets is read-only. App data stays in Neon DB.',
    };
  }

  async ensureBusinessTables() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS sheet_clients (
        id SERIAL PRIMARY KEY,
        sheet_name TEXT NOT NULL,
        row_number INTEGER NOT NULL,
        segment TEXT,
        company_name TEXT,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        city TEXT,
        object_type TEXT,
        problem TEXT,
        interest TEXT,
        action_needed TEXT,
        status TEXT,
        priority TEXT,
        result TEXT,
        deal TEXT,
        notes TEXT,
        raw_json TEXT,
        synced_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(sheet_name, row_number)
      );

      CREATE INDEX IF NOT EXISTS idx_sheet_clients_sheet ON sheet_clients(sheet_name);
      CREATE INDEX IF NOT EXISTS idx_sheet_clients_status ON sheet_clients(status);
      CREATE INDEX IF NOT EXISTS idx_sheet_clients_priority ON sheet_clients(priority);
      CREATE INDEX IF NOT EXISTS idx_sheet_clients_company ON sheet_clients(company_name);
    `);
  }

  async prepareLeadHeaders() {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: 'Leads!A1:M1',
      valueInputOption: 'RAW',
      resource: { values: [this.leadHeader()] },
    });
  }

  async prepareProductHeaders() {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: 'Products!A1:F1',
      valueInputOption: 'RAW',
      resource: { values: [this.productHeader()] },
    });
  }

  async prepareStatsHeaders() {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: 'Stats!A1:K1',
      valueInputOption: 'RAW',
      resource: { values: [this.statsHeader()] },
    });
  }

  async pushLeads() {
    if (!this.initialized) return this._demo('push', 'Leads');

    try {
      await this.ensureStructure();

      const { rows } = await db.query('SELECT * FROM leads ORDER BY created_at DESC');

      const header = this.leadHeader();

      const values = [
        header,
        ...rows.map(r => [
          r.id,
          r.company_name,
          r.contact_name,
          r.email,
          r.phone,
          r.city,
          r.status,
          r.priority,
          r.company_type,
          r.interest_products,
          r.estimated_value,
          r.source,
          r.created_at,
        ]),
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Leads!A1',
        valueInputOption: 'RAW',
        resource: { values },
      });

      await this._log('Leads', 'push', rows.length, 'success');

      return { success: true, rows: rows.length };
    } catch (err) {
      await this._log('Leads', 'push', 0, 'error', err.message);
      throw err;
    }
  }

  async pushProducts() {
    if (!this.initialized) return this._demo('push', 'Products');

    try {
      await this.ensureStructure();

      const { rows } = await db.query('SELECT * FROM products ORDER BY category, name');

      const header = this.productHeader();

      const values = [
        header,
        ...rows.map(r => [
          r.sku,
          r.name_bg || r.name,
          r.category,
          r.description_bg,
          r.min_order_kg,
          r.in_stock ? 'Да' : 'Не',
        ]),
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Products!A1',
        valueInputOption: 'RAW',
        resource: { values },
      });

      await this._log('Products', 'push', rows.length, 'success');

      return { success: true, rows: rows.length };
    } catch (err) {
      await this._log('Products', 'push', 0, 'error', err.message);
      throw err;
    }
  }

  async pushStats() {
    if (!this.initialized) return this._demo('push', 'Stats');

    try {
      await this.ensureStructure();

      const { rows } = await db.query('SELECT * FROM daily_stats ORDER BY date DESC LIMIT 30');

      const header = this.statsHeader();

      const values = [
        header,
        ...rows.map(r => [
          r.date,
          r.new_leads,
          r.qualified_leads,
          r.offers_sent,
          r.deals_won,
          r.fb_spend,
          r.fb_leads,
          r.fb_clicks,
          r.chatbot_conversations,
          r.chatbot_leads,
          r.revenue,
        ]),
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Stats!A1',
        valueInputOption: 'RAW',
        resource: { values },
      });

      await this._log('Stats', 'push', rows.length, 'success');

      return { success: true, rows: rows.length };
    } catch (err) {
      await this._log('Stats', 'push', 0, 'error', err.message);
      throw err;
    }
  }

  async pullLeads() {
    if (!this.initialized) return this._demo('pull', 'Leads');

    try {
      await this.ensureStructure();

      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Leads!A2:M',
      });

      const rows = res.data.values || [];
      let updated = 0;

      for (const row of rows) {
        const [id, , , , , , status, priority] = row;

        if (id) {
          await db.query(`
            UPDATE leads
            SET status = COALESCE(?, status),
                priority = COALESCE(?, priority),
                updated_at = NOW()
            WHERE id = ?
          `, [status || null, priority || null, parseInt(id, 10)]);

          updated++;
        }
      }

      await this._log('Leads', 'pull', updated, 'success');

      return { success: true, rows: updated };
    } catch (err) {
      await this._log('Leads', 'pull', 0, 'error', err.message);
      throw err;
    }
  }

  async pullBusinessSheets() {
    if (!this.initialized) return this._demo('pull', 'Business Sheets');

    await this.ensureBusinessTables();

    const sheetConfigs = [
      { name: 'УСЛУГИ', headerRow: 1 },
      { name: 'МАТЕРИАЛЫ', headerRow: 1 },
      { name: 'ПРОЕКТЫ', headerRow: 1 },
      { name: 'b2b', headerRow: 3 },
    ];

    const summary = {};
    let total = 0;

    for (const config of sheetConfigs) {
      const imported = await this.pullBusinessSheet(config);
      summary[config.name] = imported;
      total += imported;
    }

    await this._log('BusinessSheets', 'pull', total, 'success');

    return { success: true, rows: total, summary };
  }

  async pullBusinessSheet({ name, headerRow }) {
    await this.ensureBusinessTables();

    const range = `'${name}'!A1:Z1000`;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const values = res.data.values || [];
    const header = values[headerRow - 1] || [];
    const rows = values.slice(headerRow);

    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = headerRow + 1 + i;
      const raw = rowToObject(header, row);
      const client = mapBusinessClient(name, raw, row);

      if (!hasClientIdentity(client)) continue;

      await db.query(`
        INSERT INTO sheet_clients (
          sheet_name,
          row_number,
          segment,
          company_name,
          contact_name,
          phone,
          email,
          city,
          object_type,
          problem,
          interest,
          action_needed,
          status,
          priority,
          result,
          deal,
          notes,
          raw_json,
          synced_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON CONFLICT(sheet_name, row_number) DO UPDATE SET
          segment = EXCLUDED.segment,
          company_name = EXCLUDED.company_name,
          contact_name = EXCLUDED.contact_name,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          city = EXCLUDED.city,
          object_type = EXCLUDED.object_type,
          problem = EXCLUDED.problem,
          interest = EXCLUDED.interest,
          action_needed = EXCLUDED.action_needed,
          status = EXCLUDED.status,
          priority = EXCLUDED.priority,
          result = EXCLUDED.result,
          deal = EXCLUDED.deal,
          notes = EXCLUDED.notes,
          raw_json = EXCLUDED.raw_json,
          synced_at = NOW()
      `, [
        name,
        rowNumber,
        clean(client.segment),
        clean(client.company_name),
        clean(client.contact_name),
        cleanPhone(client.phone),
        clean(client.email),
        clean(client.city),
        clean(client.object_type),
        clean(client.problem),
        clean(client.interest),
        clean(client.action_needed),
        clean(client.status),
        normalizePriority(client.priority),
        clean(client.result),
        clean(client.deal),
        clean(client.notes),
        JSON.stringify(raw),
      ]);

      imported++;
    }

    return imported;
  }

  async getBusinessClients(filters = {}) {
    await this.ensureBusinessTables();

    const where = [];
    const params = [];

    if (filters.sheet_name) {
      where.push('sheet_name = ?');
      params.push(filters.sheet_name);
    }

    if (filters.status) {
      where.push("LOWER(COALESCE(status, '')) LIKE ?");
      params.push(`%${filters.status.toLowerCase()}%`);
    }

    if (filters.action_needed) {
      where.push("LOWER(COALESCE(action_needed, '')) LIKE ?");
      params.push(`%${filters.action_needed.toLowerCase()}%`);
    }

    if (filters.priority) {
      where.push('priority = ?');
      params.push(filters.priority);
    }

    if (filters.search) {
      where.push(`
        (
          LOWER(COALESCE(company_name, '')) LIKE ?
          OR LOWER(COALESCE(contact_name, '')) LIKE ?
          OR LOWER(COALESCE(phone, '')) LIKE ?
          OR LOWER(COALESCE(email, '')) LIKE ?
          OR LOWER(COALESCE(problem, '')) LIKE ?
          OR LOWER(COALESCE(notes, '')) LIKE ?
        )
      `);

      const term = `%${filters.search.toLowerCase()}%`;
      params.push(term, term, term, term, term, term);
    }

    const sql = `
      SELECT * FROM sheet_clients
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE priority
          WHEN 'hot' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        synced_at DESC,
        id DESC
      LIMIT ?
    `;

    params.push(Number(filters.limit || 300));

    const { rows } = await db.query(sql, params);

    const statsRes = await db.query(`
      SELECT
        COUNT(*)::int as total,
        COALESCE(SUM(CASE WHEN sheet_name = 'УСЛУГИ' THEN 1 ELSE 0 END), 0)::int as services,
        COALESCE(SUM(CASE WHEN sheet_name = 'МАТЕРИАЛЫ' THEN 1 ELSE 0 END), 0)::int as materials,
        COALESCE(SUM(CASE WHEN sheet_name = 'ПРОЕКТЫ' THEN 1 ELSE 0 END), 0)::int as projects,
        COALESCE(SUM(CASE WHEN sheet_name = 'b2b' THEN 1 ELSE 0 END), 0)::int as b2b,
        COALESCE(SUM(CASE WHEN priority IN ('hot', 'high') THEN 1 ELSE 0 END), 0)::int as high_priority,
        MAX(synced_at) as last_sync
      FROM sheet_clients
    `);

    return {
      rows,
      stats: statsRes.rows[0] || {},
    };
  }

  async getTodayRecommendations() {
    await this.ensureBusinessTables();

    const { rows: clients } = await db.query(`
      SELECT * FROM sheet_clients
      ORDER BY synced_at DESC
    `);

    const recommendations = [];

    const noCall = value => /не\s*звон|не\s*звън|do not call/i.test(value || '');

    const interested = clients.filter(c =>
      !noCall(`${c.status} ${c.action_needed} ${c.notes}`)
      && /(интерес|заинтерес|высок|high|очень|много)/i.test(`${c.status} ${c.priority} ${c.interest} ${c.notes}`)
    );

    const needsAction = clients.filter(c =>
      !noCall(`${c.status} ${c.action_needed} ${c.notes}`)
      && c.action_needed
      && !/(готово|done|спечелен|lost|загуб)/i.test(`${c.status} ${c.result}`)
    );

    const b2bNoCallStatus = clients.filter(c =>
      c.sheet_name === 'b2b'
      && !c.status
      && !noCall(`${c.status} ${c.notes}`)
    );

    const projects = clients.filter(c =>
      c.sheet_name === 'ПРОЕКТЫ'
      && !/(спечелен|завършен|done|lost|загуб)/i.test(c.status || '')
    );

    if (interested.length) {
      recommendations.push({
        type: 'hot',
        title: `Свържете се с ${Math.min(interested.length, 10)} топли клиента`,
        description: 'Това са хора с интерес/висок приоритет от УСЛУГИ и МАТЕРИАЛИ. Първо изпратете каталог/оферта, после обаждане.',
        count: interested.length,
        clients: interested.slice(0, 10),
      });
    }

    if (needsAction.length) {
      recommendations.push({
        type: 'followup',
        title: `Затворете ${Math.min(needsAction.length, 10)} отворени действия`,
        description: 'В таблицата има попълнено действие, но няма финален резултат. Това са най-лесните задачи за днес.',
        count: needsAction.length,
        clients: needsAction.slice(0, 10),
      });
    }

    if (b2bNoCallStatus.length) {
      recommendations.push({
        type: 'b2b',
        title: `Обработете B2B база: ${b2bNoCallStatus.length} контакта без статус`,
        description: 'Започнете с дистрибутори/вносители и строителни фирми. След обаждане попълвайте “Статус звонка” в Google таблицата.',
        count: b2bNoCallStatus.length,
        clients: b2bNoCallStatus.slice(0, 10),
      });
    }

    if (projects.length) {
      recommendations.push({
        type: 'project',
        title: `${projects.length} проекта чакат движение`,
        description: 'Проверете оглед, оферта, срок и следваща стъпка по активните проекти.',
        count: projects.length,
        clients: projects.slice(0, 10),
      });
    }

    return recommendations;
  }

  async getSyncHistory() {
    const { rows } = await db.query(`
      SELECT * FROM sheets_sync_log
      ORDER BY synced_at DESC
      LIMIT 20
    `);

    return rows;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      spreadsheetId: this.spreadsheetId || '',
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
      lastError: this.lastError,
    };
  }

  leadHeader() {
    return [
      'ID',
      'Компания',
      'Контакт',
      'Email',
      'Телефон',
      'Град',
      'Статус',
      'Приоритет',
      'Тип',
      'Продукти',
      'Стойност',
      'Източник',
      'Дата',
    ];
  }

  productHeader() {
    return [
      'SKU',
      'Име',
      'Категория',
      'Описание',
      'Мин. поръчка',
      'Наличност',
    ];
  }

  statsHeader() {
    return [
      'Дата',
      'Нови лидове',
      'Квалифицирани',
      'Оферти',
      'Сделки',
      'FB разход',
      'FB лидове',
      'FB кликове',
      'Чатбот',
      'Чатбот лидове',
      'Приход',
    ];
  }

  async _log(sheet, dir, count, status, error = null) {
    try {
      await db.query(`
        INSERT INTO sheets_sync_log (
          sheet_name,
          direction,
          rows_affected,
          status,
          error_message
        )
        VALUES (?, ?, ?, ?, ?)
      `, [sheet, dir, count, status, error]);
    } catch (err) {
      console.error('❌ Sync log error:', err.message);
    }
  }

  _demo(dir, sheet) {
    return {
      success: true,
      demo: true,
      message: `Demo: would ${dir} ${sheet}`,
    };
  }
}

function normalizePrivateKey(raw) {
  return raw
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n')
    .trim();
}

function rowToObject(header, row) {
  const obj = {};

  header.forEach((key, index) => {
    if (key) obj[String(key).trim()] = row[index] || '';
  });

  return obj;
}

function mapBusinessClient(sheetName, raw, row) {
  if (sheetName === 'УСЛУГИ') {
    return {
      segment: raw['тип_на_обекта_и_мащаб_:_'],
      company_name: raw.Company,
      contact_name: raw.full_name,
      phone: raw.phone,
      email: raw.email,
      object_type: raw['Обьект'],
      problem: raw['Проблема'] || raw['Problem '],
      status: raw['Статус'],
      action_needed: raw['Действие'],
      notes: raw['Форма'],
    };
  }

  if (sheetName === 'МАТЕРИАЛЫ') {
    return {
      segment: raw['какъв_тип_компания_представлявате?'],
      company_name: raw.company_name,
      contact_name: raw['Имя Фамилия'],
      phone: raw['Телефон'],
      email: raw.email,
      interest: raw['какви_материали_ви_интересуват?'] || raw['Интерес'],
      problem: raw['Контекст разговора'],
      action_needed: raw['Действие '],
      status: raw['Статус Действия'],
      priority: raw['Приоритет'],
      result: raw['Результат'],
      deal: raw['Сделка'],
      notes: raw['Условия'],
    };
  }

  if (sheetName === 'ПРОЕКТЫ') {
    return {
      company_name: raw['Клиент'],
      city: raw['Город'],
      object_type: raw['Тип объекта'],
      problem: raw['Описание проблемы'],
      interest: raw['Материалы / Решение'],
      status: raw['Статус проекта'],
      action_needed: raw['ETA / Срок'],
      priority: raw['Бюджет'] ? 'high' : 'medium',
      notes: [
        raw['Адрес объекта'],
        raw['Ответственный'],
        raw['Комментарий'],
        raw['Документы'],
      ].filter(Boolean).join(' | '),
      result: raw['Дата старта'],
    };
  }

  if (sheetName === 'b2b') {
    return {
      segment: raw['Сегмент'],
      company_name: raw['Компания'],
      city: raw['Град'],
      phone: raw['Телефон'],
      email: raw['Email'],
      status: raw['Статус звонка'],
      priority: raw['Ст-с'] === '✅' ? 'high' : 'medium',
      notes: [
        raw['Адрес / Сайт'],
        raw['Профил / Бележка'],
      ].filter(Boolean).join(' | '),
    };
  }

  return {
    notes: JSON.stringify(raw),
    contact_name: row.filter(Boolean).join(' '),
  };
}

function hasClientIdentity(client) {
  return !!(
    clean(client.company_name) ||
    clean(client.contact_name) ||
    clean(client.phone) ||
    clean(client.email)
  );
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function cleanPhone(value) {
  return clean(value).replace(/^p:/i, '').trim();
}

function normalizePriority(value) {
  const text = clean(value).toLowerCase();

  if (!text) return 'medium';
  if (/hot|очень|много|высок|high|✅/.test(text)) return 'high';
  if (/низ|low/.test(text)) return 'low';

  return 'medium';
}

function formatGoogleError(err) {
  const message = err.response?.data?.error?.message || err.errors?.[0]?.message || err.message;

  if (message.includes('The caller does not have permission')) {
    return 'Няма достъп до таблицата. Споделете Google Sheet-а със service account email като Editor.';
  }

  if (message.includes('Requested entity was not found')) {
    return 'Spreadsheet ID не е намерен. Проверете ID от URL на Google Sheet.';
  }

  if (message.includes('invalid_grant') || message.includes('Invalid JWT')) {
    return 'Невалиден Service Account ключ. Проверете client_email и private_key от JSON файла.';
  }

  return message;
}

module.exports = new GoogleSheetsService();
