// ===== BODEX Virtual Office — Frontend App =====

const API = 'https://virtual-office-f48m.onrender.com';
const ADMIN_ONLY_PAGES = new Set(['dashboard', 'office', 'goals', 'facebook', 'sheets', 'settings', 'agent-reports', 'offers', 'logistics', 'payments', 'tires', 'tire-base']);
let currentPage = 'leads';
let currentRole = 'worker';
let adminToken = localStorage.getItem('bodex_admin_token') || '';
let markAgentPoll = null;
let currentLeadFilters = {};
let currentProjectFilters = { q: '', status: '' };
let currentContractorFilters = { q: '', active: '1' };
let agentReportsFilters = { agent: 'all', date_from: '', date_to: '', limit: 100 };
let agentReportsCache = [];
let currentOfferDraft = null;
let currentLeadFormResponses = [];
let currentLeadDetail = null;
let currentLeadQualificationActivities = [];
let bulkPingRecipients = [];
let bulkPingQueue = [];
let bulkPingQueueIndex = 0;
let bulkPingQueueChannel = '';
let currentLeadRowsForExport = [];
const OBJECT_CRM_STAGES = ['new', 'needs_discovery', 'offer_preparation', 'offer_sent', 'negotiation', 'office_meeting', 'contract', 'purchase', 'won', 'lost'];
const DISTRIBUTOR_CRM_STAGES = ['partner_new', 'partner_qualification', 'partner_negotiation', 'partner_meeting', 'partner_terms_sent', 'partner_test_order', 'partner_active', 'lost'];
const CRM_STAGES = [...new Set([...OBJECT_CRM_STAGES, ...DISTRIBUTOR_CRM_STAGES])];
const GMAIL_SENDERS = [
  { key: 'bodex', email: 'bodexbg@gmail.com', label: 'Bodex Bulgaria' },
  { key: 'vlad', email: 'vlad@bodexbg.com', label: 'Vladyslav Mes' },
];
let gmailAccountsCache = [];
let selectedGmailSenderKey = GMAIL_SENDERS.some(sender => sender.key === localStorage.getItem('bodex_gmail_sender_key'))
  ? localStorage.getItem('bodex_gmail_sender_key')
  : 'bodex';
const SERVICES_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeOqHotu23EdiGiV81GOIQGrFLAFX9MflOxO1YxtlDeaJRIag/viewform?usp=header';
const MATERIALS_OBJECT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScqNRc5f2X_RQ92q4WaWhXjaWoc5FS5CbDF1l3BECXdHwywgA/viewform?usp=header';
const DISTRIBUTOR_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSePY55DYlgh7BMb94fjB0G-IRIWyqmK9rlIc2d3S4CbjjuVUA/viewform?usp=header';
const BODEX_WEBSITE_URL = 'https://bodexbg.com/';

function selectedGmailSender() {
  return GMAIL_SENDERS.find(sender => sender.key === selectedGmailSenderKey) || GMAIL_SENDERS[0];
}

function gmailSenderOptions() {
  return GMAIL_SENDERS.map(sender => `
    <option value="${sender.key}" ${selectedGmailSenderKey === sender.key ? 'selected' : ''} ${gmailSenderConnected(sender.email) ? '' : 'disabled'}>
      ${escapeHtml(sender.label)} — ${escapeHtml(sender.email)}${gmailSenderConnected(sender.email) ? '' : ' (не подключен)'}
    </option>
  `).join('');
}

function setGmailSender(key) {
  if (!GMAIL_SENDERS.some(sender => sender.key === key)) return;
  selectedGmailSenderKey = key;
  localStorage.setItem('bodex_gmail_sender_key', key);
}

function gmailSenderConnected(email) {
  return gmailAccountsCache.some(account => account.email === email && account.connected);
}

function ensureConnectedGmailSender() {
  if (gmailSenderConnected(selectedGmailSender().email)) return true;
  const connected = GMAIL_SENDERS.find(sender => gmailSenderConnected(sender.email));
  if (!connected) return false;
  setGmailSender(connected.key);
  return true;
}

// ===== NAVIGATION =====
function navigate(page) {
  if (ADMIN_ONLY_PAGES.has(page) && currentRole !== 'admin') {
    page = 'leads';
  }
  currentPage = page;
  toggleMobileSidebar(false);
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage(page);
}

function toggleMobileSidebar(forceState) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar || !backdrop) return;
  const nextOpen = typeof forceState === 'boolean'
    ? forceState
    : !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', nextOpen);
  backdrop.classList.toggle('show', nextOpen);
  document.body.classList.toggle('mobile-nav-open', nextOpen);
}

async function renderPage(page) {
  const main = document.getElementById('main');
  main.innerHTML = '<div style="text-align:center;padding:60px;color:#555;">Зареждане...</div>';

  try {
    if (ADMIN_ONLY_PAGES.has(page) && currentRole !== 'admin') {
      await renderAdminGate(main);
      return;
    }
    switch (page) {
      case 'dashboard': await renderDashboard(main); break;
      case 'goals': await renderGoals(main); break;
      case 'office': await renderOffice(main); break;
      case 'worker-rostislav': await renderWorker(main, 'rostislav'); break;
      case 'worker-mark': await renderWorker(main, 'mark'); break;
      case 'worker-maria': await renderWorker(main, 'maria'); break;
      case 'worker-steve': await renderWorker(main, 'steve'); break;
      case 'agent-reports': await renderAgentReports(main); break;
      case 'leads': await renderLeads(main); break;
      case 'tires': await renderLeads(main, { view: 'tires' }); break;
      case 'tire-base': await renderLeads(main, { view: 'tire_base' }); break;
      case 'clients': await renderClients(main); break;
      case 'deals': await renderDeals(main); break;
      case 'projects': await renderProjects(main); break;
      case 'contractors': await renderContractors(main); break;
      case 'pipeline': await renderPipeline(main); break;
      case 'facebook': await renderFacebook(main); break;
      case 'sheets': await renderSheets(main); break;
      case 'products': await renderProducts(main); break;
      case 'offers': await renderOffers(main); break;
      case 'logistics': await renderLogistics(main); break;
      case 'payments': await renderPayments(main); break;
      case 'settings': await renderSettings(main); break;
      default: main.innerHTML = '<h2>404</h2>';
    }
  } catch (err) {
    main.innerHTML = `<div class="card"><p style="color:var(--red);">Грешка: ${err.message}</p><p style="color:#666;margin-top:8px;">Уверете се, че сървърът работи на порт ${location.port || 3000}</p></div>`;
  }
}

// ===== API HELPER =====
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(adminToken ? { 'X-Admin-Token': adminToken } : {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

async function refreshRole() {
  try {
    const s = await api('/api/auth/status');
    currentRole = s.role || 'worker';
  } catch {
    currentRole = 'worker';
  }
  updateRoleUi();
}

function updateRoleUi() {
  document.querySelectorAll('.admin-only').forEach(el => {
    if (currentRole === 'admin') {
      el.style.display = el.classList.contains('nav-section') ? 'block' : 'flex';
    } else {
      el.style.display = 'none';
    }
  });
  const roleValue = document.getElementById('role-value');
  const loginBtn = document.getElementById('admin-login-btn');
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (roleValue) roleValue.textContent = currentRole === 'admin' ? 'Админ' : 'Работник / AI';
  if (loginBtn) loginBtn.style.display = currentRole === 'admin' ? 'none' : 'inline-flex';
  if (logoutBtn) logoutBtn.style.display = currentRole === 'admin' ? 'inline-flex' : 'none';
  if (currentRole !== 'admin' && ADMIN_ONLY_PAGES.has(currentPage)) {
    navigate('leads');
  }
}

async function openAdminLogin() {
  openModal('Админ вход', `
    <div class="form-group full">
      <label>Пароль администратора</label>
      <input id="admin-password" type="password" placeholder="Введите пароль" onkeyup="if(event.key==='Enter')loginAdmin()">
      <div style="font-size:11px;color:#666;margin-top:6px;">Админ-раздел содержит бизнес-план, цели и управленческие ориентиры.</div>
    </div>
    <div id="admin-login-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="loginAdmin()">Войти</button>
    </div>
  `);
  setTimeout(() => document.getElementById('admin-password')?.focus(), 50);
}

async function loginAdmin() {
  const result = document.getElementById('admin-login-result');
  const password = document.getElementById('admin-password').value;
  result.className = 'sync-result show';
  result.textContent = 'Проверяю пароль...';
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { password } });
    adminToken = data.token;
    localStorage.setItem('bodex_admin_token', adminToken);
    currentRole = 'admin';
    updateRoleUi();
    closeModal();
    navigate('goals');
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = '❌ Неверный пароль';
  }
}

async function logoutAdmin() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {}
  adminToken = '';
  localStorage.removeItem('bodex_admin_token');
  currentRole = 'worker';
  updateRoleUi();
  if (ADMIN_ONLY_PAGES.has(currentPage)) navigate('leads');
}

async function renderAdminGate(el) {
  el.innerHTML = `
    <div class="page-header fade-in"><h2>🔒 Админ доступ</h2></div>
    <div class="card fade-in">
      <div class="card-title">Этот раздел доступен только админу</div>
      <p style="font-size:13px;color:#aaa;line-height:1.6;margin-bottom:16px;">В рабочем режиме доступны лиды, клиенты, сделки, pipeline и разделы работников. Управление офисом, интеграциями и настройками видит только админ.</p>
      <button class="btn btn-primary" onclick="openAdminLogin()">Войти как админ</button>
    </div>
  `;
}

// ===== DASHBOARD =====
async function renderDashboard(el) {
  const [data, recommendations, weeklyAdmin] = await Promise.all([
    api('/api/dashboard/stats'),
    api('/api/google/recommendations').catch(() => []),
    currentRole === 'admin' ? api('/api/admin/weekly-report').catch(() => null) : Promise.resolve(null),
  ]);
  const leads = data.leads || {};
  const fb = data.fb || {};
  const followups = data.followups || { stats: {}, leads: [] };
  const waitingOffers = data.waiting_offers || { total: 0, leads: [] };
  const alerts = data.alerts || [];
  const hasFbData = Number(fb.campaigns || 0) > 0;

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>📊 Дашборд</h2>
      <div class="page-header-actions">
        <button class="btn btn-secondary" onclick="navigate('dashboard')">🔄 Обнови</button>
      </div>
    </div>

    <div class="stats-grid fade-in">
      <div class="stat-card">
        <div class="stat-label">Общо лидове</div>
        <div class="stat-value brand">${leads.total_leads || 0}</div>
        <div class="stat-sub">+${leads.today_leads || 0} днес</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Нови</div>
        <div class="stat-value blue">${leads.new_leads || 0}</div>
        <div class="stat-sub">Чакат обработка</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Активни сделки</div>
        <div class="stat-value yellow">${leads.active_leads || 0}</div>
        <div class="stat-sub">В работа</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Спечелени</div>
        <div class="stat-value green">${leads.won_deals || 0}</div>
        <div class="stat-sub">${Number(leads.won_value || 0).toLocaleString()} лв</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pipeline стойност</div>
        <div class="stat-value purple">${Number(leads.pipeline_value || 0).toLocaleString()} лв</div>
        <div class="stat-sub">Потенциал</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">FB разход</div>
        <div class="stat-value pink">${hasFbData ? `$${Number(fb.spend || 0).toLocaleString()}` : '—'}</div>
        <div class="stat-sub">${hasFbData ? `${fb.leads || 0} лида · CPL $${fb.avg_cpl || 0}` : 'нет данных из Meta'}</div>
      </div>
    </div>

    ${alerts.length ? `
      <div class="card fade-in" style="border-color:rgba(239,68,68,0.25);background:rgba(239,68,68,0.05);">
        <div class="card-title">🚨 Напоминания менеджеру</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
          ${alerts.map(alert => `
            <div style="padding:12px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;background:rgba(255,255,255,0.03);">
              <div style="font-weight:800;color:#fcd34d;">${alert.title}</div>
              <div style="font-size:12px;color:#b9bcc7;margin-top:4px;line-height:1.45;">${alert.note}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${(followups.stats?.due_total || 0) ? `
      <div class="card fade-in" style="border-color:rgba(245,158,11,0.35);background:rgba(245,158,11,0.06);">
        <div class="card-title">☎️ Задачи менеджера на сегодня</div>
        <div style="font-size:12px;color:#aaa;margin-bottom:12px;">
          ${followups.stats.today || 0} перезвонов на сегодня · ${followups.stats.overdue || 0} просрочено · ${followups.stats.new_leads || 0} новых · ${followups.stats.high_priority || 0} high priority
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Когда</th><th>Клиент</th><th>Контакт</th><th>Почему сегодня</th><th>Что сделать</th><th>Статус</th><th></th></tr></thead>
            <tbody>
              ${followups.leads.map(l => `
                <tr>
                  <td style="color:#facc15;font-weight:700;">${formatDateTime(l.next_followup_at) || 'Сегодня'}</td>
                  <td style="font-weight:700;color:#ddd;">${l.company_name || l.contact_name || ('Лид #' + l.id)}<div style="font-size:10px;color:#777;">${l.city || ''}</div></td>
                  <td>${l.phone || l.email || '—'}</td>
                  <td style="font-size:12px;color:#ddd;">${l.today_reason || 'Связаться'}</td>
                  <td style="font-size:12px;color:#ddd;font-weight:600;">${l.manager_action || 'Связаться'}</td>
                  <td><span class="badge badge-${l.status || 'new'}">${statusLabel(l.status)}</span></td>
                  <td><button class="btn btn-secondary btn-sm" onclick="openLeadDetail(${l.id})">Открыть</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn btn-secondary" style="margin-top:12px;" onclick="renderLeads(document.getElementById('main'))">Открыть все лиды</button>
      </div>
    ` : ''}

    ${waitingOffers.leads?.length ? `
      <div class="card fade-in" style="border-color:rgba(99,102,241,0.35);background:rgba(99,102,241,0.06);">
        <div class="card-title">📄 Ждут КП</div>
        <div style="font-size:12px;color:#aaa;margin-bottom:12px;">${waitingOffers.leads.length} лидов по материалам ждут коммерческое предложение.</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Клиент</th><th>Контакт</th><th>Статус</th><th>Интерес</th><th></th></tr></thead>
            <tbody>
              ${waitingOffers.leads.map(l => `
                <tr>
                  <td style="font-weight:700;color:#ddd;">${l.company_name || l.contact_name || ('Лид #' + l.id)}</td>
                  <td>${l.phone || l.email || '—'}</td>
                  <td><span class="badge badge-${l.status || 'needs_discovery'}">${statusLabel(l.status || 'needs_discovery')}</span></td>
                  <td style="font-size:12px;color:#bbb;">${l.interest_products || 'Материалы'}</td>
                  <td style="text-align:right;">
                    <button class="btn btn-secondary btn-sm" onclick="openLeadDetail(${l.id})">Открыть</button>
                    ${currentRole === 'admin' ? `<button class="btn btn-primary btn-sm" onclick="openOfferModal(${l.id})">Создать КП</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <div class="grid-2 fade-in">
      <div class="card">
        <div class="card-title">🎯 Какво да правим днес</div>
        ${recommendations.length ? recommendations.slice(0, 4).map(r => `
          <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
              <div style="font-size:13px;font-weight:600;color:#ddd;">${r.title}</div>
              <span class="badge badge-${r.type === 'hot' ? 'hot' : r.type === 'b2b' ? 'qualified' : 'new'}">${r.count}</span>
            </div>
            <div style="font-size:11px;color:#888;margin-top:5px;line-height:1.45;">${r.description}</div>
          </div>
        `).join('') : '<div style="font-size:12px;color:#777;">Няма данни от работните таблици. Натиснете “Обнови от Google Sheets” в раздел Клиенти.</div>'}
        <button class="btn btn-secondary" style="margin-top:12px;" onclick="navigate('leads')">👥 Отвори клиентите</button>
      </div>

      <div class="card">
        <div class="card-title">📈 Лидове по източник</div>
        ${(data.sources || []).map(s => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:12px;">
            <span>${sourceLabel(s.source)}</span>
            <span style="color:var(--brand-light);font-weight:600;">${s.count}</span>
          </div>
        `).join('')}
      </div>
    </div>

    ${weeklyAdmin ? `
      <div class="card fade-in">
        <div class="card-title">🗓️ Админ-отчёт за неделю</div>
        <div class="stats-grid" style="margin-top:0;">
          <div class="stat-card"><div class="stat-label">Новые лиды</div><div class="stat-value brand">${weeklyAdmin.summary?.new_leads || 0}</div></div>
          <div class="stat-card"><div class="stat-label">В работе</div><div class="stat-value blue">${weeklyAdmin.summary?.touched_leads || 0}</div></div>
          <div class="stat-card"><div class="stat-label">Premium</div><div class="stat-value yellow">${weeklyAdmin.summary?.premium_leads || 0}</div></div>
          <div class="stat-card"><div class="stat-label">Ждут КП</div><div class="stat-value pink">${weeklyAdmin.summary?.waiting_offer || 0}</div></div>
          <div class="stat-card"><div class="stat-label">КП за неделю</div><div class="stat-value purple">${weeklyAdmin.summary?.offers_sent || 0}</div></div>
          <div class="stat-card"><div class="stat-label">Сделано Ростиславом</div><div class="stat-value green">${weeklyAdmin.summary?.manager_done || 0}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1.2fr .8fr;gap:12px;margin-top:14px;">
          <div style="padding:12px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-size:12px;font-weight:800;color:#ddd;margin-bottom:8px;">Что требует внимания</div>
            ${(weeklyAdmin.actions || []).map(item => `<div style="font-size:12px;color:#b9bcc7;line-height:1.5;padding:4px 0;">• ${item}</div>`).join('')}
          </div>
          <div style="padding:12px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-size:12px;font-weight:800;color:#ddd;margin-bottom:8px;">Топ-лиды недели</div>
            ${(weeklyAdmin.top_leads || []).map(l => `<div style="font-size:12px;color:#b9bcc7;line-height:1.45;padding:4px 0;"><strong style="color:#eee;">${l.company_name || l.contact_name || ('Лид #' + l.id)}</strong> · ${statusLabel(l.status)} · ${l.priority || 'medium'}</div>`).join('') || '<div style="font-size:12px;color:#777;">Нет данных</div>'}
          </div>
        </div>
      </div>
    ` : ''}

    <div class="grid-2 fade-in">
      <div class="card">
        <div class="card-title">🏢 Виртуален екип</div>
        ${(data.agents || []).map(a => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
            <span style="font-size:18px;">${a.avatar_emoji}</span>
            <div style="flex:1;">
              <div style="font-size:12px;font-weight:500;">${a.name}</div>
              <div style="font-size:10px;color:#666;">${a.current_task || a.role}</div>
            </div>
            <span class="badge badge-${a.status === 'online' ? 'won' : a.status === 'busy' ? 'qualified' : 'new'}">${a.status}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card fade-in worker-summary-board">
      <div class="card-title">👥 Кто что делает сейчас</div>
      <div class="worker-summary-grid">
        ${(data.worker_summary || []).map(w => renderDashboardWorkerSummary(w)).join('')}
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-title">📅 Реальные лиды из CRM (последние 7 дней)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Дата</th><th>Нови лидове</th></tr></thead>
          <tbody>
            ${(data.trend || []).length ? (data.trend || []).map(t => `
              <tr>
                <td>${t.date}</td>
                <td>${t.new_leads}</td>
              </tr>
            `).join('') : '<tr><td colspan="2" style="text-align:center;color:#666;padding:24px;">Нет реальных CRM данных за последние 7 дней.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('nav-badge-leads').textContent = leads.new_leads || 0;
}

function renderDashboardWorkerSummary(worker) {
  const run = worker.ai_run;
  const resultText = worker.latest_result
    ? worker.latest_result.note
    : (run?.message || 'Пока нет сохранённого результата.');
  const statusText = run
    ? `${agentRunLabel(run.status)}${run.rows_created ? ` · ${run.rows_created} строк` : ''}`
    : `${worker.tasks_done || 0} выполнено`;

  return `
    <div class="worker-summary-card" onclick="navigate('worker-${worker.id}')">
      <div class="worker-summary-head">
        <div class="worker-summary-avatar" style="background:${worker.color};">${worker.avatar_emoji}</div>
        <div>
          <div class="worker-summary-name">${worker.name}</div>
          <div class="worker-summary-role">${worker.role}</div>
        </div>
        <span class="badge badge-${worker.type === 'human' ? 'qualified' : 'won'}">${worker.type === 'human' ? 'Человек' : 'AI'}</span>
      </div>
      <div class="worker-summary-focus">
        <small>Сегодня делает</small>
        <span>${worker.current_task || worker.today_focus}</span>
      </div>
      <div class="worker-summary-stats">
        <div><strong>${worker.tasks_open || 0}</strong><small>в работе</small></div>
        <div><strong>${worker.tasks_done || 0}</strong><small>сделано</small></div>
        <div><strong>${worker.tasks_total || 0}</strong><small>задач</small></div>
      </div>
      <div class="worker-summary-result">
        <small>${run ? 'Последний запуск / результат' : 'Последний результат'}</small>
        <span>${resultText}</span>
      </div>
      <div class="worker-summary-foot">${statusText}</div>
    </div>
  `;
}

// ===== ADMIN GOALS =====
async function renderGoals(el) {
  const data = await api('/api/admin/goals');
  const current = data.currentData || {};

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>🎯 Цели 2026</h2>
      <div class="page-header-actions">
        <span class="badge badge-hot">ADMIN ONLY</span>
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-title">📌 Главный ориентир из бизнес-плана</div>
      <div style="font-size:22px;font-weight:700;color:#ddd;margin-bottom:10px;">BODEX Bulgaria: 3 крупных B2B контракта в 2026</div>
      <p style="font-size:13px;color:#aaa;line-height:1.6;max-width:980px;">${data.summary.positioning} ${data.summary.market} Главная стратегия: ${data.summary.strategy}</p>
      <div style="font-size:11px;color:#666;margin-top:12px;">Источник: ${data.source}</div>
    </div>

    <div class="stats-grid fade-in">
      ${data.annualTargets.map((t, i) => `
        <div class="stat-card">
          <div class="stat-label">${t.label}</div>
          <div class="stat-value ${['green','yellow','blue','purple','pink'][i] || 'brand'}" style="font-size:22px;">${t.value}</div>
          <div class="stat-sub">${t.note}</div>
        </div>
      `).join('')}
    </div>

    <div class="grid-2 fade-in">
      <div class="card">
        <div class="card-title">📊 Текущее состояние в приложении</div>
        <div class="goal-metrics">
          <div><span>${current.total_clients || 0}</span><small>контактов из таблиц</small></div>
          <div><span>${current.b2b_clients || 0}</span><small>B2B компаний</small></div>
          <div><span>${current.high_priority || 0}</span><small>высокий приоритет</small></div>
          <div><span>${current.projects || 0}</span><small>проектов</small></div>
          <div><span>${current.crm_leads || 0}</span><small>CRM лидов</small></div>
          <div><span>${Number(current.pipeline_value || 0).toLocaleString()}</span><small>лв pipeline</small></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🧭 Управленческий фокус на сегодня</div>
        ${data.todayAdminFocus.map(item => `
          <div class="goal-check">✓ ${item}</div>
        `).join('')}
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-title">📅 Квартальный план</div>
      <div class="quarter-grid">
        ${data.quarterlyPlan.map(q => `
          <div class="quarter-card">
            <div class="quarter-head">
              <div>
                <div class="quarter-title">${q.quarter}</div>
                <div class="quarter-focus">${q.focus}</div>
              </div>
              <span>${q.revenue}</span>
            </div>
            <div style="margin-top:12px;">
              ${q.goals.map(g => `<div class="goal-check">✓ ${g}</div>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="grid-2 fade-in">
      <div class="card">
        <div class="card-title">📣 Маркетинговые каналы</div>
        ${data.marketingChannels.map(c => `
          <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
            <div style="font-size:13px;font-weight:700;color:#ddd;">${c.name}</div>
            <div style="font-size:12px;color:#888;margin-top:4px;line-height:1.5;">${c.role}</div>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title">⚙️ Рабочие правила</div>
        ${data.operatingRules.map(rule => `
          <div class="goal-rule">${rule}</div>
        `).join('')}
      </div>
    </div>
  `;
}

// ===== OFFICE VIEW =====
async function renderOffice(el) {
  const workers = await api('/api/dashboard/workers');
  const colors = {
    '📞': 'linear-gradient(135deg,#f59e0b,#fbbf24)',
    '🔎': 'linear-gradient(135deg,#2563eb,#42a5f5)',
    '📢': 'linear-gradient(135deg,#ec4899,#f472b6)',
    '🌐': 'linear-gradient(135deg,#10b981,#34d399)',
  };

  el.innerHTML = `
    <div class="page-header fade-in"><h2>🏢 Виртуален офис</h2></div>
    <div class="card fade-in">
      <div class="card-title">📐 Работен екип BODEX</div>
      <div class="office-grid">
        ${workers.map(w => `
          <div class="agent-room" onclick="navigate('worker-${w.id}')">
            <div class="agent-ava" style="background:${colors[w.avatar_emoji] || w.color || 'var(--brand)'}">${w.avatar_emoji}</div>
            <div class="agent-name">${w.name}</div>
            <div class="agent-role">${w.role}</div>
            <div class="agent-status">● ${w.type === 'human' ? 'човек' : 'AI агент'}</div>
            <div class="agent-task" title="${w.mission || ''}">${w.mission || '—'}</div>
          </div>
        `).join('')}
      </div>
    </div>

    ${workers.map(w => `
      <div class="card fade-in">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div class="agent-ava" style="background:${colors[w.avatar_emoji] || w.color || 'var(--brand)'}; width:40px;height:40px;font-size:18px;">${w.avatar_emoji}</div>
          <div>
            <div style="font-weight:600;">${w.name}</div>
            <div style="font-size:11px;color:#888;">${w.role}</div>
          </div>
          <span class="badge badge-${w.type === 'human' ? 'qualified' : 'won'}" style="margin-left:auto;">${w.type === 'human' ? 'Человек' : 'AI'}</span>
        </div>
        <div style="font-size:12px;color:#aaa;background:rgba(255,255,255,0.02);padding:10px 12px;border-radius:8px;">
          ${w.mission}
        </div>
        <div class="worker-result-grid" style="margin-top:12px;">
          ${w.results.map(r => `<div><span>${r.value}</span><small>${r.label}</small></div>`).join('')}
        </div>
        <button class="btn btn-secondary" style="margin-top:12px;" onclick="navigate('worker-${w.id}')">Открыть раздел</button>
      </div>
    `).join('')}
  `;
}

async function renderWorker(el, workerId) {
  const worker = await api(`/api/dashboard/workers/${workerId}`);
  const agentStatus = ['mark', 'maria', 'steve'].includes(worker.id)
    ? await api(`/api/agents/${worker.id}/status`).catch(err => ({ error: err.message }))
    : null;
  const mariaAnalysis = worker.id === 'maria'
    ? await api('/api/agents/maria/analysis').catch(err => ({ error: err.message, rows: [] }))
    : null;
  const relatedLink = {
    rostislav: `<button class="btn btn-secondary" onclick="navigate('leads')">👥 Клиенты</button><button class="btn btn-secondary" onclick="navigate('projects')">🏗️ Проекты</button>`,
    mark: `<button class="btn btn-secondary" onclick="navigate('products')">📦 Продукты</button><button class="btn btn-secondary" onclick="navigate('leads')">👥 B2B база</button>`,
    maria: `<button class="btn btn-secondary" onclick="navigate('facebook')">📢 Facebook Ads</button><button class="btn btn-secondary" onclick="navigate('leads')">👥 Клиенты</button>`,
    steve: `<button class="btn btn-secondary" onclick="window.open('https://bodexbg.com/', '_blank')">🌐 bodexbg.com</button>`,
  }[worker.id] || '';

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>${worker.avatar_emoji} ${worker.name}</h2>
      <div class="page-header-actions">
        <span class="badge badge-${worker.type === 'human' ? 'qualified' : 'won'}">${worker.type === 'human' ? 'Человек' : 'AI агент'}</span>
        <button class="btn btn-secondary" onclick="navigate('office')">🏢 Офис</button>
      </div>
    </div>

    <div class="card fade-in worker-hero">
      <div class="worker-avatar" style="background:${worker.color};">${worker.avatar_emoji}</div>
      <div>
        <div class="worker-role">${worker.role}</div>
        <div class="worker-mission">${worker.mission}</div>
      </div>
    </div>

    ${renderWorkerDailyActivity(worker)}
    ${renderMonthlyGoals(worker)}
    ${worker.id === 'mark' ? renderMarkAgentPanel(agentStatus) : ''}
    ${worker.id === 'maria' ? renderMariaAgentPanel(agentStatus, mariaAnalysis) : ''}
    ${worker.id === 'steve' ? renderSteveAgentPanel(agentStatus) : ''}

    <div class="grid-2 fade-in">
      <div class="card">
        <div class="card-title">
          ✅ Задачи на день
          ${currentRole === 'admin' ? `<button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="openAssignTask('${worker.id}')">+ Задача</button>` : ''}
        </div>
        ${worker.tasks.length ? worker.tasks.map((task, index) => renderAssignedTask(task, index)).join('') : `
          <div style="font-size:12px;color:#777;line-height:1.5;">
            Админ ещё не назначил задачи на день. Ниже есть системные рекомендации, что стоит сделать первым.
          </div>
        `}
      </div>

      <div class="card">
        <div class="card-title">📊 Результаты и KPI</div>
        <div class="worker-result-grid">
          ${worker.results.map(r => `<div><span>${r.value}</span><small>${r.label}</small></div>`).join('')}
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">${relatedLink}</div>
      </div>
    </div>

    ${worker.id === 'rostislav' ? renderManagerGuide() : ''}

    <div class="card fade-in">
      <div class="card-title">🤖 Рекомендации системы на сегодня</div>
      ${worker.recommendations.map((task, index) => `
        <div class="worker-task worker-task-recommendation">
          <div class="worker-task-num">${index + 1}</div>
          <div style="flex:1;">
            <div class="worker-task-title">${task.title}</div>
            <div class="worker-task-source">${task.source} · ${task.status}</div>
          </div>
          ${currentRole === 'admin' ? `<button class="btn btn-secondary btn-sm" onclick="assignRecommendedTask('${worker.id}', '${encodeURIComponent(task.title)}', '${encodeURIComponent(task.source)}')">Назначить</button>` : ''}
        </div>
      `).join('')}
    </div>

    <div class="card fade-in">
      <div class="card-title">🧭 Как оценивать работу</div>
      ${workerChecklist(worker.id).map(item => `<div class="goal-rule">${item}</div>`).join('')}
    </div>
  `;
}

function renderMarkAgentPanel(status) {
  const latest = status?.latest;
  const isRunning = Boolean(status?.running);
  const stateClass = isRunning ? 'running' : latest?.status || 'idle';
  const stateText = isRunning ? 'Mark сейчас сканирует рынок' : agentRunLabel(latest?.status);
  const rows = latest?.rows_created || 0;
  const message = latest?.message || 'Запуска ещё не было. Нажмите кнопку, чтобы Mark сделал первый отчёт.';
  const finished = latest?.finished_at ? formatDateTime(latest.finished_at) : '—';

  return `
    <div class="card fade-in mark-agent-panel">
      <div class="card-title">
        🤖 Запуск агента Mark
        <span class="agent-run-status ${stateClass}">${stateText}</span>
      </div>
      <div class="agent-run-layout">
        <div>
          <div class="agent-run-copy">
            Mark анализирует категории материалов, а не наш каталог: инжекционные смолы, полимерные материалы, пакеры и насосы. Он сравнивает Болгарию и Европу, ищет актуальные цены и даёт рекомендацию по оптимальной наценке. Отчёт сохраняется в БД как HTML.
          </div>
          <div id="mark-agent-result" class="sync-result ${status?.error ? 'show err' : ''}">${status?.error ? '❌ ' + status.error : ''}</div>
        </div>
        <div class="agent-run-meta">
          <div><span>${rows}</span><small>строк в последнем отчёте</small></div>
          <div><span>${finished}</span><small>последнее завершение</small></div>
        </div>
      </div>
      <div class="agent-run-message">${message}</div>
      <div class="agent-run-actions">
        <button class="btn btn-primary" onclick="runMarkAgent()" ${isRunning ? 'disabled' : ''}>▶ Запустить агента</button>
        <button class="btn btn-secondary" onclick="refreshMarkAgent()">Обновить статус</button>
        <button class="btn btn-secondary" onclick="navigate('agent-reports')">Отчёты</button>
      </div>
      <div style="font-size:11px;color:#777;margin-top:10px;">
        Cron: понедельник-пятница, 09:00 и 15:00 Europe/Sofia.
      </div>
    </div>
  `;
}

function renderMariaAgentPanel(status, analysis = {}) {
  const latest = status?.latest;
  const isRunning = Boolean(status?.running);
  const stateClass = isRunning ? 'running' : latest?.status || 'idle';
  const stateText = isRunning ? 'Maria анализирует Facebook Ads' : agentRunLabel(latest?.status);
  const rows = latest?.rows_created || 0;
  const message = latest?.message || 'Запуска ещё не было. Нажмите кнопку, чтобы Maria проверила кампании и дала рекомендации.';
  const finished = latest?.finished_at ? formatDateTime(latest.finished_at) : '—';
  const reportRows = analysis?.rows || [];
  const overview = analysis?.overview || {};

  return `
    <div class="card fade-in mark-agent-panel">
      <div class="card-title">
        📢 Запуск агента Maria
        <span class="agent-run-status ${stateClass}">${stateText}</span>
      </div>
      <div class="agent-run-layout">
        <div>
          <div class="agent-run-copy">
            Maria синхронизирует Facebook Ads, считает spend, impressions, clicks, CTR, CPC, leads и CPL за последние 30 дней. Отчёт сохраняется в БД и доступен на странице отчётов, без записи в Google Sheets.
          </div>
          <div id="maria-agent-result" class="sync-result ${status?.error ? 'show err' : ''}">${status?.error ? '❌ ' + status.error : ''}</div>
        </div>
        <div class="agent-run-meta">
          <div><span>${rows}</span><small>кампаний в последнем отчёте</small></div>
          <div><span>${finished}</span><small>последнее завершение</small></div>
        </div>
      </div>
      <div class="agent-run-message">${message}</div>
      <div class="agent-run-actions">
        <button class="btn btn-primary" onclick="runMariaAgent()" ${isRunning ? 'disabled' : ''}>▶ Запустить агента</button>
        <button class="btn btn-primary" onclick="runMariaActiveCampaignReport()" ${isRunning ? 'disabled' : ''}>🔥 Отчёт активной кампании</button>
        <button class="btn btn-secondary" onclick="refreshMariaAgent()">Обновить статус</button>
        <button class="btn btn-secondary" onclick="navigate('facebook')">Facebook Ads</button>
      </div>
    </div>
    <div class="card fade-in maria-report-card">
      <div class="card-title">📋 Отчёт Maria по рекламным кампаниям</div>
      ${analysis?.error ? `<div class="sync-result show err">❌ ${analysis.error}</div>` : ''}
      <div class="agent-run-message">${analysis?.summary || 'Нет данных для анализа. Сначала запустите агента Maria.'}</div>
      ${renderMariaExecutiveReport(overview)}
      ${renderMariaCampaignDeepDive(reportRows)}
      <div class="table-wrap" style="margin-top:12px;">
        <table>
          <thead>
            <tr>
              <th>Кампания</th>
              <th>Статус</th>
              <th>Период</th>
              <th>Spend</th>
              <th>Охват</th>
              <th>Клики</th>
              <th>Leads</th>
              <th>CPL</th>
              <th>CTR</th>
              <th>Оценка</th>
              <th>Рекомендация</th>
            </tr>
          </thead>
          <tbody>
            ${reportRows.length ? reportRows.map(row => `
              <tr>
                <td style="font-weight:600;color:#ddd;">${row.name}</td>
                <td><span class="badge badge-${row.status}">${row.status}</span></td>
                <td>${insightWindowLabel(row.insight_window)}</td>
                <td>$${Number(row.spend || 0).toLocaleString()}</td>
                <td>${Number(row.reach || 0).toLocaleString()}</td>
                <td>${Number(row.clicks || 0).toLocaleString()}</td>
                <td style="color:var(--green);font-weight:700;">${row.leads || 0}</td>
                <td>$${row.cpl || 0}</td>
                <td>${row.ctr || 0}%</td>
                <td><span class="maria-verdict">${row.decision || row.verdict}</span></td>
                <td style="min-width:260px;color:#aaa;line-height:1.45;">${row.recommendation}</td>
              </tr>
            `).join('') : '<tr><td colspan="11" style="text-align:center;color:#666;padding:26px;">Нет отчёта. Нажмите “Запустить агента”.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div style="font-size:11px;color:#777;margin-top:10px;">Отчёт хранится в БД и доступен в разделе “Отчёты работников”.</div>
    </div>
  `;
}

function renderSteveAgentPanel(status) {
  const latest = status?.latest;
  const isRunning = Boolean(status?.running);
  const stateClass = isRunning ? 'running' : latest?.status || 'idle';
  const stateText = isRunning ? 'Steve сейчас проверяет SEO' : agentRunLabel(latest?.status);
  const rows = latest?.rows_created || 0;
  const message = latest?.message || 'Запуска ещё не было. Steve проверит SEO сайта, структуру, внутренние ссылки и даст план линкбилдинга.';
  const finished = latest?.finished_at ? formatDateTime(latest.finished_at) : '—';

  return `
    <div class="card fade-in mark-agent-panel">
      <div class="card-title">
        🌐 Запуск агента Steve
        <span class="agent-run-status ${stateClass}">${stateText}</span>
      </div>
      <div class="agent-run-layout">
        <div>
          <div class="agent-run-copy">
            Steve делает SEO аудит <strong>bodexbg.com</strong>: title/meta, H1/H2, внутренние ссылки, B2B ключи, изображения, посадочные страницы и линкбилдинг. Отчёт сохраняется в БД и виден в разделе <strong>Отчёты работников</strong>.
          </div>
          <div id="steve-agent-result" class="sync-result ${status?.error ? 'show err' : ''}">${status?.error ? '❌ ' + status.error : ''}</div>
        </div>
        <div class="agent-run-meta">
          <div><span>${rows}</span><small>рекомендаций в последнем отчёте</small></div>
          <div><span>${finished}</span><small>последнее завершение</small></div>
        </div>
      </div>
      <div class="agent-run-message">${message}</div>
      <div class="agent-run-actions">
        <button class="btn btn-primary" onclick="runSteveAgent()" ${isRunning ? 'disabled' : ''}>▶ Запустить SEO аудит</button>
        <button class="btn btn-secondary" onclick="refreshSteveAgent()">Обновить статус</button>
        <button class="btn btn-secondary" onclick="navigate('agent-reports')">Отчёты</button>
      </div>
      <div style="font-size:11px;color:#777;margin-top:10px;">
        Cron: понедельник-пятница, 09:30 и 15:30 Europe/Sofia.
      </div>
    </div>
  `;
}

function renderMariaExecutiveReport(overview = {}) {
  if (!overview.total_campaigns) return '';
  const best = overview.best_campaign;
  const weakest = overview.weakest_campaign;
  return `
    <div class="maria-executive-grid">
      <div class="maria-kpi"><span>${overview.total_campaigns || 0}</span><small>кампаний</small></div>
      <div class="maria-kpi"><span>${overview.active_campaigns || 0}</span><small>активных</small></div>
      <div class="maria-kpi"><span>${Number(overview.reach || 0).toLocaleString()}</span><small>охват</small></div>
      <div class="maria-kpi"><span>${Number(overview.clicks || 0).toLocaleString()}</span><small>клики</small></div>
      <div class="maria-kpi"><span>$${overview.spend || 0}</span><small>потрачено</small></div>
      <div class="maria-kpi"><span>${overview.leads || 0}</span><small>лидов</small></div>
      <div class="maria-kpi"><span>$${overview.avg_cpl || 0}</span><small>средний CPL</small></div>
      <div class="maria-kpi"><span>${overview.avg_ctr || 0}%</span><small>средний CTR</small></div>
    </div>

    <div class="maria-decision-grid">
      <div>
        <div class="monthly-goal-label">Что запускать</div>
        ${(overview.launch || []).length ? overview.launch.map(c => `
          <div class="maria-decision good">
            <strong>${c.name}</strong>
            <span>${c.leads} лидов · CPL $${c.cpl} · ${c.verdict}</span>
          </div>
        `).join('') : '<div class="maria-empty">Нет кампаний, которые Maria рекомендует запускать без нового теста.</div>'}
      </div>
      <div>
        <div class="monthly-goal-label">Где оптимизировать</div>
        ${(overview.optimize || []).length ? overview.optimize.map(c => `
          <div class="maria-decision warn">
            <strong>${c.name}</strong>
            <span>${c.leads} лидов · CTR ${c.ctr}% · CPL $${c.cpl}</span>
          </div>
        `).join('') : '<div class="maria-empty">Явных проблем по CPL/CTR сейчас нет.</div>'}
      </div>
      <div>
        <div class="monthly-goal-label">Что не запускать</div>
        ${(overview.stop || []).length ? overview.stop.map(c => `
          <div class="maria-decision bad">
            <strong>${c.name}</strong>
            <span>${c.verdict} · ${c.recommendation}</span>
          </div>
        `).join('') : '<div class="maria-empty">Нет кампаний с явным стоп-сигналом.</div>'}
      </div>
    </div>

    <div class="maria-highlight-grid">
      <div>
        <div class="monthly-goal-label">Лучший выхлоп</div>
        <div class="maria-highlight">${best ? (best.leads > 0 ? `${best.name}: ${best.leads} лидов при CPL $${best.cpl}` : `${best.name}: пока без лидов, ${best.clicks} кликов`) : '—'}</div>
      </div>
      <div>
        <div class="monthly-goal-label">Самая дорогая кампания</div>
        <div class="maria-highlight">${weakest ? (weakest.leads > 0 ? `${weakest.name}: CPL $${weakest.cpl}` : `${weakest.name}: spend $${weakest.spend || 0}`) : '—'}</div>
      </div>
    </div>

    <div class="maria-next-actions">
      <div class="monthly-goal-label">Что делать дальше</div>
      ${overview.golden_recommendation ? `<div class="maria-golden">${overview.golden_recommendation}</div>` : ''}
      ${(overview.next_actions || []).map(item => `<div class="goal-check">${item}</div>`).join('')}
    </div>
  `;
}

function renderMariaCampaignDeepDive(rows = []) {
  if (!rows.length) return '';
  return `
    <div class="maria-deep-dive">
      <div class="monthly-goal-label">Разбор каждой кампании</div>
      ${rows.map(row => `
        <details class="maria-campaign-detail" ${row.verdict === 'Запустить снова' ? 'open' : ''}>
          <summary>
            <span>${row.name}</span>
            <small>${Number(row.reach || 0).toLocaleString()} охват · ${row.clicks} кликов · ${row.leads} лидов · CPL $${row.cpl} · ${row.decision || row.verdict}</small>
          </summary>
          <div class="maria-detail-grid">
            <div>
              <strong>Качество лидов</strong>
              <p>${row.quality_signal || 'Проверить качество лидов после звонков Ростислава.'}</p>
            </div>
            <div>
              <strong>Аудитория</strong>
              <p>${row.audience_recommendation || 'Сузить аудиторию до B2B сегмента.'}</p>
            </div>
            <div>
              <strong>Креатив</strong>
              <p>${row.creative_recommendation || 'Тестировать более конкретный оффер и визуал.'}</p>
            </div>
            <div>
              <strong>Конверсия</strong>
              <p>${row.conversion_recommendation || 'Добавить квалифицирующие вопросы в форму.'}</p>
            </div>
          </div>
          <div class="maria-launch-plan">${row.launch_plan || row.recommendation}</div>
        </details>
      `).join('')}
    </div>
  `;
}

function insightWindowLabel(value) {
  const map = {
    today: 'сегодня',
    last_7d: '7 дней',
    last_30d: '30 дней',
  };
  return map[value] || value || '—';
}

function agentRunLabel(status) {
  const map = {
    done: 'последний запуск выполнен',
    error: 'последний запуск с ошибкой',
    running: 'в работе',
  };
  return map[status] || 'готов к запуску';
}

function formatDateTime(value) {
  if (!value) return '—';
  const normalized = String(value).includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function runMarkAgent() {
  const result = document.getElementById('mark-agent-result');
  if (result) {
    result.className = 'sync-result show';
    result.textContent = 'Mark запущен. Он сканирует рынок и сохранит HTML-отчёт в БД...';
  }
  try {
    await api('/api/agents/mark/run', { method: 'POST' });
    pollMarkAgent();
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ ' + err.message;
    }
  }
}

async function refreshMarkAgent() {
  await renderWorker(document.getElementById('main'), 'mark');
}

function pollMarkAgent() {
  if (markAgentPoll) clearInterval(markAgentPoll);
  markAgentPoll = setInterval(async () => {
    if (currentPage !== 'worker-mark') {
      clearInterval(markAgentPoll);
      markAgentPoll = null;
      return;
    }
    const status = await api('/api/agents/mark/status').catch(() => null);
    await renderWorker(document.getElementById('main'), 'mark');
    if (!status?.running) {
      clearInterval(markAgentPoll);
      markAgentPoll = null;
    }
  }, 5000);
}

async function runMariaAgent() {
  const result = document.getElementById('maria-agent-result');
  if (result) {
    result.className = 'sync-result show';
    result.textContent = 'Maria запущена. Она синхронизирует Facebook Ads и готовит рекомендации...';
  }
  try {
    await api('/api/agents/maria/run', { method: 'POST' });
    pollMariaAgent();
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ ' + err.message;
    }
  }
}

async function runMariaActiveCampaignReport() {
  const result = document.getElementById('maria-agent-result');
  if (result) {
    result.className = 'sync-result show';
    result.textContent = 'Maria проверяет только активные кампании: охват, показы, клики, CTR, CPL и решение продолжать или выключить...';
  }
  try {
    await api('/api/agents/maria/run-active', { method: 'POST' });
    pollMariaAgent();
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ ' + err.message;
    }
  }
}

async function refreshMariaAgent() {
  await renderWorker(document.getElementById('main'), 'maria');
}

function pollMariaAgent() {
  if (markAgentPoll) clearInterval(markAgentPoll);
  markAgentPoll = setInterval(async () => {
    if (currentPage !== 'worker-maria') {
      clearInterval(markAgentPoll);
      markAgentPoll = null;
      return;
    }
    const status = await api('/api/agents/maria/status').catch(() => null);
    await renderWorker(document.getElementById('main'), 'maria');
    if (!status?.running) {
      clearInterval(markAgentPoll);
      markAgentPoll = null;
    }
  }, 5000);
}

async function runSteveAgent() {
  const result = document.getElementById('steve-agent-result');
  if (result) {
    result.className = 'sync-result show';
    result.textContent = 'Steve запущен. Он проверяет SEO сайта и готовит рекомендации по линкбилдингу...';
  }
  try {
    await api('/api/agents/steve/run', { method: 'POST' });
    pollSteveAgent();
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ ' + err.message;
    }
  }
}

async function refreshSteveAgent() {
  await renderWorker(document.getElementById('main'), 'steve');
}

function pollSteveAgent() {
  if (markAgentPoll) clearInterval(markAgentPoll);
  markAgentPoll = setInterval(async () => {
    if (currentPage !== 'worker-steve') {
      clearInterval(markAgentPoll);
      markAgentPoll = null;
      return;
    }
    const status = await api('/api/agents/steve/status').catch(() => null);
    await renderWorker(document.getElementById('main'), 'steve');
    if (!status?.running) {
      clearInterval(markAgentPoll);
      markAgentPoll = null;
    }
  }, 5000);
}

function renderMonthlyGoals(worker) {
  const goals = worker.monthlyGoals || {};
  return `
    <div class="card fade-in worker-monthly-goals">
      <div class="card-title">🎯 KPI и цели</div>
      <div class="monthly-goal-grid">
        <div>
          <div class="monthly-goal-label">Минимальный KPI</div>
          <div class="monthly-goal-value">${goals.minimum || '—'}</div>
        </div>
        <div>
          <div class="monthly-goal-label">Оптимальный KPI</div>
          <div class="monthly-goal-value">${goals.optimal || '—'}</div>
        </div>
        <div>
          <div class="monthly-goal-label">Мотивация / ценность</div>
          <div class="monthly-goal-value">${goals.reward || '—'}</div>
        </div>
        <div>
          <div class="monthly-goal-label">Ежедневный ритм</div>
          <div class="monthly-goal-value">${goals.daily || '—'}</div>
        </div>
      </div>
      <div style="margin-top:14px;">
        <div class="monthly-goal-label">Как измеряем результат</div>
        ${(goals.measurement || []).map(item => `<div class="goal-check">${item}</div>`).join('')}
      </div>
    </div>
  `;
}

function renderWorkerDailyActivity(worker) {
  const activity = worker.daily_activity || {};
  const summary = activity.summary || {};

  if (worker.id === 'rostislav') {
    const cards = [
      { label: 'Клиентов тронул сегодня', value: summary.leads_touched || 0 },
      { label: 'Комментариев оставил', value: summary.comments_count || 0 },
      { label: 'Статусов поменял', value: summary.statuses_changed || 0 },
      { label: 'Перезвонов назначил', value: summary.followups_set || 0 },
    ];

    return `
      <div class="card fade-in worker-daily-activity">
        <div class="card-title">📈 Сегодня в CRM</div>
        <div class="worker-activity-grid">
          ${cards.map(item => `
            <div class="worker-activity-card">
              <strong>${item.value}</strong>
              <small>${item.label}</small>
            </div>
          `).join('')}
        </div>
        <div class="worker-activity-total">Всего действий сегодня: <strong>${summary.actions_total || 0}</strong></div>
        ${activity.recent?.length ? `
          <div class="worker-activity-feed">
            ${activity.recent.map(item => `
              <div class="worker-activity-item">
                <div>
                  <span class="worker-activity-badge">${workerActivityLabel(item.action)}</span>
                  <strong>${escapeHtml(item.lead_label || 'Лид')}</strong>
                </div>
                <div class="worker-activity-meta">${formatDateTime(item.created_at)}${item.description ? ` · ${escapeHtml(item.description)}` : ''}</div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="worker-activity-empty">Сегодня Ростислав ещё не записал действий в CRM.</div>'}
      </div>
    `;
  }

  return `
    <div class="card fade-in worker-daily-activity">
      <div class="card-title">📈 Активность за сегодня</div>
      <div class="worker-activity-grid">
        <div class="worker-activity-card">
          <strong>${summary.tasks_created_today || 0}</strong>
          <small>новых задач</small>
        </div>
        <div class="worker-activity-card">
          <strong>${summary.tasks_in_progress_today || 0}</strong>
          <small>в работе сегодня</small>
        </div>
        <div class="worker-activity-card">
          <strong>${summary.tasks_done_today || 0}</strong>
          <small>закрыто сегодня</small>
        </div>
      </div>
    </div>
  `;
}

function workerActivityLabel(action) {
  const map = {
    comment: 'Комментарий',
    status_change: 'Статус',
    followup_change: 'Перезвон',
  };
  return map[action] || action;
}

function renderManagerGuide() {
  const rows = [
    {
      field: 'Interest',
      action: 'Выбирает уровень интереса клиента',
      values: 'Очень интересно / Интересно / Средне / Слабый интерес / Нет интереса',
    },
    {
      field: 'Context',
      action: 'Заполняет контекст и апдейты разговора после каждого контакта с клиентом',
      values: 'Что нужно клиенту, какой объект, какие материалы интересуют, о чём договорились, история общения с датами',
    },
    {
      field: 'Action Update',
      action: 'Обновляет выполненное действие',
      values: 'Отправлен каталог / презентация / коммерческое предложение / был звонок / назначена встреча',
    },
    {
      field: 'Action Status',
      action: 'Обновляет текущий статус клиента',
      values: 'Готовы закупать / думают / ждут цены / не отвечают / повторить позже / отказ',
    },
  ];

  return `
    <div class="card fade-in manager-guide">
      <div class="card-title">📘 Guide For Manager</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Поле</th>
              <th>Что делает менеджер</th>
              <th>Что нужно указать</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td style="font-weight:700;color:#ddd;">${row.field}</td>
                <td>${row.action}</td>
                <td style="color:#aaa;">${row.values}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAssignedTask(task, index) {
  return `
    <div class="worker-task assigned-task ${task.status}">
      <div class="worker-task-num">${index + 1}</div>
      <div style="flex:1;">
        <div class="worker-task-title">${task.title}</div>
        ${task.description ? `<div style="font-size:12px;color:#aaa;line-height:1.45;margin-top:5px;">${task.description}</div>` : ''}
        <div class="worker-task-source">
          ${task.source || 'admin'} · ${task.due_date || 'today'} · <span class="task-status-text">${taskStatusLabel(task.status)}</span>
        </div>
        ${task.result_note ? `<div class="task-result-note">Результат: ${task.result_note}</div>` : ''}
      </div>
      <div class="task-actions">
        <select onchange="updateWorkerTask(${task.id}, this.value)">
          <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>К выполнению</option>
          <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>В работе</option>
          <option value="done" ${task.status === 'done' ? 'selected' : ''}>Выполнено</option>
          <option value="not_done" ${task.status === 'not_done' ? 'selected' : ''}>Не выполнено</option>
          <option value="blocked" ${task.status === 'blocked' ? 'selected' : ''}>Блокер</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="addTaskResult(${task.id}, '${task.worker_id}')">Результат</button>
        ${currentRole === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteWorkerTask(${task.id})">Удалить</button>` : ''}
      </div>
    </div>
  `;
}

function taskStatusLabel(status) {
  const map = {
    todo: 'к выполнению',
    in_progress: 'в работе',
    done: 'выполнено',
    not_done: 'не выполнено',
    blocked: 'блокер',
  };
  return map[status] || status;
}

function openAssignTask(workerId) {
  openModal('Назначить задачу', `
    <div class="form-group full">
      <label>Задача</label>
      <input id="task-title" placeholder="Например: Позвонить 10 B2B клиентам без статуса">
    </div>
    <div class="form-group full">
      <label>Описание / результат, который ждём</label>
      <textarea id="task-description" rows="4" placeholder="Что конкретно сделать, кому написать, какой статус обновить..."></textarea>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Приоритет</label>
        <select id="task-priority">
          <option value="high">Высокий</option>
          <option value="medium" selected>Средний</option>
          <option value="low">Низкий</option>
        </select>
      </div>
      <div class="form-group">
        <label>Дата</label>
        <input id="task-due" type="date" value="${new Date().toISOString().slice(0, 10)}">
      </div>
    </div>
    <div id="task-create-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="createWorkerTask('${workerId}')">Назначить</button>
    </div>
  `);
  setTimeout(() => document.getElementById('task-title')?.focus(), 50);
}

async function createWorkerTask(workerId) {
  const result = document.getElementById('task-create-result');
  result.className = 'sync-result show';
  result.textContent = 'Сохраняю задачу...';
  try {
    await api(`/api/dashboard/workers/${workerId}/tasks`, {
      method: 'POST',
      body: {
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-description').value,
        priority: document.getElementById('task-priority').value,
        due_date: document.getElementById('task-due').value,
      },
    });
    closeModal();
    renderWorker(document.getElementById('main'), workerId);
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = '❌ ' + err.message;
  }
}

async function assignRecommendedTask(workerId, encodedTitle, encodedSource) {
  await api(`/api/dashboard/workers/${workerId}/tasks`, {
    method: 'POST',
    body: {
      title: decodeURIComponent(encodedTitle),
      description: 'Назначено из системных рекомендаций на сегодня.',
      source: decodeURIComponent(encodedSource),
      priority: workerId === 'rostislav' ? 'high' : 'medium',
      due_date: new Date().toISOString().slice(0, 10),
    },
  });
  renderWorker(document.getElementById('main'), workerId);
}

async function updateWorkerTask(taskId, status) {
  await api(`/api/dashboard/worker-tasks/${taskId}`, { method: 'PATCH', body: { status } });
  renderPage(currentPage);
}

async function addTaskResult(taskId, workerId = '') {
  if (workerId === 'rostislav') {
    openManagerResultModal(taskId);
    return;
  }
  const note = prompt('Что получилось по задаче?');
  if (note === null) return;
  await api(`/api/dashboard/worker-tasks/${taskId}`, { method: 'PATCH', body: { result_note: note } });
  renderPage(currentPage);
}

function openManagerResultModal(taskId) {
  openModal('Результат работы менеджера', `
    <div class="form-grid">
      <div class="form-group">
        <label>Interest</label>
        <select id="mgr-interest">
          <option value="Очень интересно">Очень интересно</option>
          <option value="Интересно">Интересно</option>
          <option value="Средне">Средне</option>
          <option value="Слабый интерес">Слабый интерес</option>
          <option value="Нет интереса">Нет интереса</option>
        </select>
      </div>
      <div class="form-group">
        <label>Action Status</label>
        <select id="mgr-status">
          <option value="Готовы закупать">Готовы закупать</option>
          <option value="Думают">Думают</option>
          <option value="Ждут цены">Ждут цены</option>
          <option value="Не отвечают">Не отвечают</option>
          <option value="Повторить позже">Повторить позже</option>
          <option value="Отказ">Отказ</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Context</label>
        <textarea id="mgr-context" rows="4" placeholder="Что нужно клиенту, какой объект, какие материалы интересуют, о чем договорились, история общения с датами"></textarea>
      </div>
      <div class="form-group full">
        <label>Action Update</label>
        <select id="mgr-action">
          <option value="Отправлен каталог">Отправлен каталог</option>
          <option value="Отправлена презентация">Отправлена презентация</option>
          <option value="Отправлено коммерческое предложение">Отправлено коммерческое предложение</option>
          <option value="Был звонок">Был звонок</option>
          <option value="Назначена встреча">Назначена встреча</option>
          <option value="Письмо/Viber">Письмо/Viber</option>
        </select>
      </div>
    </div>
    <div id="manager-result-save" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveManagerResult(${taskId})">Сохранить результат</button>
    </div>
  `);
}

async function saveManagerResult(taskId) {
  const result = document.getElementById('manager-result-save');
  const note = [
    `Interest: ${document.getElementById('mgr-interest').value}`,
    `Context: ${document.getElementById('mgr-context').value || '—'}`,
    `Action Update: ${document.getElementById('mgr-action').value}`,
    `Action Status: ${document.getElementById('mgr-status').value}`,
  ].join('\\n');
  result.className = 'sync-result show';
  result.textContent = 'Сохраняю результат...';
  try {
    await api(`/api/dashboard/worker-tasks/${taskId}`, {
      method: 'PATCH',
      body: { result_note: note, status: 'done' },
    });
    closeModal();
    renderPage(currentPage);
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = '❌ ' + err.message;
  }
}

async function deleteWorkerTask(taskId) {
  if (!confirm('Удалить задачу?')) return;
  await api(`/api/dashboard/worker-tasks/${taskId}`, { method: 'DELETE' });
  renderPage(currentPage);
}

function workerChecklist(id) {
  const map = {
    rostislav: [
      'Каждый контакт должен получить статус: не звонил, дозвонился, заинтересован, отправлен каталог, оферта, встреча, отказ.',
      'После каждого звонка Ростислав обновляет Google таблицу и CRM.',
      'Главный результат дня: сколько клиентов продвинуты к встрече, оферте или сделке.',
    ],
    mark: [
      'Каждый отчёт должен содержать конкурент, товар, цена, упаковка, условия и ссылку/источник.',
      'Рекомендация Mark должна отвечать: где мы дороже/дешевле и какую цену можно дать B2B клиенту.',
      'Обновления должны попадать в таблицу для админа и Ростислава.',
    ],
    maria: [
      'Отчёт Maria должен показывать spend, CTR, CPL, лиды и качество лидов.',
      'Каждый день Maria предлагает: усилить, остановить или изменить кампании.',
      'Лиды из FB должны передаваться Ростиславу для звонка.',
    ],
    steve: [
      'Steve ищет страницы и статьи, которые приведут B2B клиентов из Google.',
      'SEO-задачи должны быть конкретными: title, meta, H1, структура, внутренние ссылки, новые статьи.',
      'Главный результат: больше качественных заявок с сайта bodexbg.com.',
    ],
  };
  return map[id] || [];
}

// ===== STRUCTURED CLIENTS FROM GOOGLE SHEETS =====
async function renderClients(el, filters = {}) {
  filters = { sheet_name: 'МАТЕРИАЛЫ', ...filters };
  const params = new URLSearchParams(filters);
  const data = await api(`/api/google/clients?${params}`);
  const stats = data.stats || {};
  const rows = data.rows || [];

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>👥 Клиенты</h2>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="pullBusinessSheets()">🔄 Обнови от Google Sheets</button>
      </div>
    </div>

    <div id="clients-sync-result" class="sync-result"></div>

    <div class="stats-grid fade-in">
      <div class="stat-card"><div class="stat-label">Всички контакти</div><div class="stat-value brand">${stats.total || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Услуги</div><div class="stat-value blue">${stats.services || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Материали</div><div class="stat-value green">${stats.materials || 0}</div></div>
      <div class="stat-card"><div class="stat-label">B2B база</div><div class="stat-value purple">${stats.b2b || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Проекти</div><div class="stat-value yellow">${stats.projects || 0}</div></div>
      <div class="stat-card"><div class="stat-label">CRM клиенти</div><div class="stat-value pink">${stats.crm || 0}</div></div>
    </div>

    <div class="search-bar fade-in">
      <input type="text" placeholder="Търси фирма, човек, телефон, email, проблем..." id="client-search" value="${filters.search || ''}" onkeyup="if(event.key==='Enter')searchClients()">
      <select id="client-sheet" onchange="searchClients()">
        <option value="МАТЕРИАЛЫ" ${filters.sheet_name==='МАТЕРИАЛЫ'?'selected':''}>МАТЕРИАЛЫ</option>
        <option value="УСЛУГИ" ${filters.sheet_name==='УСЛУГИ'?'selected':''}>УСЛУГИ</option>
        <option value="ПРОЕКТЫ" ${filters.sheet_name==='ПРОЕКТЫ'?'selected':''}>ПРОЕКТЫ</option>
        <option value="b2b" ${filters.sheet_name==='b2b'?'selected':''}>b2b</option>
        <option value="" ${filters.sheet_name===''?'selected':''}>Все листы</option>
      </select>
      <select id="client-action" onchange="searchClients()">
        <option value="">Все действия</option>
        <option value="Отправить каталог" ${filters.action_needed==='Отправить каталог'?'selected':''}>Отправить каталог/презе</option>
        <option value="комерческое" ${filters.action_needed==='комерческое'?'selected':''}>Отправить коммерческое</option>
        <option value="Email" ${filters.action_needed==='Email'?'selected':''}>Отправить Email</option>
        <option value="Перезвонить" ${filters.action_needed==='Перезвонить'?'selected':''}>Перезвонить</option>
        <option value="Пропинговать" ${filters.action_needed==='Пропинговать'?'selected':''}>Пропинговать ещё раз</option>
        <option value="Не актуальный" ${filters.action_needed==='Не актуальный'?'selected':''}>Не актуальный</option>
      </select>
      <select id="client-status" onchange="searchClients()">
        <option value="">Все статусы действия</option>
        <option value="Назначена встреча" ${filters.status==='Назначена встреча'?'selected':''}>Назначена встреча</option>
        <option value="Готовы закупать" ${filters.status==='Готовы закупать'?'selected':''}>Готовы закупать</option>
        <option value="Думают" ${filters.status==='Думают'?'selected':''}>Думают</option>
        <option value="Не готовы" ${filters.status==='Не готовы'?'selected':''}>Не готовы</option>
      </select>
      <select id="client-priority" onchange="searchClients()">
        <option value="">Всички приоритети</option>
        <option value="high" ${filters.priority==='high'?'selected':''}>High</option>
        <option value="medium" ${filters.priority==='medium'?'selected':''}>Medium</option>
        <option value="low" ${filters.priority==='low'?'selected':''}>Low</option>
      </select>
      <button class="btn btn-secondary" onclick="searchClients()">🔍</button>
    </div>

    <div class="card fade-in">
      <div class="card-title">Структурирана база клиенти <span style="color:#666;font-size:12px;">последен sync: ${stats.last_sync || '—'}</span></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Контакт</th>
              <th>Компания / Клиент</th>
              <th>Контакт</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Действие</th>
              <th>Статус действия</th>
              <th>Приоритет</th>
              <th>Контекст</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(c => `
              <tr>
                <td><span class="badge badge-new">${c.source_type === 'crm' ? (c.segment || 'CRM') : c.sheet_name}</span></td>
                <td style="font-weight:600;color:#ddd;">${c.company_name || '—'}<div style="font-size:10px;color:#666;">${c.city || c.segment || ''}</div></td>
                <td>${c.contact_name || '—'}</td>
                <td>${c.phone || '—'}</td>
                <td style="font-size:11px;">${c.email || '—'}</td>
                <td style="max-width:240px;">${clientSheetPill(c.action_needed, 'action')}</td>
                <td style="max-width:220px;">${clientSheetPill(c.status, 'status')}</td>
                <td><span class="badge badge-${c.priority === 'high' ? 'hot' : c.priority === 'low' ? 'low' : 'medium'}">${c.priority || 'medium'}</span></td>
                <td style="max-width:320px;font-size:11px;color:#888;">${c.problem || c.interest || c.notes || '—'}</td>
              </tr>
            `).join('') : '<tr><td colspan="9" style="text-align:center;color:#666;padding:30px;">Няма данни. Синхронизирайте Google Sheets или обработайте лид в CRM.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function searchClients() {
  renderClients(document.getElementById('main'), {
    search: document.getElementById('client-search').value,
    sheet_name: document.getElementById('client-sheet').value,
    action_needed: document.getElementById('client-action').value,
    status: document.getElementById('client-status').value,
    priority: document.getElementById('client-priority').value,
  });
}

function clientSheetPill(value, type = 'status') {
  if (!value) return '<span style="color:#666;">—</span>';
  const text = String(value);
  const low = text.toLowerCase();
  let bg = type === 'action' ? 'rgba(56,189,248,0.18)' : 'rgba(245,158,11,0.22)';
  let color = type === 'action' ? '#38bdf8' : '#facc15';
  if (/комер|коммер|предлож|оферт/.test(low)) { bg = 'rgba(34,197,94,0.22)'; color = '#86efac'; }
  if (/email|каталог|презе/.test(low)) { bg = 'rgba(56,189,248,0.20)'; color = '#7dd3fc'; }
  if (/встреч|срещ|назнач/.test(low)) { bg = 'rgba(37,99,235,0.45)'; color = '#bfdbfe'; }
  if (/готов/.test(low) && !/не готов/.test(low)) { bg = 'rgba(22,163,74,0.45)'; color = '#bbf7d0'; }
  if (/не готов|не актуал|отказ/.test(low)) { bg = 'rgba(220,38,38,0.30)'; color = '#fecaca'; }
  return `<span style="display:inline-flex;align-items:center;border-radius:8px;padding:4px 10px;background:${bg};color:${color};font-weight:800;line-height:1.2;">${text}</span>`;
}

async function pullBusinessSheets() {
  const el = document.getElementById('clients-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Чета УСЛУГИ, МАТЕРИАЛЫ, ПРОЕКТЫ и b2b от Google Sheets...';
  try {
    const result = await api('/api/google/pull/business', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ Обновено: ${result.rows} реда.`;
    setTimeout(() => renderClients(document.getElementById('main'), { sheet_name: 'МАТЕРИАЛЫ' }), 1200);
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ ' + err.message;
  }
}

// ===== DEALS FROM GOOGLE SHEETS =====
async function renderDeals(el) {
  const data = await api('/api/dashboard/deals');
  const summary = data.summary || {};
  const sections = data.sections || [];

  el.innerHTML = `
    <div class="page-header fade-in">
      <div>
        <h2>🤝 Сделки</h2>
        <div style="color:var(--text-dim);font-size:13px;margin-top:4px;">
          Воронка строится только по листам УСЛУГИ и МАТЕРИАЛЫ. B2B остаётся базой для первичного обзвона. Последний sync: ${summary.last_sync || '—'}
        </div>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="pullDealsSheets()">🔄 Обнови от Google Sheets</button>
      </div>
    </div>

    <div id="deals-sync-result" class="sync-result"></div>

    ${sections.map(section => renderDealSection(section)).join('')}
  `;
}

function renderDealSection(section) {
  const stages = section.stages || [];
  const summary = section.summary || {};
  return `
    <section class="deal-section fade-in">
      <div class="deal-section-header">
        <div>
          <h3>${section.label}</h3>
          <p>${section.description || ''}</p>
        </div>
        <div class="deal-section-stats">
          <span>${summary.total || 0} контактов</span>
          <span>${summary.interested || 0} интерес</span>
          <span>${summary.catalog_or_offer || 0} каталог/КП</span>
          <span>${summary.contract_purchase_won || 0} договор/закупка</span>
        </div>
      </div>

      <div class="deals-board">
        ${stages.map(stage => `
        <section class="deal-col deal-stage-${stage.id}">
          <div class="deal-col-header">
            <span>${stage.label}</span>
            <strong>${stage.count}</strong>
          </div>
          <div class="deal-col-body" data-stage-id="${stage.id}" ondragover="allowDealDrop(event)" ondrop="dropDealCard(event)">
            ${stage.clients.length ? stage.clients.map(c => `
              <article class="deal-card" draggable="true" data-lead-id="${c.lead_id || ''}" data-sheet-name="${c.sheet_name || ''}" data-row-number="${c.row_number || ''}" ondragstart="dragDealCard(event)" ondragend="endDealDrag(event)">
                <div class="deal-card-top">
                  <span class="badge badge-${dealBadgeClass(stage.id)}">${c.sheet_name || 'таблица'}</span>
                  <span class="deal-row">#${c.row_number || c.id}${c.status_override ? ' · saved' : ''}</span>
                </div>
                <div class="deal-title">${c.company_name || c.contact_name || 'Без имени'}</div>
                <div class="deal-meta">${[c.contact_name, c.city, c.phone || c.email].filter(Boolean).join(' · ') || 'Контакт не указан'}</div>
                ${c.interest ? `<div class="deal-line"><b>Интерес:</b> ${c.interest}</div>` : ''}
                ${c.status ? `<div class="deal-line"><b>Статус:</b> ${c.status}</div>` : ''}
                ${c.action_needed ? `<div class="deal-line"><b>Было действие:</b> ${c.action_needed}</div>` : ''}
                <div class="deal-next"><b>Следующий шаг:</b> ${c.next_action}</div>
                ${c.problem || c.notes || c.result ? `<div class="deal-context">${c.problem || c.notes || c.result}</div>` : ''}
              </article>
            `).join('') : '<div class="deal-empty">Нет строк на этом этапе</div>'}
          </div>
        </section>
        `).join('')}
      </div>
    </section>
  `;
}

function dealBadgeClass(stageId) {
  const map = {
    new: 'new',
    interested: 'qualified',
    catalog_sent: 'contacted',
    thinking: 'high',
    offer_sent: 'offer_sent',
    negotiation: 'negotiation',
    office_meeting: 'qualified',
    contract: 'won',
    purchase: 'won',
    won: 'won',
    lost: 'lost',
  };
  return map[stageId] || 'new';
}

function dragDealCard(event) {
  const card = event.currentTarget;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/json', JSON.stringify({
    lead_id: card.dataset.leadId ? Number(card.dataset.leadId) : null,
    sheet_name: card.dataset.sheetName,
    row_number: card.dataset.rowNumber ? Number(card.dataset.rowNumber) : null,
  }));
}

function endDealDrag(event) {
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.deal-col-body.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function allowDealDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}

async function dropDealCard(event) {
  event.preventDefault();
  const target = event.currentTarget;
  target.classList.remove('drag-over');
  const stage_id = target.dataset.stageId;
  let payload;
  try {
    payload = JSON.parse(event.dataTransfer.getData('application/json') || '{}');
  } catch {
    return;
  }
  if ((!payload.lead_id && (!payload.sheet_name || !payload.row_number)) || !stage_id) return;

  try {
    await api('/api/dashboard/deals/status', {
      method: 'PATCH',
      body: { ...payload, stage_id },
    });
    await renderDeals(document.getElementById('main'));
  } catch (err) {
    alert('Не удалось сохранить статус сделки: ' + err.message);
  }
}

async function pullDealsSheets() {
  const el = document.getElementById('deals-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Обновляю таблицы и пересобираю воронку сделок...';
  try {
    const result = await api('/api/google/pull/business', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ Обновено: ${result.rows} реда.`;
    setTimeout(() => renderDeals(document.getElementById('main')), 900);
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ ' + err.message;
  }
}

// ===== LEADS =====
async function renderLeads(el, filters = {}) {
  if (!Object.keys(filters).length) filters = { view: 'objects' };
  const tireMode = filters.view === 'tires' || filters.view === 'tire_base';
  const coldBaseMode = filters.view === 'tire_base';
  const dailyBriefScope = tireMode ? 'tires' : 'materials';
  currentLeadFilters = filters;
  const params = new URLSearchParams(filters);
  const statusCountFilters = { ...filters };
  delete statusCountFilters.status;
  statusCountFilters.limit = '5000';
  statusCountFilters.offset = '0';
  const statusCountParams = new URLSearchParams(statusCountFilters);
  const [data, statusCountData, summary, gmailStatus, dailyBrief] = await Promise.all([
    api(`/api/leads?${params}`),
    api(`/api/leads?${statusCountParams}`),
    api('/api/leads/summary').catch(() => ({ total: 0, statuses: [], sources: [] })),
    currentRole === 'admin' ? api('/api/gmail/status').catch(() => ({ accounts: [] })) : Promise.resolve({ accounts: [] }),
    api(`/api/dashboard/daily-brief?scope=${encodeURIComponent(dailyBriefScope)}`).catch(() => ({
      scope: dailyBriefScope,
      content: '',
      updated_at: null,
    })),
  ]);
  gmailAccountsCache = gmailStatus.accounts || [];
  ensureConnectedGmailSender();
  const rows = applyLeadQuickFilters(data.leads || [], filters);
  currentLeadRowsForExport = rows;
  const tireBadge = document.getElementById('nav-badge-tires');
  if (tireBadge && currentRole === 'admin') tireBadge.textContent = summary.tires || 0;
  const tireBaseBadge = document.getElementById('nav-badge-tire-base');
  if (tireBaseBadge && currentRole === 'admin') tireBaseBadge.textContent = summary.tire_base || 0;
  const visibleStages = leadStagesForView(filters);
  const statusCountRows = applyLeadQuickFilters(statusCountData.leads || [], statusCountFilters);
  const statusCounts = statusCountRows.reduce((counts, row) => {
    const status = leadDisplayStatus(row);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const responseMetrics = buildLeadResponseMetrics(statusCountRows, tireMode);
  const cityOptions = summary.cities || [];
  const mobileLeadCards = rows.length
    ? rows.map(l => renderLeadMobileCard(l, tireMode)).join('')
    : `<div class="lead-mobile-empty">${tireMode ? 'No leads match this filter.' : 'Нет лидов по этому фильтру.'}</div>`;

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>${coldBaseMode ? '📇 База клиентов' : tireMode ? '🛞 Tires' : '👥 Клиенты'} <span style="color:#666;font-size:14px;">(${rows.length})</span></h2>
      <div class="page-header-actions">
        <label style="display:flex;align-items:center;gap:7px;font-size:11px;color:#999;">
          ${tireMode ? 'Sender' : 'Отправитель'}
          <select
            class="lead-city-filter"
            style="width:230px;"
            onchange="setGmailSender(this.value);renderLeads(document.getElementById('main'), currentLeadFilters)"
          >
            ${gmailSenderOptions()}
          </select>
        </label>
        ${tireMode ? '' : '<button class="btn btn-secondary" onclick="openBulkPingModal()">Пинг всем</button>'}
        <button class="btn btn-secondary" onclick="downloadLeadAnalysisCsv()">${tireMode ? '⬇ Analysis CSV' : '⬇ CSV для анализа'}</button>
        ${coldBaseMode ? '' : `<button class="btn btn-secondary" onclick="syncFacebookLeadsFromLeadsPage()">📘 ${tireMode ? 'Sync Facebook leads' : 'Синхронизирай FB лиды'}</button>`}
        <button class="btn btn-primary" onclick="openNewLeadModal('${coldBaseMode ? 'tires_base' : tireMode ? 'tires' : 'materials'}')">+ ${tireMode ? 'New lead' : 'Нов лид'}</button>
      </div>
    </div>

    <div id="leads-sync-result" class="sync-result"></div>

    <div class="qualification-intro fade-in" style="margin-top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:14px;">
      <div style="min-width:0;">
        <div style="font-weight:700;color:#f3f4f6;">${coldBaseMode ? 'Холодная база клиентов' : 'Задача от админа на сегодня'}</div>
        <div style="font-size:13px;line-height:1.45;color:${dailyBrief.content ? '#d6dcf5' : '#8b97b7'};margin-top:4px;word-break:break-word;">
          ${escapeHtml(coldBaseMode ? 'Отдельная база для холодного обзвона по шинам. Эти компании не относятся к тёплым Facebook-лидам.' : (dailyBrief.content || 'Пока задача не указана.'))}
        </div>
      </div>
      ${currentRole === 'admin' && !coldBaseMode ? `
        <button
          class="btn btn-secondary"
          onclick="openDailyBriefModal('${dailyBriefScope}')"
          title="Редактировать задачу дня"
          style="padding:10px 12px;min-width:44px;flex:0 0 auto;"
        >📝</button>
      ` : ''}
    </div>

    ${tireMode ? `` : `<div class="lead-tabs fade-in">
      ${leadTab('Объекты', { view: 'objects' }, summary.objects ?? (data.leads || []).filter(lead => !isDistributorLead(lead) && !isServicesLead(lead)).length, filters.view === 'objects')}
      ${leadTab('Дистрибьюторы', { view: 'distributors' }, summary.distributors ?? (data.leads || []).filter(isDistributorLead).length, filters.view === 'distributors')}
      ${leadTab('Все лиды', { view: 'all' }, summary.total || 0, filters.view === 'all')}
      ${leadTab('Услуги', { view: 'services' }, summary.services || 0, filters.view === 'services')}
      ${leadTab('Сегодня', { view: 'all', date_range: 'today' }, summary.today || 0, filters.date_range === 'today')}
      ${leadTab('7 дней', { view: 'all', date_range: 'week' }, summary.week || 0, filters.date_range === 'week')}
      ${leadTab('Звонки сегодня', { view: 'all', followup: 'due' }, summary.followups_due || 0, filters.followup === 'due')}
      <button
        class="lead-tab ${!filters.source_group ? 'active' : ''}"
        onclick="toggleLeadSourceGroupFilter()"
      >
        <span>Все источники</span>
      </button>
      <button
        class="lead-tab ${filters.source_group === 'facebook' ? 'active' : ''}"
        onclick="toggleLeadSourceGroupFilter('facebook')"
      >
        <span>Facebook</span>
      </button>
      <button
        class="lead-tab ${filters.source_group === 'manual' ? 'active' : ''}"
        onclick="toggleLeadSourceGroupFilter('manual')"
      >
        <span>Сайт / вручную</span>
      </button>
    </div>`}

    <div class="lead-status-tabs fade-in">
      <button
        class="lead-status-tab ${filters.status ? '' : 'active'}"
        style="${filters.status ? '' : 'background:#e5e7eb;color:#111827;border-color:#e5e7eb;'}"
        onclick="clearLeadStatusFilter()"
      >
        Все клиенты <span>${statusCountRows.length}</span>
      </button>
      ${visibleStages.map(status =>
        `<button class="lead-status-tab ${filters.status === status ? 'active' : ''}" style="${leadStatusTabStyle(status, filters.status === status)}" onclick="renderLeads(document.getElementById('main'), {...currentLeadFilters, status: '${status}'})">
          ${tireMode ? tireStatusLabel(status) : statusLabel(status)} <span>${statusCounts[status] || 0}</span>
        </button>`
      ).join('')}
    </div>

    <div class="qualification-intro fade-in" style="margin-top:12px;padding:12px 14px;">
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;">
        <div><strong>${coldBaseMode ? 'Холодная база' : 'Средний 1-й ответ'}</strong>: ${coldBaseMode ? 'обзвон и квалификация' : (responseMetrics.avgMinutes === null ? 'пока нет данных' : formatBusinessResponseShort(responseMetrics.avgMinutes, tireMode))}</div>
        <div style="color:#8b97b7;">Замерено лидов: ${responseMetrics.measured}</div>
        <div style="color:#8b97b7;">Часовой пояс: ${tireMode ? 'Europe/Berlin' : 'Europe/Sofia'} · 09:00–18:00 · пн–пт</div>
      </div>
    </div>

    <div class="search-bar fade-in">
      ${tireMode ? '' : `<button
        class="btn ${filters.volume_sort === 'desc' ? 'btn-primary' : 'btn-secondary'}"
        onclick="toggleLeadQuickFilter('volume_sort', 'desc')"
        title="Сначала самые большие объёмы"
      >
        📐 По объёму
      </button>`}
      <button
        class="btn ${filters.premium === '1' ? 'btn-primary' : 'btn-secondary'}"
        onclick="toggleLeadQuickFilter('premium', '1')"
        title="Только premium-лиды"
        style="${filters.premium === '1' ? 'background:#b68a28;border-color:#f6d365;color:#fff7d6;' : 'color:#f6d365;border-color:rgba(246,211,101,.35);'}"
      >
        ✨ Premium
      </button>
      ${tireMode ? '' : `<button
        class="btn ${filters.specific_object === '1' ? 'btn-primary' : 'btn-secondary'}"
        onclick="toggleLeadQuickFilter('specific_object', '1')"
        title="Материалы под конкретный объект"
      >
        🏗️ Конкретный объект
      </button>`}
      <select
        class="lead-city-filter"
        onchange="renderLeads(document.getElementById('main'), {...currentLeadFilters, city: this.value || undefined})"
      >
        <option value="">${tireMode ? 'All cities' : 'Все города'}</option>
        ${cityOptions.map(item => `
          <option value="${escapeAttr(item.city)}" ${filters.city === item.city ? 'selected' : ''}>
            ${escapeHtml(item.city)}${item.count ? ` (${item.count})` : ''}
          </option>
        `).join('')}
      </select>
    </div>

    <div class="card fade-in lead-list-card">
      <div class="lead-mobile-list">
        ${mobileLeadCards}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${tireMode ? 'Company' : 'Компания'}</th>
              <th>${tireMode ? 'Contact' : 'Контакт'}</th>
              <th>${tireMode ? 'Phone / Email' : 'Телефон / Email'}</th>
              <th>${tireMode ? 'City' : 'Град'}</th>
              <th>${tireMode ? 'Status' : 'Статус'}</th>
              <th>${tireMode ? 'Channels' : 'Контакт'}</th>
              <th>${tireMode ? 'Interest' : 'Тип / интерес'}</th>
              <th>Время</th>
              <th>${tireMode ? 'Комментарий' : 'Комментарий'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(l => `
              <tr class="${leadDisplayStatus(l) === 'new' || leadDisplayStatus(l) === 'partner_new' ? 'lead-row-new' : ''}" onclick="openLeadDetail(${l.id})" style="cursor:pointer;">
                <td style="font-weight:500;color:${l.is_gold_lead ? '#f6d365' : '#ddd'};max-width:148px;line-height:1.25;word-break:break-word;">${l.company_name || '—'}</td>
                <td style="max-width:120px;line-height:1.25;word-break:break-word;">${l.contact_name || '—'}</td>
                <td style="font-size:11px;max-width:132px;" onclick="event.stopPropagation();">
                  <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;">${l.phone || l.email || '—'}</span>
                    ${needsCatalogPing(l) ? `<button class="lead-ping-bell" title="Запросить обратную связь по КП" onclick="event.stopPropagation();openCatalogPingModal(${l.id})">🔔</button>` : ''}
                  </div>
                </td>
                <td>${l.city || '—'}</td>
                <td onclick="event.stopPropagation();">
                  <div class="lead-status-cell">
                    <select
                      class="lead-inline-status-select lead-inline-status-${leadDisplayStatus(l)}"
                      data-previous-value="${leadDisplayStatus(l)}"
                      onclick="event.stopPropagation();"
                      onchange="inlineUpdateLeadStatus(${l.id}, this.value, event)"
                    >
                      ${leadStagesForLead(l).map(status => `<option value="${status}" ${leadDisplayStatus(l) === status ? 'selected' : ''}>${tireMode ? tireStatusLabel(status) : statusLabel(status)}</option>`).join('')}
                    </select>
                    <button
                      class="lead-qualification-btn ${leadQualificationProgress(l) === 100 ? 'complete' : ''}"
                      style="--qualification-progress:${leadQualificationProgress(l)}%"
                      title="${tireMode ? 'Details completed' : 'Бриф заполнен на'} ${leadQualificationProgress(l)}%"
                      onclick="event.stopPropagation();openLeadQualificationModal(${l.id})"
                    ><span>📝</span></button>
                  </div>
                </td>
                <td onclick="event.stopPropagation();" style="min-width:96px;width:96px;">${renderLeadTableContactActions(l)}</td>
                <td style="max-width:150px;font-size:11px;color:${l.is_gold_lead ? '#f6d365' : '#aaa'};font-weight:${l.is_gold_lead ? '700' : '400'};line-height:1.2;word-break:break-word;">${l.area_label || l.interest_products || '—'}</td>
                <td style="width:118px;">${renderLeadTimingCell(l, tireMode)}</td>
                <td style="width:180px;max-width:180px;" onclick="event.stopPropagation();">
                  <button class="btn btn-sm btn-secondary ${l.has_fresh_comment ? 'fresh-comment-btn' : ''}" title="${escapeAttr(l.latest_comment || (tireMode ? 'Add comment' : 'Добавить комментарий'))}" onclick="openQuickCommentModal(${l.id}, '${encodeURIComponent(l.latest_comment || '')}')" style="width:100%;display:inline-flex;gap:6px;align-items:center;justify-content:flex-start;">
                    <span class="fresh-comment-icon-wrap">💬${l.has_fresh_comment ? '<span class="fresh-comment-dot"></span>' : ''}</span><span style="display:inline-block;max-width:135px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.latest_comment ? escapeHtml(l.latest_comment) : (tireMode ? 'Add' : 'Добавить')}</span>
                  </button>
                </td>
                <td style="display:flex;gap:6px;">
                  <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();openLeadDetail(${l.id})">👁</button>
                </td>
              </tr>
            `).join('') : `<tr><td colspan="10" style="text-align:center;color:#666;padding:30px;">${tireMode ? 'No leads match this filter.' : 'Нет лидов по этому фильтру.'}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function leadTab(label, filters, count, active) {
  const safe = encodeURIComponent(JSON.stringify(filters));
  return `
    <button class="lead-tab ${active ? 'active' : ''}" onclick="renderLeads(document.getElementById('main'), JSON.parse(decodeURIComponent('${safe}')))">
      <span>${label}</span><strong>${count}</strong>
    </button>
  `;
}

function toggleLeadQuickFilter(key, value) {
  const nextFilters = { ...currentLeadFilters };
  if (nextFilters[key] === value) {
    delete nextFilters[key];
  } else {
    nextFilters[key] = value;
  }
  renderLeads(document.getElementById('main'), nextFilters);
}

function toggleLeadSourceGroupFilter(value = '') {
  const nextFilters = { ...currentLeadFilters };
  if (!value || nextFilters.source_group === value) {
    delete nextFilters.source_group;
  } else {
    nextFilters.source_group = value;
  }
  renderLeads(document.getElementById('main'), nextFilters);
}

function renderLeadMobileCard(l, tireMode = false) {
  const status = leadDisplayStatus(l);
  const titleColor = l.is_gold_lead ? '#f6d365' : '#f3f4f6';
  const interest = l.area_label || l.interest_products || '—';
  const commentText = l.latest_comment ? escapeHtml(l.latest_comment) : (tireMode ? 'Add comment' : 'Добавить комментарий');
  const commentTitle = escapeAttr(l.latest_comment || (tireMode ? 'Add comment' : 'Добавить комментарий'));

  return `
    <article class="lead-mobile-card ${status === 'new' || status === 'partner_new' ? 'lead-mobile-card-new' : ''}" onclick="openLeadDetail(${l.id})">
      <div class="lead-mobile-card-head">
        <div class="lead-mobile-card-company" style="color:${titleColor};">${escapeHtml(l.company_name || '—')}</div>
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();openLeadDetail(${l.id})">👁</button>
      </div>

      <div class="lead-mobile-card-meta">
        <div><span>${tireMode ? 'Contact' : 'Контакт'}</span><strong>${escapeHtml(l.contact_name || '—')}</strong></div>
        <div><span>${tireMode ? 'Phone / Email' : 'Телефон / Email'}</span><strong>${escapeHtml(l.phone || l.email || '—')}</strong></div>
        <div><span>${tireMode ? 'City' : 'Город'}</span><strong>${escapeHtml(l.city || '—')}</strong></div>
        <div><span>${tireMode ? 'Interest' : 'Интерес'}</span><strong style="color:${l.is_gold_lead ? '#f6d365' : '#d1d5db'};">${escapeHtml(interest)}</strong></div>
      </div>

      <div class="lead-mobile-card-row" onclick="event.stopPropagation();">
        <div class="lead-mobile-card-label">${tireMode ? 'Status' : 'Статус'}</div>
        <div class="lead-status-cell">
          <select
            class="lead-inline-status-select lead-inline-status-${status}"
            data-previous-value="${status}"
            onclick="event.stopPropagation();"
            onchange="inlineUpdateLeadStatus(${l.id}, this.value, event)"
          >
            ${leadStagesForLead(l).map(stage => `<option value="${stage}" ${status === stage ? 'selected' : ''}>${tireMode ? tireStatusLabel(stage) : statusLabel(stage)}</option>`).join('')}
          </select>
          <button
            class="lead-qualification-btn ${leadQualificationProgress(l) === 100 ? 'complete' : ''}"
            style="--qualification-progress:${leadQualificationProgress(l)}%"
            title="${tireMode ? 'Details completed' : 'Бриф заполнен на'} ${leadQualificationProgress(l)}%"
            onclick="event.stopPropagation();openLeadQualificationModal(${l.id})"
          ><span>📝</span></button>
        </div>
      </div>

      <div class="lead-mobile-card-row" onclick="event.stopPropagation();">
        <div class="lead-mobile-card-label">${tireMode ? 'Channels' : 'Контакты'}</div>
        <div class="lead-mobile-card-actions">
          ${renderLeadTableContactActions(l)}
          ${needsCatalogPing(l) ? `<button class="lead-ping-bell" title="Запросить обратную связь по КП" onclick="event.stopPropagation();openCatalogPingModal(${l.id})">🔔</button>` : ''}
        </div>
      </div>

      <div class="lead-mobile-card-row">
        <div class="lead-mobile-card-label">CRM</div>
        <div class="lead-mobile-card-time">${renderLeadTimingCell(l, tireMode)}</div>
      </div>

      <div class="lead-mobile-card-row" onclick="event.stopPropagation();">
        <div class="lead-mobile-card-label">${tireMode ? 'Comment' : 'Комментарий'}</div>
        <button class="btn btn-sm btn-secondary ${l.has_fresh_comment ? 'fresh-comment-btn' : ''}" title="${commentTitle}" onclick="openQuickCommentModal(${l.id}, '${encodeURIComponent(l.latest_comment || '')}')" style="width:100%;display:inline-flex;gap:6px;align-items:center;justify-content:flex-start;">
          <span class="fresh-comment-icon-wrap">💬${l.has_fresh_comment ? '<span class="fresh-comment-dot"></span>' : ''}</span>
          <span class="lead-mobile-comment-text">${commentText}</span>
        </button>
      </div>
    </article>
  `;
}

function clearLeadStatusFilter() {
  const nextFilters = { ...currentLeadFilters };
  delete nextFilters.status;
  renderLeads(document.getElementById('main'), nextFilters);
}

function leadStatusTabStyle(status, active) {
  const map = {
    new: ['rgba(96,165,250,0.12)', '#7fb3ff', 'rgba(96,165,250,0.3)'],
    contacted: ['rgba(56,189,248,0.12)', '#7dd3fc', 'rgba(56,189,248,0.3)'],
    needs_discovery: ['rgba(251,191,36,0.12)', '#f6d365', 'rgba(251,191,36,0.32)'],
    offer_preparation: ['rgba(59,130,246,0.12)', '#7dc4ff', 'rgba(59,130,246,0.32)'],
    offer_sent: ['rgba(167,139,250,0.12)', '#c4b5fd', 'rgba(167,139,250,0.32)'],
    negotiation: ['rgba(244,114,182,0.12)', '#f9a8d4', 'rgba(244,114,182,0.32)'],
    office_meeting: ['rgba(45,212,191,0.12)', '#99f6e4', 'rgba(45,212,191,0.32)'],
    contract: ['rgba(34,197,94,0.1)', '#86efac', 'rgba(34,197,94,0.26)'],
    purchase: ['rgba(16,185,129,0.1)', '#6ee7b7', 'rgba(16,185,129,0.26)'],
    won: ['rgba(74,222,128,0.14)', '#4ade80', 'rgba(74,222,128,0.35)'],
    lost: ['rgba(248,113,113,0.12)', '#fca5a5', 'rgba(248,113,113,0.28)'],
    partner_new: ['rgba(96,165,250,0.12)', '#7fb3ff', 'rgba(96,165,250,0.3)'],
    partner_qualification: ['rgba(251,191,36,0.12)', '#f6d365', 'rgba(251,191,36,0.32)'],
    partner_negotiation: ['rgba(244,114,182,0.12)', '#f9a8d4', 'rgba(244,114,182,0.32)'],
    partner_meeting: ['rgba(45,212,191,0.12)', '#99f6e4', 'rgba(45,212,191,0.32)'],
    partner_terms_sent: ['rgba(167,139,250,0.12)', '#c4b5fd', 'rgba(167,139,250,0.32)'],
    partner_test_order: ['rgba(16,185,129,0.1)', '#6ee7b7', 'rgba(16,185,129,0.26)'],
    partner_active: ['rgba(74,222,128,0.14)', '#4ade80', 'rgba(74,222,128,0.35)'],
  };
  const [bg, color, border] = map[status] || ['rgba(255,255,255,0.04)', '#ddd', 'rgba(255,255,255,0.08)'];
  if (!active) return `background:${bg};color:${color};border-color:${border};`;
  return `background:${color};color:#111827;border-color:${color};box-shadow:0 0 0 1px ${border} inset;`;
}

function tireStatusLabel(status) {
  return {
    new: 'New lead',
    needs_discovery: 'Clarify details',
    offer_preparation: 'Prepare offer',
    offer_sent: 'Offer sent',
    negotiation: 'Negotiation',
    office_meeting: 'Meeting',
    contract: 'Contract approval',
    purchase: 'Purchase & delivery',
    won: 'Won',
    lost: 'Lost / inactive',
  }[status] || statusLabel(status);
}

function isTireColdBaseLead(lead = {}) {
  const leadType = String(lead.lead_type || '').toLowerCase();
  const source = String(lead.source || '').toLowerCase();
  return leadType === 'tire_cold_base' || source === 'tire_cold_base';
}

function applyLeadQuickFilters(rows, filters = {}) {
  let result = [...rows];

  if (filters.view === 'objects') {
    result = result.filter(row => !isDistributorLead(row) && !isServicesLead(row) && !isTireLead(row));
  }

  if (filters.view === 'distributors') {
    result = result.filter(isDistributorLead);
  }

  if (filters.premium === '1') {
    result = result.filter(row => !!row.is_gold_lead);
  }

  if (filters.distributors === '1') {
    result = result.filter(isDistributorLead);
  }

  if (filters.specific_object === '1') {
    result = result.filter(isSpecificObjectLead);
  }

  if (filters.source_group === 'facebook') {
    result = result.filter(isFacebookLeadSource);
  }

  if (filters.source_group === 'manual') {
    result = result.filter(row => !isFacebookLeadSource(row));
  }

  if (filters.volume_sort === 'desc') {
    result.sort((a, b) => {
      const volumeDiff = extractLeadAreaNumber(b.area_label) - extractLeadAreaNumber(a.area_label);
      if (volumeDiff !== 0) return volumeDiff;
      if (Number(b.is_gold_lead) !== Number(a.is_gold_lead)) return Number(b.is_gold_lead) - Number(a.is_gold_lead);
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }

  return result;
}

function extractLeadAreaNumber(areaLabel = '') {
  const matches = String(areaLabel || '').match(/\d+/g);
  if (!matches || !matches.length) return 0;
  return Math.max(...matches.map(Number));
}

function isFacebookLeadSource(lead = {}) {
  return String(lead.source || '').trim().toLowerCase() === 'facebook';
}

function isDistributorLead(lead = {}) {
  if (/solvarex/i.test(String(lead.company_name || ''))) return true;
  if (String(lead.crm_segment || '').toLowerCase() === 'distributor') return true;
  if (String(lead.crm_segment || '').toLowerCase() === 'objects') return false;
  const text = `${lead.company_type || ''} ${lead.notes || ''} ${lead.form_summary || ''}`.toLowerCase();
  return /дистриб|distributor|dealer|дилър|reseller|търговец/.test(text);
}

function isTireLead(lead = {}) {
  const text = `${lead.lead_type || ''} ${lead.fb_campaign_name || ''} ${lead.fb_ad_name || ''} ${lead.interest_products || ''}`.toLowerCase();
  return /(tiers|tires|tyres|tire|шины|гуми)/.test(text);
}

function leadStagesForLead(lead = {}) {
  return isDistributorLead(lead) ? DISTRIBUTOR_CRM_STAGES : OBJECT_CRM_STAGES;
}

function leadStagesForView(filters = {}) {
  return filters.view === 'distributors' ? DISTRIBUTOR_CRM_STAGES : OBJECT_CRM_STAGES;
}

function leadDisplayStatus(lead = {}) {
  const status = String(lead.status || '').toLowerCase();
  const legacyObject = {
    contacted: 'needs_discovery',
    details: 'needs_discovery',
    interested: 'needs_discovery',
    qualified: 'needs_discovery',
    catalog_sent: 'needs_discovery',
    thinking: 'needs_discovery',
  };
  const objectStatus = legacyObject[status] || status || 'new';
  if (!isDistributorLead(lead)) {
    return OBJECT_CRM_STAGES.includes(objectStatus) ? objectStatus : 'new';
  }
  const distributorMap = {
    new: 'partner_new',
    contacted: 'partner_qualification',
    needs_discovery: 'partner_qualification',
    details: 'partner_qualification',
    interested: 'partner_qualification',
    qualified: 'partner_qualification',
    catalog_sent: 'partner_qualification',
    thinking: 'partner_qualification',
    offer_preparation: 'partner_terms_sent',
    offer_sent: 'partner_terms_sent',
    negotiation: 'partner_negotiation',
    office_meeting: 'partner_meeting',
    contract: 'partner_test_order',
    purchase: 'partner_test_order',
    won: 'partner_active',
    lost: 'lost',
  };
  const mapped = distributorMap[status] || status || 'partner_new';
  return DISTRIBUTOR_CRM_STAGES.includes(mapped) ? mapped : 'partner_new';
}

function leadQualificationData(lead = {}) {
  if (!lead.qualification_data) return {};
  if (typeof lead.qualification_data === 'object') return lead.qualification_data;
  try {
    return JSON.parse(lead.qualification_data);
  } catch {
    return {};
  }
}

function leadQualificationComplete(lead = {}) {
  return leadQualificationData(lead).completed === true;
}

const OBJECT_QUALIFICATION_PROBLEM_OPTIONS = [
  ['active_leaks', 'Активные течи'],
  ['wall_moisture', 'Влажность по стенам'],
  ['cracks', 'Трещины'],
  ['construction_joints', 'Вода через рабочие швы'],
  ['utility_entries', 'Вода возле труб и кабелей'],
  ['voids_behind_structure', 'Пустоты за конструкцией'],
  ['structural_strengthening', 'Необходимость укрепления'],
  ['other', 'Другая проблема'],
];

const OBJECT_QUALIFICATION_COMMON_FIELDS = [
  {
    id: 'construction_type',
    label: 'Тип конструкции',
    type: 'select',
    options: [
      ['', 'Выберите тип конструкции'],
      ['foundation', 'Фундамент'],
      ['basement', 'Подвал'],
      ['parking', 'Паркинг'],
      ['reservoir', 'Резервуар'],
      ['tunnel', 'Тоннель'],
      ['roof', 'Крыша'],
      ['terrace', 'Терраса'],
      ['balcony', 'Балкон'],
      ['other', 'Другое'],
    ],
  },
  {
    id: 'construction_material',
    label: 'Из чего выполнена конструкция',
    type: 'select',
    options: [
      ['', 'Выберите материал'],
      ['concrete', 'Бетон'],
      ['reinforced_concrete', 'Железобетон'],
      ['brick', 'Кирпич'],
      ['stone', 'Камень'],
      ['other', 'Другое'],
    ],
  },
  { id: 'zone_length', label: 'Размер проблемной зоны: длина', placeholder: 'м' },
  { id: 'zone_width', label: 'Размер проблемной зоны: ширина', placeholder: 'м' },
  { id: 'zone_depth', label: 'Размер проблемной зоны: глубина', placeholder: 'м, если применимо' },
  {
    id: 'external_access',
    label: 'Есть ли доступ снаружи',
    type: 'select',
    options: [
      ['', 'Выберите ответ'],
      ['yes', 'Да'],
      ['no', 'Нет'],
      ['limited', 'Частично / ограниченно'],
    ],
  },
  {
    id: 'internal_access',
    label: 'Есть ли доступ изнутри',
    type: 'select',
    options: [
      ['', 'Выберите ответ'],
      ['yes', 'Да'],
      ['no', 'Нет'],
      ['limited', 'Частично / ограниченно'],
    ],
  },
  {
    id: 'repair_timing',
    label: 'Когда нужно выполнить ремонт',
    type: 'select',
    options: [
      ['', 'Выберите срок'],
      ['urgent', 'Срочно'],
      ['1_2_weeks', 'В течение 1–2 недель'],
      ['within_month', 'В течение месяца'],
      ['later', 'Позже'],
    ],
  },
  {
    id: 'has_photos',
    label: 'Есть ли фотографии',
    type: 'select',
    options: [
      ['', 'Выберите ответ'],
      ['yes', 'Да'],
      ['no', 'Нет'],
      ['later', 'Отправят позже'],
    ],
  },
  {
    id: 'has_drawings',
    label: 'Есть ли чертежи объекта',
    type: 'select',
    options: [
      ['', 'Выберите ответ'],
      ['yes', 'Да'],
      ['no', 'Нет'],
      ['later', 'Отправят позже'],
    ],
  },
  {
    id: 'has_video',
    label: 'Есть ли видео',
    type: 'select',
    options: [
      ['', 'Выберите ответ'],
      ['yes', 'Да'],
      ['no', 'Нет'],
      ['later', 'Отправят позже'],
    ],
  },
  {
    id: 'executor',
    label: 'Кто будет выполнять работы',
    type: 'select',
    options: [
      ['', 'Выберите вариант'],
      ['client', 'Сам клиент'],
      ['construction_company', 'Строительная компания'],
      ['need_contractor', 'Нужен подрядчик'],
    ],
  },
];

const OBJECT_QUALIFICATION_PROBLEM_FIELDS = {
  active_leaks: {
    title: 'Диагностика активных течей',
    fields: [
      {
        id: 'leak_location',
        label: 'Где именно течёт',
        type: 'select',
        options: [
          ['', 'Выберите место'],
          ['wall', 'Стена'],
          ['ceiling', 'Потолок'],
          ['floor', 'Пол'],
          ['joint', 'Рабочий шов'],
          ['crack', 'Трещина'],
          ['entry', 'Ввод трубы / кабеля'],
          ['other', 'Другое'],
        ],
      },
      {
        id: 'leak_when',
        label: 'Когда появляется течь',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['constant', 'Постоянно'],
          ['during_rain', 'Только во время дождя'],
          ['after_rain', 'После дождя'],
          ['groundwater', 'При высоком уровне грунтовых вод'],
        ],
      },
      {
        id: 'water_behavior',
        label: 'Вода течёт или просто влажно',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['flowing', 'Течёт вода'],
          ['damp', 'Просто влажно'],
        ],
      },
      {
        id: 'water_flow',
        label: 'Какой приблизительно расход воды',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['dripping', 'Капает'],
          ['stream', 'Струйка'],
          ['strong_flow', 'Сильный поток'],
        ],
      },
      { id: 'leak_zone_length', label: 'Длина зоны течи', placeholder: 'м' },
      {
        id: 'photo_video',
        label: 'Есть фото / видео',
        type: 'select',
        options: [
          ['', 'Выберите ответ'],
          ['yes', 'Да'],
          ['no', 'Нет'],
          ['later', 'Отправят позже'],
        ],
      },
    ],
  },
  wall_moisture: {
    title: 'Диагностика влажности по стенам',
    fields: [
      {
        id: 'moisture_pattern',
        label: 'Влага идёт снизу вверх или по всей стене',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['bottom_up', 'Снизу вверх'],
          ['whole_wall', 'По всей стене'],
        ],
      },
      { id: 'wet_length', label: 'Площадь влажной зоны: длина', placeholder: 'м' },
      { id: 'wet_height', label: 'Площадь влажной зоны: высота', placeholder: 'м' },
      { id: 'white_salts', label: 'Есть белый налёт (соли)', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет']] },
      { id: 'mold', label: 'Есть плесень', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет']] },
      {
        id: 'wall_material',
        label: 'Стена бетонная, кирпичная или каменная',
        type: 'select',
        options: [
          ['', 'Выберите материал'],
          ['concrete', 'Бетонная'],
          ['brick', 'Кирпичная'],
          ['stone', 'Каменная'],
        ],
      },
      {
        id: 'inside_or_outside',
        label: 'Проблема внутри или снаружи',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['inside', 'Внутри'],
          ['outside', 'Снаружи'],
        ],
      },
    ],
  },
  cracks: {
    title: 'Диагностика трещин',
    fields: [
      { id: 'crack_location', label: 'Где находятся трещины', type: 'textarea', placeholder: 'Стена, плита, угол, шов и т.д.' },
      { id: 'crack_length', label: 'Длина трещины', placeholder: 'м' },
      {
        id: 'crack_width',
        label: 'Ширина трещины',
        type: 'select',
        options: [
          ['', 'Выберите диапазон'],
          ['up_to_0_2', 'До 0.2 мм'],
          ['0_2_0_5', '0.2–0.5 мм'],
          ['0_5_2', '0.5–2 мм'],
          ['over_2', 'Более 2 мм'],
        ],
      },
      {
        id: 'crack_water',
        label: 'Трещины сухие или через них идёт вода',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['dry', 'Сухие'],
          ['water', 'Через них идёт вода'],
        ],
      },
      { id: 'crack_growing', label: 'Трещины продолжают увеличиваться', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет'], ['unknown', 'Неизвестно']] },
      { id: 'crack_count', label: 'Сколько трещин примерно', placeholder: 'Например: 3–5 шт.' },
      { id: 'crack_photos', label: 'Есть фотографии', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет'], ['later', 'Отправят позже']] },
    ],
  },
  construction_joints: {
    title: 'Диагностика воды через рабочие швы',
    fields: [
      { id: 'joint_location', label: 'Где расположен шов', type: 'textarea', placeholder: 'Стена/пол, деформационный шов, стык плиты и т.д.' },
      { id: 'joint_length', label: 'Какая длина шва', placeholder: 'м' },
      {
        id: 'joint_water_when',
        label: 'Вода идёт постоянно или только при дожде',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['constant', 'Постоянно'],
          ['rain_only', 'Только при дожде'],
        ],
      },
      { id: 'joint_pressure', label: 'Есть давление воды', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет'], ['unknown', 'Неизвестно']] },
      { id: 'joint_repaired_before', label: 'Уже ремонтировали раньше', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет']] },
    ],
  },
  utility_entries: {
    title: 'Диагностика воды возле труб и кабелей',
    fields: [
      {
        id: 'entry_type',
        label: 'Это труба или кабель',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['pipe', 'Труба'],
          ['cable', 'Кабель'],
          ['both', 'И труба, и кабель'],
        ],
      },
      { id: 'entry_diameter', label: 'Диаметр прохода', placeholder: 'мм' },
      {
        id: 'entry_leak_path',
        label: 'Вода идёт',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['between_cables', 'Между кабелями'],
          ['around_pipe', 'Вокруг трубы'],
          ['around_sleeve', 'Вокруг гильзы'],
        ],
      },
      { id: 'entry_count', label: 'Сколько проходов', placeholder: 'Количество' },
      { id: 'entry_constant_leak', label: 'Есть постоянная течь', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет']] },
    ],
  },
  voids_behind_structure: {
    title: 'Диагностика пустот за конструкцией',
    fields: [
      { id: 'void_location', label: 'Где находятся пустоты', type: 'textarea', placeholder: 'Под плитой, за стеной, у фундамента и т.д.' },
      { id: 'void_reason', label: 'Почему считаете, что они есть', type: 'textarea', placeholder: 'Просадка, гулкость, протечки, трещины...' },
      { id: 'void_settlement', label: 'Есть просадка', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет']] },
      { id: 'void_cracks', label: 'Есть трещины', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет']] },
      { id: 'void_volume', label: 'Какой ориентировочный объём', placeholder: 'м³ или описание' },
      { id: 'void_geology', label: 'Есть геология', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет'], ['unknown', 'Неизвестно']] },
    ],
  },
  structural_strengthening: {
    title: 'Диагностика необходимости укрепления',
    fields: [
      {
        id: 'strengthening_target',
        label: 'Что нужно укрепить',
        type: 'select',
        options: [
          ['', 'Выберите вариант'],
          ['foundation', 'Фундамент'],
          ['slab', 'Плита'],
          ['columns', 'Колонны'],
          ['walls', 'Стены'],
          ['soil', 'Грунт'],
        ],
      },
      { id: 'strengthening_reason', label: 'Почему требуется укрепление', type: 'textarea', placeholder: 'Просадка, трещины, нагрузка, деформация...' },
      { id: 'engineer_report', label: 'Есть заключение инженера', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет'], ['pending', 'Ожидается']] },
      { id: 'strengthening_settlement', label: 'Есть просадка', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет']] },
      { id: 'strengthening_area', label: 'Размер участка', placeholder: 'м² или описание' },
    ],
  },
  other: {
    title: 'Другая проблема',
    fields: [
      { id: 'other_problem_description', label: 'Опишите проблему', type: 'textarea', placeholder: 'Что происходит на объекте' },
      { id: 'other_problem_location', label: 'Где находится проблема', type: 'textarea', placeholder: 'Помещение, зона, конструкция' },
      { id: 'other_problem_dimensions', label: 'Размеры участка', placeholder: 'м / м² / м³' },
      { id: 'other_problem_started', label: 'Когда появилась проблема', placeholder: 'Дата или период' },
      { id: 'other_problem_now', label: 'Что происходит сейчас', type: 'textarea', placeholder: 'Текущее состояние' },
      { id: 'other_problem_photos', label: 'Есть фотографии', type: 'select', options: [['', 'Выберите ответ'], ['yes', 'Да'], ['no', 'Нет'], ['later', 'Отправят позже']] },
    ],
  },
};

function objectQualificationLabel(id) {
  const problemLabel = Object.fromEntries(OBJECT_QUALIFICATION_PROBLEM_OPTIONS)[id];
  if (problemLabel) return problemLabel;
  const commonField = OBJECT_QUALIFICATION_COMMON_FIELDS.find(field => field.id === id);
  if (commonField) return commonField.label;
  for (const config of Object.values(OBJECT_QUALIFICATION_PROBLEM_FIELDS)) {
    const match = config.fields.find(field => field.id === id);
    if (match) return match.label;
  }
  return id;
}

function objectQualificationDisplayValue(fieldId, value) {
  if (!value) return '-';
  const field =
    OBJECT_QUALIFICATION_COMMON_FIELDS.find(item => item.id === fieldId) ||
    Object.values(OBJECT_QUALIFICATION_PROBLEM_FIELDS).flatMap(config => config.fields).find(item => item.id === fieldId);
  if (field?.type === 'select') {
    const match = (field.options || []).find(([optionValue]) => String(optionValue) === String(value));
    return match ? match[1] : value;
  }
  return value;
}

function formatQualificationHistoryEntry(activity = {}) {
  let payload = {};
  try {
    payload = activity.new_value ? JSON.parse(activity.new_value) : {};
  } catch {
    payload = {};
  }
  const type = payload.client_type || '-';
  const typeLabelMap = {
    concrete_object: 'Объект',
    construction_company: 'Строительная фирма',
    distributor: 'Дистрибьютор / партнёр',
    tire_customer: 'Шины / диски',
  };
  const lines = [];

  if (type === 'concrete_object') {
    const problemType = payload.problem_type || payload.problems?.[0] || '';
    const problemDetails = payload.problem_details || {};
    const commonDetails = payload.common_details || {};
    lines.push(`Проблема: ${objectQualificationLabel(problemType) || '-'}`);
    const problemConfig = OBJECT_QUALIFICATION_PROBLEM_FIELDS[problemType];
    if (problemConfig?.fields?.length) {
      problemConfig.fields.forEach(field => {
        if (problemDetails[field.id]) {
          lines.push(`${field.label}: ${objectQualificationDisplayValue(field.id, problemDetails[field.id])}`);
        }
      });
    }
    OBJECT_QUALIFICATION_COMMON_FIELDS.forEach(field => {
      if (commonDetails[field.id]) {
        lines.push(`${field.label}: ${objectQualificationDisplayValue(field.id, commonDetails[field.id])}`);
      }
    });
  } else if (type === 'construction_company') {
    if (payload.materials_interest) lines.push(`Материалы: ${payload.materials_interest}`);
    if (payload.application_type) lines.push(`Объект / применение: ${payload.application_type}`);
    if (payload.quantities) lines.push(`Количество: ${payload.quantities}`);
    if (payload.delivery_timing) lines.push(`Срок доставки: ${payload.delivery_timing}`);
    if (payload.has_specification) lines.push(`Спецификация: ${payload.has_specification}`);
  } else if (type === 'distributor') {
    if (payload.region) lines.push(`Регион: ${payload.region}`);
    if (payload.current_products) lines.push(`Текущие продукты: ${payload.current_products}`);
    if (payload.warehouse_team) lines.push(`Склад / команда: ${payload.warehouse_team}`);
    if (payload.sales_volume) lines.push(`Объёмы: ${payload.sales_volume}`);
    if (payload.partnership_interest) lines.push(`Интерес к партнёрству: ${payload.partnership_interest}`);
  } else if (type === 'tire_customer') {
    if (payload.vehicle) lines.push(`Автомобиль: ${payload.vehicle}`);
    if (payload.tire_size) lines.push(`Размер шин: ${payload.tire_size}`);
    if (payload.tire_type) lines.push(`Тип шин: ${payload.tire_type}`);
    if (payload.preferred_brand) lines.push(`Бренд: ${payload.preferred_brand}`);
    if (payload.quantity_and_rims) lines.push(`Количество / диски: ${payload.quantity_and_rims}`);
  }

  if (payload.notes) {
    lines.push(`Доп. заметки: ${payload.notes}`);
  }
  if (payload.manual_complete === true) {
    lines.push('Отмечено: данных достаточно для подготовки предложения');
  }

  return {
    type,
    typeLabel: typeLabelMap[type] || type,
    lines: lines.length ? lines : ['Нет деталей в сохранённой версии'],
  };
}

function renderObjectQualificationField(field, value, scope) {
  const attr = scope === 'common' ? 'data-object-common-field' : 'data-object-problem-field';
  const escapedValue = escapeAttr(value || '');
  if (field.type === 'select') {
    return `
      <label>${field.label}
        <select ${attr}="${field.id}">
          ${(field.options || []).map(([optionValue, optionLabel]) => `
            <option value="${optionValue}" ${String(value || '') === String(optionValue) ? 'selected' : ''}>${optionLabel}</option>
          `).join('')}
        </select>
      </label>
    `;
  }
  if (field.type === 'textarea') {
    return `
      <label>${field.label}
        <textarea ${attr}="${field.id}" rows="2" placeholder="${escapeAttr(field.placeholder || '')}">${escapeHtml(value || '')}</textarea>
      </label>
    `;
  }
  return `
    <label>${field.label}
      <input ${attr}="${field.id}" value="${escapedValue}" placeholder="${escapeAttr(field.placeholder || '')}">
    </label>
  `;
}

function collectObjectQualificationDraftFromDom() {
  const problemDetails = {};
  const commonDetails = {};
  document.querySelectorAll('[data-object-problem-field]').forEach(field => {
    const key = field.dataset.objectProblemField;
    const value = field.value?.trim?.() ?? String(field.value || '').trim();
    if (key) problemDetails[key] = value;
  });
  document.querySelectorAll('[data-object-common-field]').forEach(field => {
    const key = field.dataset.objectCommonField;
    const value = field.value?.trim?.() ?? String(field.value || '').trim();
    if (key) commonDetails[key] = value;
  });
  return { problemDetails, commonDetails };
}

function renderObjectQualificationDynamic(problemType, problemDetails = {}, commonDetails = {}) {
  const config = OBJECT_QUALIFICATION_PROBLEM_FIELDS[problemType];
  if (!config) {
    return `
      <section class="qualification-section">
        <div class="qualification-title">Выберите проблему, чтобы CRM показала точные вопросы для диагностики.</div>
      </section>
      <section class="qualification-section">
        <div class="qualification-title">Обязательные вопросы для каждого объекта</div>
        <div class="qualification-volume-grid">
          ${OBJECT_QUALIFICATION_COMMON_FIELDS.map(field => renderObjectQualificationField(field, commonDetails[field.id], 'common')).join('')}
        </div>
      </section>
    `;
  }

  return `
    <section class="qualification-section">
      <div class="qualification-title">${config.title}</div>
      <div class="qualification-volume-grid">
        ${config.fields.map(field => renderObjectQualificationField(field, problemDetails[field.id], 'problem')).join('')}
      </div>
    </section>

    <section class="qualification-section">
      <div class="qualification-title">Обязательные вопросы для каждого объекта</div>
      <div class="qualification-volume-grid">
        ${OBJECT_QUALIFICATION_COMMON_FIELDS.map(field => renderObjectQualificationField(field, commonDetails[field.id], 'common')).join('')}
      </div>
    </section>
  `;
}

function updateObjectQualificationQuestionnaire() {
  const problemSelect = document.getElementById('qualification-problem-type');
  const container = document.getElementById('qualification-object-dynamic-fields');
  if (!problemSelect || !container) return;
  const draft = collectObjectQualificationDraftFromDom();
  container.innerHTML = renderObjectQualificationDynamic(problemSelect.value, draft.problemDetails, draft.commonDetails);
}

function leadQualificationProgress(lead = {}) {
  const qualification = leadQualificationData(lead);
  if (qualification.manual_complete === true) return 100;
  if (Number.isFinite(Number(qualification.completion_percent))) {
    return Math.max(0, Math.min(100, Number(qualification.completion_percent)));
  }

  const type = leadQualificationType(lead, qualification);
  let sections = [];
  if (type === 'concrete_object') {
    const dynamicProblemFields = OBJECT_QUALIFICATION_PROBLEM_FIELDS[qualification.problem_type]?.fields || [];
    const problemDetails = qualification.problem_details || {};
    const commonDetails = qualification.common_details || {};
    if (qualification.problem_type || Object.keys(problemDetails).length || Object.keys(commonDetails).length) {
      sections = [
        Boolean(qualification.problem_type || (Array.isArray(qualification.problems) && qualification.problems.length)),
        dynamicProblemFields.some(field => Boolean(problemDetails[field.id])),
        OBJECT_QUALIFICATION_COMMON_FIELDS.some(field => Boolean(commonDetails[field.id])),
        Boolean(commonDetails.repair_timing || qualification.timing),
        Boolean(commonDetails.executor || qualification.executor),
      ];
      return sections.filter(Boolean).length * 20;
    }
    sections = [
      Array.isArray(qualification.problems) && qualification.problems.length > 0,
      Boolean(qualification.object_type),
      Boolean(qualification.volumes && Object.values(qualification.volumes).some(Boolean)),
      Boolean(qualification.timing),
      Boolean(qualification.executor),
    ];
  } else if (type === 'distributor') {
    sections = [
      Boolean(qualification.region),
      Boolean(qualification.current_products),
      Boolean(qualification.warehouse_team),
      Boolean(qualification.sales_volume),
      Boolean(qualification.partnership_interest),
    ];
  } else if (type === 'tire_customer') {
    sections = [
      Boolean(qualification.vehicle),
      Boolean(qualification.tire_size),
      Boolean(qualification.tire_type),
      Boolean(qualification.preferred_brand),
      Boolean(qualification.quantity_and_rims),
    ];
  } else {
    sections = [
      Boolean(qualification.materials_interest),
      Boolean(qualification.application_type),
      Boolean(qualification.quantities),
      Boolean(qualification.delivery_timing),
      Boolean(qualification.has_specification),
    ];
  }
  return sections.filter(Boolean).length * 20;
}

function leadQualificationType(lead = {}, qualification = leadQualificationData(lead)) {
  if (qualification.client_type) return qualification.client_type;
  if (isTireLead(lead)) return 'tire_customer';
  if (isDistributorLead(lead)) return 'distributor';
  if (qualification.problems?.length || qualification.object_type || isSpecificObjectLead(lead)) return 'concrete_object';
  return 'construction_company';
}

function isSpecificObjectLead(lead = {}) {
  const text = `${lead.area_label || ''} ${lead.notes || ''} ${lead.form_summary || ''} ${lead.interest_products || ''}`.toLowerCase();
  return /конкретен\s+обект/.test(text);
}

function isServicesLead(lead = {}) {
  const sheet = String(lead.google_sheet_name || lead.source_sheet || '').trim().toLowerCase();
  if (/материал|material/.test(sheet)) return false;
  if (/услуг|service/.test(sheet)) return true;

  const leadType = String(lead.lead_type || '').toLowerCase();
  if (/материал|material/.test(leadType)) return false;
  if (/услуг|service/.test(leadType)) return true;
  return false;
}

function leadApplicationForm(lead = {}, forcedType = '') {
  const type = forcedType || (
    isDistributorLead(lead)
      ? 'distributor'
      : isServicesLead(lead)
        ? 'services'
        : 'materials'
  );
  if (type === 'distributor') {
    return {
      type,
      label: 'Заявка за дистрибуция / партньорство',
      url: DISTRIBUTOR_FORM_URL,
      cta: 'За да подготвим условията за дистрибуция / партньорство, моля попълнете кратката форма:',
    };
  }
  if (type === 'object' || type === 'materials') {
    return {
      type: 'materials',
      label: 'Заявка за доставка на материали',
      url: MATERIALS_OBJECT_FORM_URL,
      cta: 'След като разгледате каталога / презентацията, моля попълнете кратката форма. По данните от нея ще подготвим конкретно търговско предложение:',
    };
  }
  if (type === 'services') {
    return {
      type,
      label: 'Заявка за услуги',
      url: SERVICES_FORM_URL,
      cta: 'За да уточним нужната услуга и да подготвим предложение, моля попълнете кратката форма:',
    };
  }
  return null;
}

function leadApplicationFormLines(lead = {}, forcedType = '') {
  const form = leadApplicationForm(lead, forcedType);
  return form ? ['', form.cta, form.url] : [];
}

function vladislavSignatureLines() {
  return [
    '',
    'С уважение,',
    'Владислав',
    'Търговски директор, BODEX Bulgaria',
    BODEX_WEBSITE_URL,
  ];
}

async function syncFacebookLeadsFromLeadsPage() {
  const el = document.getElementById('leads-sync-result');
  const tireMode = currentPage === 'tires' || currentPage === 'tire-base';
  el.className = 'sync-result show';
  el.textContent = tireMode ? 'Syncing Facebook Lead Forms...' : 'Синхронизирую Facebook Lead Forms...';
  try {
    const result = await api('/api/facebook/sync/leads', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = tireMode
      ? `✅ Tire leads: ${result.tire_leads_checked || 0} checked, ${result.new_tire_leads || 0} new added. Campaigns refreshed: ${result.campaigns_synced || 0}.`
      : `✅ FB лиды: проверено ${result.leads_checked || 0}, новых добавлено ${result.new_leads || 0}, существующих пропущено ${result.skipped_existing || 0}.`;
    setTimeout(() => renderLeads(
      document.getElementById('main'),
      currentPage === 'tires' ? { view: 'tires' } : { view: 'all' }
    ), 900);
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = tireMode ? `❌ Facebook sync failed: ${err.message}` : '❌ ' + err.message;
  }
}

async function openQuickCommentModal(id, encodedLatest = '') {
  const latest = decodeURIComponent(encodedLatest || '');
  const tireMode = currentPage === 'tires' || currentPage === 'tire-base';
  openModal(tireMode ? 'Lead comment' : 'Комментарий к лиду', `
    ${latest ? `<div style="font-size:12px;color:#8dd3ff;margin-bottom:10px;">${tireMode ? 'Latest' : 'Последний'}: ${escapeHtml(latest)}</div>` : ''}
    <div class="form-group full">
      <label>${tireMode ? 'Comment after the call' : 'Комментарий после звонка'}</label>
      <textarea id="quick-lead-comment" rows="4" placeholder="${tireMode ? 'Write a short call result...' : 'Напишите короткий результат звонка...'}"></textarea>
    </div>
    <div class="card-title" style="font-size:12px;margin:12px 0 8px;">🕘 ${tireMode ? 'Comment history' : 'История комментариев'}</div>
    <div id="quick-comment-history" class="quick-comment-history">
      <div class="worker-activity-empty">${tireMode ? 'Loading comment history...' : 'Загружаю историю комментариев...'}</div>
    </div>
    <div id="quick-comment-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">${tireMode ? 'Cancel' : 'Отмена'}</button>
      <button class="btn btn-primary" onclick="saveQuickLeadComment(${id})">${tireMode ? 'Save' : 'Сохранить'}</button>
    </div>
  `);
  setTimeout(() => document.getElementById('quick-lead-comment')?.focus(), 50);
  await loadQuickCommentHistory(id);
}

async function loadQuickCommentHistory(id) {
  const wrap = document.getElementById('quick-comment-history');
  const tireMode = currentPage === 'tires' || currentPage === 'tire-base';
  if (!wrap) return;
  try {
    const data = await api(`/api/leads/${id}`);
    const comments = (data.activities || []).filter(a => a.action === 'comment');
    wrap.innerHTML = comments.length
      ? comments.map(item => `
        <div class="quick-comment-item">
          <div class="quick-comment-item-head">
            <span class="fresh-comment-pill">${item.performed_by || 'manager'}</span>
            <span>${new Date(item.created_at).toLocaleString(tireMode ? 'en-GB' : 'bg-BG')}</span>
          </div>
          <div class="quick-comment-item-body">${escapeHtml(item.description || '')}</div>
        </div>
      `).join('')
      : `<div class="worker-activity-empty">${tireMode ? 'No comments yet.' : 'Комментариев пока нет.'}</div>`;
  } catch (err) {
    wrap.innerHTML = `<div class="worker-activity-empty">${tireMode ? 'Could not load history' : 'Не удалось загрузить историю'}: ${escapeHtml(err.message || 'unknown error')}</div>`;
  }
}

async function saveQuickLeadComment(id) {
  const tireMode = currentPage === 'tires' || currentPage === 'tire-base';
  const input = document.getElementById('quick-lead-comment');
  const result = document.getElementById('quick-comment-result');
  const comment = input?.value.trim();
  if (!comment) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = tireMode ? '❌ Enter a comment.' : '❌ Напишите комментарий.';
    } else {
      input?.focus();
    }
    return;
  }

  if (result) {
    result.className = 'sync-result show';
    result.textContent = tireMode ? 'Saving...' : 'Сохраняю...';
  }

  try {
    await api(`/api/leads/${id}/comments`, {
      method: 'POST',
      body: {
        comment,
        performed_by: currentRole === 'admin' ? 'admin' : 'manager',
      },
    });
    input.value = '';
    await loadQuickCommentHistory(id);
    await renderLeads(document.getElementById('main'), currentLeadFilters);
    if (result) {
      result.className = 'sync-result show ok';
      result.textContent = tireMode ? '✅ Comment saved.' : '✅ Комментарий сохранён.';
    }
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ ' + err.message;
    } else {
      alert('Грешка: ' + err.message);
    }
  }
}

async function openLeadQualificationModal(id) {
  try {
    const data = await api(`/api/leads/${id}`);
    const lead = data.lead || {};
    const qualification = leadQualificationData(lead);
    const clientType = leadQualificationType(lead, qualification);
    const tireMode = isTireLead(lead);
    const selectedProblem = qualification.problem_type || qualification.problems?.[0] || '';
    const problemDetails = qualification.problem_details || {};
    const commonDetails = qualification.common_details || {};

    openModal(`${tireMode ? 'Обязательные вопросы по шинам' : 'Обязательные вопросы по объекту'} · ${lead.company_name || lead.contact_name || ('Лид #' + id)}`, `
      <div class="qualification-intro">
        ${tireMode
          ? 'Менеджер заполняет эту форму во время разговора с клиентом. Ответы используются для подбора шин и подготовки предложения.'
          : 'Менеджер заполняет диагностический бриф во время разговора. CRM покажет только те вопросы, которые нужны именно под выбранную проблему.'}
      </div>
      ${renderFacebookLeadBrief(lead, 'ru')}
      <form id="lead-qualification-form" onsubmit="saveLeadQualification(event, ${id})">
        <section class="qualification-section qualification-type-section">
          <div class="qualification-title">${tireMode ? 'Тип клиента *' : 'Тип клиента *'}</div>
          <select id="qualification-client-type" required onchange="toggleQualificationType(this.value)">
            ${tireMode ? `
            <option value="tire_customer" selected>Клиент по шинам и дискам</option>
            ` : `
            <option value="concrete_object" ${clientType === 'concrete_object' ? 'selected' : ''}>Клиент с конкретным объектом</option>
            <option value="construction_company" ${clientType === 'construction_company' ? 'selected' : ''}>Строительная фирма</option>
            <option value="distributor" ${clientType === 'distributor' ? 'selected' : ''}>Дистрибьютор / партнёр</option>
            `}
          </select>
        </section>

        <div class="qualification-flow" data-qualification-type="concrete_object" ${clientType === 'concrete_object' ? '' : 'hidden'}>
        <section class="qualification-section">
          <div class="qualification-title"><span>1</span> Какая основная проблема на объекте? *</div>
          <select id="qualification-problem-type" onchange="updateObjectQualificationQuestionnaire()">
            <option value="">Выберите проблему</option>
            ${OBJECT_QUALIFICATION_PROBLEM_OPTIONS.map(([value, label]) => `
              <option value="${value}" ${selectedProblem === value ? 'selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </section>

        <section class="qualification-section">
          <div id="qualification-object-dynamic-fields">
            ${renderObjectQualificationDynamic(selectedProblem, problemDetails, commonDetails)}
          </div>
        </section>

        <section class="qualification-section">
          <div class="qualification-title">Дополнительные детали по объекту</div>
          <textarea id="qualification-object-notes" rows="3" placeholder="Адрес объекта, короткое техническое резюме, что обещал прислать клиент, кто принимает решение...">${escapeHtml(qualification.notes || '')}</textarea>
        </section>
        </div>

        <div class="qualification-flow" data-qualification-type="construction_company" ${clientType === 'construction_company' ? '' : 'hidden'}>
          ${qualificationTextField(1, 'Какви материали Ви интересуват?', 'qualification-materials-interest', qualification.materials_interest, 'Инжекционни смоли, хидроизолационни системи, ремонтни материали...')}
          ${qualificationTextField(2, 'За какъв тип обект или приложение ще бъдат използвани материалите?', 'qualification-application-type', qualification.application_type)}
          ${qualificationTextField(3, 'Какви са ориентировъчните количества?', 'qualification-quantities', qualification.quantities, 'Количество, мерна единица, приблизителен обем')}
          <section class="qualification-section">
            <div class="qualification-title"><span>4</span> Кога Ви е необходима доставката? *</div>
            <select id="qualification-delivery-timing">
              <option value="">Изберете срок</option>
              ${[
                ['urgent', 'Спешно'],
                ['1_2_weeks', 'До 1–2 седмици'],
                ['within_month', 'До 1 месец'],
                ['later', 'На по-късен етап'],
              ].map(([value, label]) => `<option value="${value}" ${qualification.delivery_timing === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </section>
          <section class="qualification-section">
            <div class="qualification-title"><span>5</span> Разполагате ли с количествена сметка или техническа спецификация? *</div>
            <select id="qualification-has-specification">
              <option value="">Изберете отговор</option>
              <option value="yes" ${qualification.has_specification === 'yes' ? 'selected' : ''}>Да, ще я изпратим</option>
              <option value="no" ${qualification.has_specification === 'no' ? 'selected' : ''}>Не</option>
              <option value="preparing" ${qualification.has_specification === 'preparing' ? 'selected' : ''}>Подготвя се</option>
            </select>
            <textarea id="qualification-construction-notes" rows="3" placeholder="Допълнителни технически детайли...">${escapeHtml(qualification.notes || '')}</textarea>
          </section>
        </div>

        <div class="qualification-flow" data-qualification-type="distributor" ${clientType === 'distributor' ? '' : 'hidden'}>
          ${qualificationTextField(1, 'В кой регион или град развивате дейността си?', 'qualification-region', qualification.region || lead.city)}
          ${qualificationTextField(2, 'Какви продукти или марки предлагате в момента?', 'qualification-current-products', qualification.current_products)}
          ${qualificationTextField(3, 'Разполагате ли със собствен склад и търговски екип?', 'qualification-warehouse-team', qualification.warehouse_team, 'Опишете складовата база и търговския екип')}
          ${qualificationTextField(4, 'Какви са приблизителните месечни или годишни обеми на продажби?', 'qualification-sales-volume', qualification.sales_volume)}
          <section class="qualification-section">
            <div class="qualification-title"><span>5</span> Интересувате ли се от дългосрочно партньорство и дилърски условия? *</div>
            <select id="qualification-partnership-interest">
              <option value="">Изберете отговор</option>
              <option value="yes" ${qualification.partnership_interest === 'yes' ? 'selected' : ''}>Да</option>
              <option value="discuss" ${qualification.partnership_interest === 'discuss' ? 'selected' : ''}>Желаем да обсъдим условията</option>
              <option value="no" ${qualification.partnership_interest === 'no' ? 'selected' : ''}>Не на този етап</option>
            </select>
            <textarea id="qualification-distributor-notes" rows="3" placeholder="Допълнителна информация за партньора...">${escapeHtml(qualification.notes || '')}</textarea>
          </section>
        </div>

        <div class="qualification-flow" data-qualification-type="tire_customer" ${clientType === 'tire_customer' ? '' : 'hidden'}>
          ${qualificationTextField(1, 'Для какого автомобиля нужны шины?', 'qualification-vehicle', qualification.vehicle, 'Марка, модель и год выпуска')}
          ${qualificationTextField(2, 'Какой размер шин нужен?', 'qualification-tire-size', qualification.tire_size, 'Например: 225/45 R17')}
          ${qualificationTextField(3, 'Какой тип шин нужен?', 'qualification-tire-type', qualification.tire_type, 'Летние, зимние или всесезонные; для легкового автомобиля, SUV или фургона')}
          ${qualificationTextField(4, 'Какой бренд предпочитает клиент?', 'qualification-preferred-brand', qualification.preferred_brand, 'Michelin, Dunlop, Goodyear или другой бренд')}
          ${qualificationTextField(5, 'Сколько шин нужно и нужны ли диски?', 'qualification-quantity-rims', qualification.quantity_and_rims, 'Количество шин, а также размер и тип дисков')}
          <section class="qualification-section">
            <div class="qualification-title">Дополнительные детали</div>
            <textarea id="qualification-tire-notes" rows="3" placeholder="Когда нужны шины, бюджет, доставка, монтаж и другие пожелания клиента...">${escapeHtml(qualification.notes || '')}</textarea>
          </section>
        </div>

        <div id="qualification-result" class="sync-result"></div>
        <label class="qualification-manual-complete">
          <input id="qualification-manual-complete" type="checkbox" ${qualification.manual_complete ? 'checked' : ''}>
          <span>
            <strong>${tireMode ? 'Информации достаточно для подготовки предложения' : 'Информацията е достатъчна за подготовка на оферта'}</strong>
            <small>${tireMode ? 'Отметьте, если все необходимые детали уже получены по телефону, Viber или e-mail.' : 'Отбележете, ако останалите детайли са получени по телефон, Viber или e-mail.'}</small>
          </span>
        </label>
        <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">${tireMode ? 'Отмена' : 'Отказ'}</button>
          <button type="button" class="btn btn-secondary" onclick="downloadLeadQualificationViberQuestions(${id})">Скачать вопросы для Viber</button>
          <button type="button" class="btn btn-secondary" onclick="downloadLeadQualificationTxt(${id})">${tireMode ? 'Загрузить ответы' : 'Скачать ответы'}</button>
          <button type="submit" class="btn btn-primary">${tireMode ? 'Сохранить ответы' : 'Запази отговорите'}</button>
        </div>
      </form>
    `);
  } catch (err) {
    alert(((currentPage === 'tires' || currentPage === 'tire-base') ? 'Ошибка: ' : 'Грешка: ') + err.message);
  }
}

function renderFacebookLeadBrief(lead = {}, locale = 'bg') {
  if (lead.source !== 'facebook') return '';
  const english = locale === 'en';
  const russian = locale === 'ru';
  const answerRows = String(lead.notes || '')
    .split(/\n|\s+\|\s+/)
    .map(value => value.trim())
    .filter(value => value && !/^google sheets/i.test(value))
    .slice(0, 6);
  const items = [
    lead.company_type ? [english ? 'Company type' : russian ? 'Тип клиента' : 'Тип компания', lead.company_type] : null,
    lead.interest_products ? [english ? 'Interest' : russian ? 'Интерес клиента' : 'Интерес', lead.interest_products] : null,
    lead.fb_campaign_name ? [english ? 'Campaign' : russian ? 'Рекламная кампания' : 'Кампания', lead.fb_campaign_name] : null,
    ...answerRows.map(row => {
      const separator = row.indexOf(':');
      return separator > 0
        ? [row.slice(0, separator).trim(), row.slice(separator + 1).trim()]
        : [english ? 'Answer' : russian ? 'Ответ клиента' : 'Отговор', row];
    }),
  ].filter(Boolean);

  if (!items.length) return '';
  return `
    <section class="facebook-lead-brief">
      <div class="facebook-lead-brief-title">${english ? 'Facebook lead answers' : russian ? 'Ответы клиента из Facebook' : 'Отговори на клиента от Facebook'}</div>
      <div class="facebook-lead-brief-grid">
        ${items.map(([label, value]) => `
          <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
        `).join('')}
      </div>
    </section>
  `;
}

function qualificationTextField(number, label, id, value = '', placeholder = '') {
  return `
    <section class="qualification-section">
      <div class="qualification-title"><span>${number}</span> ${label} *</div>
      <textarea id="${id}" rows="2" placeholder="${escapeAttr(placeholder)}">${escapeHtml(value || '')}</textarea>
    </section>
  `;
}

function toggleQualificationType(type) {
  document.querySelectorAll('[data-qualification-type]').forEach(section => {
    section.hidden = section.dataset.qualificationType !== type;
  });
  if (type === 'concrete_object') {
    updateObjectQualificationQuestionnaire();
  }
}

function collectLeadQualificationFormData() {
  const clientType = document.getElementById('qualification-client-type')?.value;
  let qualificationData;

  if (clientType === 'concrete_object') {
    const selectedProblem = document.getElementById('qualification-problem-type')?.value || '';
    const { problemDetails, commonDetails } = collectObjectQualificationDraftFromDom();
    const dimensionValues = [commonDetails.zone_length, commonDetails.zone_width, commonDetails.zone_depth].filter(Boolean);
    qualificationData = {
      client_type: clientType,
      manual_complete: document.getElementById('qualification-manual-complete')?.checked || false,
      problems: selectedProblem ? [selectedProblem] : [],
      problem_type: selectedProblem,
      problem_details: problemDetails,
      common_details: commonDetails,
      object_type: commonDetails.construction_type || '',
      volumes: {
        surface_area: dimensionValues.join(' x '),
      },
      timing: commonDetails.repair_timing || '',
      executor: commonDetails.executor || '',
      notes: document.getElementById('qualification-object-notes')?.value.trim(),
    };
  } else if (clientType === 'construction_company') {
    qualificationData = {
      client_type: clientType,
      manual_complete: document.getElementById('qualification-manual-complete')?.checked || false,
      materials_interest: document.getElementById('qualification-materials-interest')?.value.trim(),
      application_type: document.getElementById('qualification-application-type')?.value.trim(),
      quantities: document.getElementById('qualification-quantities')?.value.trim(),
      delivery_timing: document.getElementById('qualification-delivery-timing')?.value,
      has_specification: document.getElementById('qualification-has-specification')?.value,
      notes: document.getElementById('qualification-construction-notes')?.value.trim(),
    };
  } else if (clientType === 'distributor') {
    qualificationData = {
      client_type: 'distributor',
      manual_complete: document.getElementById('qualification-manual-complete')?.checked || false,
      region: document.getElementById('qualification-region')?.value.trim(),
      current_products: document.getElementById('qualification-current-products')?.value.trim(),
      warehouse_team: document.getElementById('qualification-warehouse-team')?.value.trim(),
      sales_volume: document.getElementById('qualification-sales-volume')?.value.trim(),
      partnership_interest: document.getElementById('qualification-partnership-interest')?.value,
      notes: document.getElementById('qualification-distributor-notes')?.value.trim(),
    };
  } else {
    qualificationData = {
      client_type: 'tire_customer',
      manual_complete: document.getElementById('qualification-manual-complete')?.checked || false,
      vehicle: document.getElementById('qualification-vehicle')?.value.trim(),
      tire_size: document.getElementById('qualification-tire-size')?.value.trim(),
      tire_type: document.getElementById('qualification-tire-type')?.value.trim(),
      preferred_brand: document.getElementById('qualification-preferred-brand')?.value.trim(),
      quantity_and_rims: document.getElementById('qualification-quantity-rims')?.value.trim(),
      notes: document.getElementById('qualification-tire-notes')?.value.trim(),
    };
  }

  return qualificationData;
}

function formatLeadQualificationTxt(lead, qualificationData) {
  const clientType = qualificationData.client_type || leadQualificationType(lead, qualificationData);
  const lines = [
    `Лид: ${lead.company_name || lead.contact_name || `#${lead.id}`}`,
    `Контакт: ${lead.contact_name || '-'}`,
    `Телефон: ${lead.phone || '-'}`,
    `Email: ${lead.email || '-'}`,
    `Город: ${lead.city || '-'}`,
    `Тип клиента: ${lead.company_type || '-'}`,
    `Кампания: ${lead.fb_campaign_name || '-'}`,
    ''
  ];

  if (clientType === 'tire_customer') {
    lines.push(
      `1. Для какого автомобиля нужны шины: ${qualificationData.vehicle || '-'}`,
      `2. Какой размер шин нужен: ${qualificationData.tire_size || '-'}`,
      `3. Какой тип шин нужен: ${qualificationData.tire_type || '-'}`,
      `4. Какой бренд предпочитает клиент: ${qualificationData.preferred_brand || '-'}`,
      `5. Сколько шин нужно и нужны ли диски: ${qualificationData.quantity_and_rims || '-'}`,
      `Дополнительные детали: ${qualificationData.notes || '-'}`,
      `Информации достаточно для предложения: ${qualificationData.manual_complete ? 'Да' : 'Нет'}`
    );
  } else if (clientType === 'concrete_object') {
    const problemType = qualificationData.problem_type || qualificationData.problems?.[0] || '';
    const problemDetails = qualificationData.problem_details || {};
    const commonDetails = qualificationData.common_details || {};
    lines.push(
      `1. Проблема на объекте: ${objectQualificationLabel(problemType) || '-'}`,
      ''
    );
    const problemConfig = OBJECT_QUALIFICATION_PROBLEM_FIELDS[problemType];
    if (problemConfig?.fields?.length) {
      lines.push('2. Ответы по выбранной проблеме:');
      problemConfig.fields.forEach(field => {
        lines.push(`   - ${field.label}: ${objectQualificationDisplayValue(field.id, problemDetails[field.id])}`);
      });
      lines.push('');
    }
    lines.push('3. Общие обязательные вопросы:');
    OBJECT_QUALIFICATION_COMMON_FIELDS.forEach(field => {
      lines.push(`   - ${field.label}: ${objectQualificationDisplayValue(field.id, commonDetails[field.id])}`);
    });
    lines.push(
      '',
      `Дополнительные детали: ${qualificationData.notes || '-'}`,
      `Информации достаточно для предложения: ${qualificationData.manual_complete ? 'Да' : 'Нет'}`
    );
  } else if (clientType === 'construction_company') {
    lines.push(
      `1. Какие материалы интересуют: ${qualificationData.materials_interest || '-'}`,
      `2. Для какого объекта / применения: ${qualificationData.application_type || '-'}`,
      `3. Ориентировочные количества: ${qualificationData.quantities || '-'}`,
      `4. Когда нужна доставка: ${qualificationData.delivery_timing || '-'}`,
      `5. Есть ли спецификация / смета: ${qualificationData.has_specification || '-'}`,
      `Дополнительные детали: ${qualificationData.notes || '-'}`,
      `Информации достаточно для предложения: ${qualificationData.manual_complete ? 'Да' : 'Нет'}`
    );
  } else if (clientType === 'distributor') {
    lines.push(
      `1. Регион / город: ${qualificationData.region || '-'}`,
      `2. Какие продукты / бренды уже продают: ${qualificationData.current_products || '-'}`,
      `3. Склад и торговая команда: ${qualificationData.warehouse_team || '-'}`,
      `4. Месячные / годовые объёмы: ${qualificationData.sales_volume || '-'}`,
      `5. Интерес к партнёрству: ${qualificationData.partnership_interest || '-'}`,
      `Дополнительные детали: ${qualificationData.notes || '-'}`,
      `Информации достаточно для предложения: ${qualificationData.manual_complete ? 'Да' : 'Нет'}`
    );
  } else {
    lines.push(`Данные формы относятся к типу: ${clientType || '-'}`);
    lines.push(JSON.stringify(qualificationData, null, 2));
  }

  return lines.join('\n');
}

function formatLeadQualificationQuestionsForViber(lead, qualificationData) {
  const clientType = qualificationData.client_type || leadQualificationType(lead, qualificationData);
  const bgProblemLabels = {
    active_leaks: 'Активни течове',
    wall_moisture: 'Влажност по стените',
    cracks: 'Пукнатини',
    construction_joints: 'Вода през работни фуги',
    utility_entries: 'Вода около тръби или кабели',
    voids_behind_structure: 'Кухини зад конструкцията',
    structural_strengthening: 'Необходимост от укрепване',
    other: 'Друг проблем',
  };
  const bgQuestionLabels = {
    leak_location: 'Къде точно тече?',
    leak_when: 'Кога се появява течът?',
    water_behavior: 'Тече ли вода или е само влажно?',
    water_flow: 'Какъв е приблизителният дебит на водата?',
    leak_zone_length: 'Каква е дължината на зоната на теча?',
    photo_video: 'Имате ли снимки или видео?',
    moisture_pattern: 'Влагата тръгва ли отдолу нагоре или е по цялата стена?',
    wet_length: 'Каква е дължината на влажната зона?',
    wet_height: 'Каква е височината на влажната зона?',
    white_salts: 'Има ли бял налеп (соли)?',
    mold: 'Има ли мухъл?',
    wall_material: 'Стената бетонна, тухлена или каменна ли е?',
    inside_or_outside: 'Проблемът отвътре ли е или отвън?',
    crack_location: 'Къде се намират пукнатините?',
    crack_length: 'Каква е дължината на пукнатината?',
    crack_width: 'Каква е ширината на пукнатината?',
    crack_water: 'Пукнатините сухи ли са или през тях минава вода?',
    crack_growing: 'Пукнатините увеличават ли се?',
    crack_count: 'Колко пукнатини има приблизително?',
    crack_photos: 'Имате ли снимки?',
    joint_location: 'Къде се намира фугата?',
    joint_length: 'Каква е дължината на фугата?',
    joint_water_when: 'Водата минава ли постоянно или само при дъжд?',
    joint_pressure: 'Има ли водно налягане?',
    joint_repaired_before: 'Правен ли е ремонт преди?',
    entry_type: 'Това тръба ли е или кабел?',
    entry_diameter: 'Какъв е диаметърът на прохода?',
    entry_leak_path: 'Откъде точно минава водата?',
    entry_count: 'Колко прохода има?',
    entry_constant_leak: 'Има ли постоянен теч?',
    void_location: 'Къде се намират кухините?',
    void_reason: 'Защо смятате, че има кухини?',
    void_settlement: 'Има ли слягане?',
    void_cracks: 'Има ли пукнатини?',
    void_volume: 'Какъв е ориентировъчният обем?',
    void_geology: 'Има ли геология?',
    strengthening_target: 'Какво трябва да се укрепи?',
    strengthening_reason: 'Защо е необходимо укрепване?',
    engineer_report: 'Има ли инженерно становище?',
    strengthening_settlement: 'Има ли слягане?',
    strengthening_area: 'Какъв е размерът на участъка?',
    other_problem_description: 'Опишете проблема.',
    other_problem_location: 'Къде се намира проблемът?',
    other_problem_dimensions: 'Какви са размерите на участъка?',
    other_problem_started: 'Кога се появи проблемът?',
    other_problem_now: 'Какво се случва в момента?',
    other_problem_photos: 'Имате ли снимки?',
    construction_type: 'Какъв е типът на конструкцията?',
    construction_material: 'От какъв материал е изпълнена конструкцията?',
    zone_length: 'Каква е дължината на проблемната зона?',
    zone_width: 'Каква е ширината на проблемната зона?',
    zone_depth: 'Каква е дълбочината на проблемната зона (ако е приложимо)?',
    external_access: 'Има ли достъп отвън?',
    internal_access: 'Има ли достъп отвътре?',
    repair_timing: 'Кога трябва да се извърши ремонтът?',
    has_photos: 'Имате ли снимки?',
    has_drawings: 'Имате ли чертежи на обекта?',
    has_video: 'Имате ли видео?',
    executor: 'Кой ще извършва работата?',
  };
  const lines = [
    'Здравейте,',
    '',
  ];

  if (clientType === 'concrete_object') {
    const problemType = qualificationData.problem_type || qualificationData.problems?.[0] || '';
    const problemConfig = OBJECT_QUALIFICATION_PROBLEM_FIELDS[problemType];
    if (!problemConfig) {
      throw new Error('Първо изберете проблема по обекта, за да изтеглите въпросите за Viber.');
    }
    lines.push(
      'За да подготвим точно решение и търговско предложение за Вашия обект, моля отговорете на няколко въпроса:',
      '',
      `Проблем: ${bgProblemLabels[problemType] || problemType}`,
      ''
    );
    problemConfig.fields.forEach((field, index) => {
      lines.push(`${index + 1}. ${bgQuestionLabels[field.id] || field.label}`);
    });
    lines.push('');
    lines.push('Също така, моля уточнете и общата информация за обекта:');
    OBJECT_QUALIFICATION_COMMON_FIELDS.forEach((field, index) => {
      lines.push(`${index + 1}. ${bgQuestionLabels[field.id] || field.label}`);
    });
    lines.push('');
    lines.push('Ако разполагате със снимки, видео или чертежи на обекта, моля изпратете и тях.');
  } else if (clientType === 'construction_company') {
    lines.push(
      'За да подготвим точно търговско предложение за материали, моля отговорете на няколко въпроса:',
      '',
      '1. Какви материали Ви интересуват?',
      '2. За какъв обект или приложение ще се използват материалите?',
      '3. Какви ориентировъчни количества са Ви необходими?',
      '4. Кога Ви е необходима доставката?',
      '5. Разполагате ли със сметка, спецификация или количествена ведомост?',
      '',
      'Ако разполагате с документи или снимки, моля изпратете и тях.'
    );
  } else if (clientType === 'distributor') {
    lines.push(
      'За да подготвим предложение за партньорство, моля отговорете на няколко въпроса:',
      '',
      '1. В кой регион или град развивате дейност?',
      '2. Какви продукти или марки предлагате в момента?',
      '3. Разполагате ли със собствен склад и търговски екип?',
      '4. Какви са ориентировъчните Ви обеми на продажби в този сегмент?',
      '5. Интересувате ли се от дългосрочно партньорство и дилърски условия с BODEX Bulgaria?'
    );
  } else if (clientType === 'tire_customer') {
    lines.push(
      'За да подготвим точна оферта за гуми и джанти, моля отговорете на няколко въпроса:',
      '',
      '1. За какъв автомобил са нужни гумите?',
      '2. Какъв размер гуми търсите?',
      '3. Какъв тип гуми Ви трябват?',
      '4. Коя марка предпочитате?',
      '5. Колко гуми са Ви нужни и необходими ли са джанти?'
    );
  } else {
    lines.push('Моля, отговорете на въпросите, за да можем да подготвим предложение.');
  }

  lines.push(
    '',
    'След това ще подготвим предложение за Вас.',
    '',
    'С уважение,',
    'BODEX Bulgaria',
    BODEX_WEBSITE_URL
  );

  return lines.join('\n');
}

async function downloadLeadQualificationTxt(id) {
  const result = document.getElementById('qualification-result');
  try {
    const data = await api(`/api/leads/${id}`);
    const lead = data.lead || {};
    let qualificationData = {};
    const form = document.getElementById('lead-qualification-form');
    if (form) {
      qualificationData = collectLeadQualificationFormData();
    } else {
      qualificationData = leadQualificationData(lead);
    }
    const content = formatLeadQualificationTxt(lead, qualificationData);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-${id}-answers.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (result) {
      result.className = 'sync-result show ok';
      result.textContent = 'TXT с ответами загружен.';
    }
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = 'Ошибка загрузки TXT: ' + err.message;
    }
  }
}

async function downloadLeadQualificationViberQuestions(id) {
  const result = document.getElementById('qualification-result');
  try {
    const data = await api(`/api/leads/${id}`);
    const lead = data.lead || {};
    const form = document.getElementById('lead-qualification-form');
    const qualificationData = form ? collectLeadQualificationFormData() : leadQualificationData(lead);
    const content = formatLeadQualificationQuestionsForViber(lead, qualificationData);
    downloadTextFile(`lead-${id}-viber-questions.txt`, content, 'text/plain;charset=utf-8');
    if (result) {
      result.className = 'sync-result show ok';
      result.textContent = 'TXT с вопросами для Viber загружен.';
    }
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = 'Ошибка загрузки вопросов: ' + err.message;
    }
  }
}

async function saveLeadQualification(event, id) {
  event.preventDefault();
  const result = document.getElementById('qualification-result');
  const qualificationData = collectLeadQualificationFormData();

  result.className = 'sync-result show';
  result.textContent = 'Сохраняю квалификационный бриф...';

  try {
    await api(`/api/leads/${id}/qualification`, {
      method: 'PUT',
      body: {
        qualification_data: qualificationData,
        performed_by: currentRole === 'admin' ? 'admin' : 'manager',
      },
    });
    closeModal();
    await renderLeads(document.getElementById('main'), currentLeadFilters);
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = 'Ошибка: ' + err.message;
  }
}

function openFollowupModal(id, encodedValue = '') {
  const value = decodeURIComponent(encodedValue || '');
  openModal('Следующий звонок', `
    <div class="form-grid">
      <div class="form-group">
        <label>Дата звонка</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="quick-followup-date" type="date" value="${toDateInput(value)}" style="flex:1;">
          <button class="btn btn-secondary btn-sm" type="button" onclick="openNativePicker('quick-followup-date')" title="Открыть календарь">📅</button>
        </div>
      </div>
      <div class="form-group">
        <label>Время</label>
        <input id="quick-followup-time" type="time" value="${toTimeInput(value) || '09:00'}">
      </div>
      <div class="form-group full">
      <div style="font-size:11px;color:#777;margin-top:6px;">Используйте это поле, когда клиент занят и нужно пинговать его в конкретный день/час.</div>
      </div>
    </div>
    <div id="quick-followup-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="clearLeadFollowup(${id})">Очистить</button>
      <div style="flex:1;"></div>
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveLeadFollowup(${id})">Сохранить</button>
    </div>
  `);
  setTimeout(() => openNativePicker('quick-followup-date'), 80);
}

async function saveLeadFollowup(id, valueOverride) {
  const result = document.getElementById('quick-followup-result');
  const value = valueOverride !== undefined
    ? valueOverride
    : combineDateAndTime('quick-followup-date', 'quick-followup-time');

  if (result) {
    result.className = 'sync-result show';
    result.textContent = 'Сохраняю...';
  }

  try {
    await api(`/api/leads/${id}`, {
      method: 'PUT',
      body: {
        next_followup_at: value || null,
        performed_by: currentRole === 'admin' ? 'admin' : 'manager',
      },
    });
    closeModal();
    await renderLeads(document.getElementById('main'), currentLeadFilters);
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ ' + err.message;
    } else {
      alert('Грешка: ' + err.message);
    }
  }
}

function clearLeadFollowup(id) {
  saveLeadFollowup(id, '');
}

async function syncLeadsWithSheets() {
  const el = document.getElementById('leads-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Сверяю Facebook лиды с листами МАТЕРИАЛЫ и УСЛУГИ...';
  try {
    const result = await api('/api/leads/sync-sheets', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ Проверено ${result.checked || 0} FB лидов. Совпадений ${result.matched || 0}: материалы ${result.materials || 0}, услуги ${result.services || 0}. Статусов обновлено ${result.status_updated || 0}.`;
    setTimeout(() => renderLeads(document.getElementById('main'), currentLeadFilters), 900);
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ ' + err.message;
  }
}

// ===== PIPELINE =====
async function renderPipeline(el) {
  const [pipeData, leadsData] = await Promise.all([
    api('/api/leads/stats/pipeline'),
    api('/api/leads?limit=200'),
  ]);

  const stages = CRM_STAGES;
  const leadsByStatus = {};
  stages.forEach(s => leadsByStatus[s] = []);
  (leadsData.leads || []).forEach(l => {
    if (leadsByStatus[l.status]) leadsByStatus[l.status].push(l);
  });

  const pipeMap = {};
  (pipeData || []).forEach(p => pipeMap[p.status] = p);

  el.innerHTML = `
    <div class="page-header fade-in"><h2>🔄 Pipeline</h2></div>
    <div class="pipeline fade-in">
      ${stages.map(s => `
        <div class="pipeline-col">
          <div class="pipeline-header">
            ${statusLabel(s)} <span class="count">(${pipeMap[s]?.count || 0})</span>
            <div style="font-size:9px;color:var(--green);margin-top:2px;">${Number(pipeMap[s]?.total_value || 0).toLocaleString()} лв</div>
          </div>
          <div class="pipeline-body">
            ${(leadsByStatus[s] || []).map(l => `
              <div class="pipeline-card" onclick="openLeadDetail(${l.id})">
                <div class="pc-company">${l.company_name || '—'}</div>
                <div class="pc-contact">${l.contact_name || ''} · ${l.city || ''}</div>
                ${l.estimated_value ? `<div class="pc-value">${l.estimated_value} лв</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== FACEBOOK =====
async function renderFacebook(el) {
  const [campaigns, summary] = await Promise.all([
    api('/api/facebook/campaigns'),
    api('/api/facebook/summary'),
  ]);

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>📢 Facebook Ads</h2>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="syncFB()">🔄 Синхронизирай от FB</button>
      </div>
    </div>

    <div id="fb-sync-result" class="sync-result"></div>

    <div class="stats-grid fade-in">
      <div class="stat-card">
        <div class="stat-label">Кампании</div>
        <div class="stat-value blue">${summary.total_campaigns || 0}</div>
        <div class="stat-sub">${summary.active_campaigns || 0} активни</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Общ разход</div>
        <div class="stat-value pink">$${Number(summary.total_spend || 0).toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Кликове</div>
        <div class="stat-value purple">${Number(summary.total_clicks || 0).toLocaleString()}</div>
        <div class="stat-sub">CTR: ${summary.avg_ctr || 0}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Лидове от FB</div>
        <div class="stat-value green">${summary.total_leads || 0}</div>
        <div class="stat-sub">CPL: $${summary.avg_cpl || 0}</div>
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-title">Кампании</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Име</th><th>Статус</th><th>Импресии</th><th>Кликове</th><th>CTR</th><th>Разход</th><th>Лидове</th><th>CPL</th></tr></thead>
          <tbody>
            ${campaigns.length ? campaigns.map(c => `
              <tr>
                <td style="font-weight:500;color:#ddd;">${c.name}</td>
                <td><span class="badge badge-${c.status}">${c.status}</span></td>
                <td>${Number(c.impressions || 0).toLocaleString()}</td>
                <td>${Number(c.clicks || 0).toLocaleString()}</td>
                <td>${c.ctr || 0}%</td>
                <td>$${Number(c.spend || 0).toLocaleString()}</td>
                <td style="color:var(--green);font-weight:600;">${c.leads_count || 0}</td>
                <td>${c.cost_per_lead ? `$${c.cost_per_lead}` : '—'}</td>
              </tr>
            `).join('') : '<tr><td colspan="8" style="text-align:center;color:#666;padding:30px;">Няма кампании. Натиснете "Синхронизирай от FB" или свържете FB акаунт.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function syncFB() {
  const el = document.getElementById('fb-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Синхронизиране...';
  try {
    const r1 = await api('/api/facebook/sync/campaigns', { method: 'POST' });
    const r2 = await api('/api/facebook/sync/leads', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ Синхронизация успешна! ${r1.demo ? '(Demo mode)' : `Кампании: ${r1.campaigns || 0}, Нови лидове: ${r2.new_leads || 0}`}`;
    setTimeout(() => renderFacebook(document.getElementById('main')), 1500);
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ ' + facebookSyncErrorText(err.message);
  }
}

function facebookSyncErrorText(message) {
  if (/api access blocked/i.test(message)) {
    return 'Meta заблокировала API-доступ. Данные в отчёте из БД показываются, но новая синхронизация FB сейчас не проходит. Проверьте токен Maria, доступ к рекламному аккаунту и permissions: ads_read, ads_management, leads_retrieval, business_management.';
  }

  return 'Грешка: ' + message;
}

// ===== GOOGLE SHEETS =====
async function renderSheets(el) {
  const [history, status] = await Promise.all([
    api('/api/google/history'),
    api('/api/google/status'),
  ]);

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>📑 Google Sheets</h2>
    </div>

    <div class="card fade-in">
      <div class="card-title">🔌 Връзка</div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px;">
        <div class="stat-card">
          <div class="stat-label">Статус</div>
          <div class="stat-value ${status.initialized ? 'green' : 'yellow'}" style="font-size:22px;">${status.initialized ? 'Свързано' : 'Не е свързано'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Service Account</div>
          <div style="font-size:12px;color:#ddd;word-break:break-all;margin-top:8px;">${status.serviceAccountEmail || '—'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Spreadsheet ID</div>
          <div style="font-size:12px;color:#ddd;word-break:break-all;margin-top:8px;">${status.spreadsheetId || '—'}</div>
        </div>
      </div>
      ${status.lastError ? `<div class="sync-result show err" style="margin-bottom:12px;">❌ ${status.lastError}</div>` : ''}
      <div class="sync-actions">
        <button class="btn btn-secondary" onclick="testSheetsConnection()">🔌 Провери връзката</button>
        <button class="btn btn-secondary" onclick="navigate('settings')">⚙️ Настройки</button>
      </div>
      <div id="sheets-setup-result" class="sync-result"></div>
    </div>

    <div class="card fade-in">
      <div class="card-title">🔄 Импорт в БД</div>
      <p style="font-size:12px;color:#888;margin-bottom:14px;">Google Sheets използваме само като източник за работните листове. Лидове, отчёты работников, продукты и статистика не се записват обратно в тази таблица.</p>
      <div class="sync-actions">
        <button class="btn btn-primary" onclick="pullBusinessSheetsFromSheetsPage()">👥 Обновить клиентов, материалы и услуги</button>
        <button class="btn btn-secondary" onclick="pullGoogleFormsFromSheetsPage()">📝 Импорт Google Forms</button>
      </div>
      <div id="sheets-sync-result" class="sync-result"></div>
    </div>

    <div class="card fade-in">
      <div class="card-title">📜 История на синхронизациите</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Дата</th><th>Лист</th><th>Посока</th><th>Редове</th><th>Статус</th><th>Грешка</th></tr></thead>
          <tbody>
            ${history.length ? history.map(h => `
              <tr>
                <td style="font-size:11px;">${new Date(h.synced_at).toLocaleString('bg-BG')}</td>
                <td>${h.sheet_name}</td>
                <td>${h.direction === 'push' ? '📤 Push' : '📥 Pull'}</td>
                <td>${h.rows_affected}</td>
                <td><span class="badge badge-${h.status}">${h.status}</span></td>
                <td style="color:var(--red);font-size:11px;">${h.error_message || '—'}</td>
              </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center;color:#666;padding:30px;">Няма записи. Натиснете бутон за синхронизация.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card fade-in">
      <div class="card-title">⚙️ Настройка на Google Sheets</div>
      <div style="font-size:12px;color:#888;line-height:1.8;">
        <p>1. Отидете на <a href="https://console.cloud.google.com" target="_blank" style="color:var(--brand-light);">Google Cloud Console</a></p>
        <p>2. Създайте проект → Активирайте Google Sheets API</p>
        <p>3. Създайте Service Account → Изтеглете JSON ключ</p>
        <p>4. Попълнете <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> и <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">GOOGLE_PRIVATE_KEY</code> в .env файла</p>
        <p>5. Създайте Google Spreadsheet и споделете го с Service Account email-а</p>
        <p>6. Копирайте Spreadsheet ID в <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">GOOGLE_SPREADSHEET_ID</code></p>
      </div>
    </div>
  `;
}

async function pullBusinessSheetsFromSheetsPage() {
  const el = document.getElementById('sheets-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Чета УСЛУГИ, МАТЕРИАЛЫ, ПРОЕКТЫ и b2b...';
  try {
    const result = await api('/api/google/pull/business', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ Обновени ${result.rows} реда от работните таблици.`;
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ ' + err.message;
  }
}

async function pullGoogleFormsFromSheetsPage() {
  const el = document.getElementById('sheets-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Чета отговорите от Google Forms...';
  try {
    const result = await api('/api/google/pull/forms', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ Google Forms: импортировано ${result.rows || 0}, новых лидов ${result.created_leads || 0}, найдено совпадений ${result.matched_leads || 0}.`;
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ ' + err.message;
  }
}

async function testSheetsConnection() {
  const el = document.getElementById('sheets-setup-result');
  el.className = 'sync-result show';
  el.textContent = 'Проверявам връзката...';
  try {
    const result = await api('/api/google/test', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ Връзката работи. Таблица: ${result.title || result.spreadsheetId}`;
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ ' + err.message;
  }
}

async function setupSheets() {
  const el = document.getElementById('sheets-setup-result');
  el.className = 'sync-result show';
  el.textContent = 'Подготвям листовете Leads, Products, Stats...';
  try {
    const result = await api('/api/google/setup', { method: 'POST' });
    el.className = 'sync-result show ok';
    const created = result.createdSheets?.length ? ` Създадени: ${result.createdSheets.join(', ')}.` : ' Всички листове вече съществуват.';
    el.textContent = `✅ Google Sheet е готов.${created}`;
    setTimeout(() => renderSheets(document.getElementById('main')), 1200);
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ ' + err.message;
  }
}

async function syncSheets(type) {
  const el = document.getElementById('sheets-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Синхронизиране...';
  try {
    const result = await api(`/api/google/push/${type}`, { method: 'POST' });
    el.className = 'sync-result show ok';
    const demo = result.demo || (result.leads?.demo);
    el.textContent = demo ? '✅ Demo mode — свържете Google Sheets за реална синхронизация' : `✅ Синхронизация успешна!`;
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ Грешка: ' + err.message;
  }
}

async function syncSheetsPull() {
  const el = document.getElementById('sheets-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Изтегляне от Google Sheets...';
  try {
    const result = await api('/api/google/pull/leads', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = result.demo ? '✅ Demo mode' : `✅ Обновени ${result.rows} лида от Google Sheets`;
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = '❌ Грешка: ' + err.message;
  }
}

// ===== PRODUCTS =====
async function renderProducts(el) {
  const products = await api('/api/dashboard/products');

  const categories = {
    water: '💧 Хидроизолация',
    structural: '🏗️ Структурно',
    gel: '🧪 Гел',
    equip: '⚙️ Оборудване',
    additive: '➕ Добавки',
    masonry: '🧱 Зидария',
  };

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>📦 Продукти ARCAN</h2>
      <div class="page-header-actions">
        ${currentRole === 'admin' ? '<button class="btn btn-primary" onclick="syncProductsFromSite()">📄 Обнови от ARCAN каталог</button>' : ''}
      </div>
    </div>
    <div id="products-sync-result" class="sync-result"></div>
    <div class="card fade-in">
      <div class="table-wrap">
        <table>
          <thead><tr><th>SKU</th><th>Име</th><th>Категория</th><th>Описание</th><th>Сфера</th><th>Кому звонить</th><th>Мин. поръчка</th><th>Наличност</th></tr></thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td style="font-weight:600;color:var(--brand-light);">${p.sku}</td>
                <td style="font-weight:500;color:#ddd;">${p.name_bg || p.name}</td>
                <td>${categories[p.category] || p.category}</td>
                <td style="max-width:300px;font-size:11px;color:#888;">${p.description_bg || '—'}</td>
                <td style="max-width:180px;font-size:11px;color:#8dd3ff;">${p.market_segment || '—'}</td>
                <td style="max-width:280px;font-size:11px;color:#a9b4d0;">${p.call_hint || '—'}</td>
                <td>${p.min_order_kg} кг</td>
                <td><span class="badge badge-${p.in_stock ? 'won' : 'lost'}">${p.in_stock ? 'Да' : 'Не'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function syncProductsFromSite() {
  const el = document.getElementById('products-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Загружаю продукты из ARCAN/BODEX каталога...';
  try {
    const result = await api('/api/dashboard/products/sync-site', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ ${result.message}. Источник: ${result.source}. Найдено: ${result.discovered}, обработано: ${result.parsed}.`;
    setTimeout(() => navigate('products'), 1000);
  } catch (err) {
    el.className = 'sync-result show err';
    el.textContent = `❌ ${err.message}`;
  }
}

// ===== SETTINGS =====
async function renderSettings(el) {
  const [s, gmail] = await Promise.all([
    api('/api/settings'),
    api('/api/gmail/status').catch(err => ({
      configured: false,
      accounts: [],
      error: err.message,
    })),
  ]);
  gmailAccountsCache = gmail.accounts || [];
  ensureConnectedGmailSender();
  const gmailRedirectUri = gmail.redirect_uri
    || `${API}/api/gmail/oauth/callback`;

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>⚙️ Интеграции — Настройки</h2>
    </div>

    <!-- ========= GMAIL API ========= -->
    <div class="card fade-in">
      <div class="card-title">
        ✉️ Gmail API — проверенный отправитель
        <span class="badge ${gmailAccountsCache.some(account => account.connected) ? 'badge-won' : (gmail.configured ? 'badge-qualified' : 'badge-new')}" style="margin-left:auto;">
          ${gmailAccountsCache.some(account => account.connected) ? '✅ Свързано' : (gmail.configured ? '⚠️ Свържете акаунт' : '⚫ Не е настроено')}
        </span>
      </div>

      <div style="font-size:12px;color:#aaa;line-height:1.7;margin-bottom:16px;">
        Писмата се изпращат директно през Gmail API. Приложението проверява реалния Google акаунт и няма да позволи писмо от друг адрес.
      </div>

      <details style="margin-bottom:16px;background:rgba(255,255,255,0.02);padding:12px 14px;border-radius:8px;">
        <summary style="cursor:pointer;font-size:12px;color:var(--brand-light);font-weight:600;">📖 Настройка в Google Cloud</summary>
        <div style="font-size:12px;color:#aaa;line-height:1.8;margin-top:10px;">
          <p><strong>1.</strong> В Google Cloud активирайте <strong>Gmail API</strong>.</p>
          <p><strong>2.</strong> Настройте OAuth consent screen и добавете двата Gmail акаунта като test users, ако приложението е в режим Testing.</p>
          <p><strong>3.</strong> Създайте OAuth Client ID от тип <strong>Web application</strong>.</p>
          <p><strong>4.</strong> В Authorized redirect URIs добавете точно:</p>
          <p><code style="font-size:10px;word-break:break-all;">${escapeHtml(gmailRedirectUri)}</code></p>
          <p><strong>5.</strong> Запазете Client ID и Client Secret долу, след което свържете всеки изпращач отделно.</p>
        </div>
      </details>

      <div class="form-grid">
        <div class="form-group full">
          <label>OAuth Client ID</label>
          <input id="gmail-client-id" placeholder="xxxxxxxx.apps.googleusercontent.com" value="${escapeAttr(gmail.client_id || '')}">
        </div>
        <div class="form-group full">
          <label>OAuth Client Secret ${gmail.client_secret_set ? '<span style="color:var(--green);">(вече запазен)</span>' : ''}</label>
          <input id="gmail-client-secret" type="password" placeholder="${gmail.client_secret_set ? 'Оставете празно, за да запазите текущия secret' : 'Google OAuth Client Secret'}">
        </div>
        <div class="form-group full">
          <label>OAuth Redirect URI</label>
          <input id="gmail-redirect-uri" value="${escapeAttr(gmailRedirectUri)}">
        </div>
      </div>
      <button class="btn btn-primary" onclick="saveGmailOAuth()">💾 Запази Gmail OAuth</button>
      <div id="gmail-result" class="sync-result"></div>

      <div style="display:grid;gap:10px;margin-top:18px;">
        ${GMAIL_SENDERS.map(sender => {
          const account = gmailAccountsCache.find(item => item.email === sender.email);
          const connected = Boolean(account?.connected);
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
              <div>
                <div style="font-weight:700;">${escapeHtml(sender.label)}</div>
                <div style="font-size:12px;color:#999;">${escapeHtml(sender.email)}</div>
                <div style="font-size:11px;color:${connected ? 'var(--green)' : '#777'};margin-top:3px;">
                  ${connected ? '✅ Google потвърди този адрес' : 'Не е свързан'}
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                ${connected
                  ? `<button class="btn btn-secondary btn-sm" onclick="disconnectGmailAccount('${escapeAttr(sender.email)}')">Изключи</button>`
                  : `<button class="btn btn-secondary btn-sm" onclick="connectGmailAccount('${escapeAttr(sender.email)}')" ${gmail.configured ? '' : 'disabled'}>Свържи</button>`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- ========= GOOGLE SHEETS ========= -->
    <div class="card fade-in">
      <div class="card-title">
        📑 Google Sheets
        <span class="badge ${s.google.connected ? 'badge-won' : (s.google.configured ? 'badge-qualified' : 'badge-new')}" style="margin-left:auto;">
          ${s.google.connected ? '✅ Свързано' : (s.google.configured ? '⚠️ Грешка в данните' : '⚫ Не е настроено')}
        </span>
      </div>

      <details style="margin-bottom:16px; background:rgba(255,255,255,0.02); padding:12px 14px; border-radius:8px;">
        <summary style="cursor:pointer; font-size:12px; color:var(--brand-light); font-weight:600;">📖 Как да получа ключове? (5 минути)</summary>
        <div style="font-size:12px; color:#aaa; line-height:1.8; margin-top:10px;">
          <p><strong>1.</strong> Отидете на <a href="https://console.cloud.google.com" target="_blank" style="color:var(--brand-light);">console.cloud.google.com</a> → влезте с Gmail акаунта си</p>
          <p><strong>2.</strong> Горе ляво → "Select a project" → "New Project" → име: <code>BODEX</code> → Create</p>
          <p><strong>3.</strong> Меню (☰) → "APIs &amp; Services" → "Library" → потърсете <strong>"Google Sheets API"</strong> → Enable</p>
          <p><strong>4.</strong> Меню (☰) → "IAM &amp; Admin" → "Service Accounts" → "Create Service Account"</p>
          <p style="padding-left:16px;">• Име: <code>bodex-sheets</code> → Create → Done</p>
          <p><strong>5.</strong> Натиснете на създадения акаунт → таб "Keys" → "Add Key" → "Create new key" → JSON → ще се изтегли файл</p>
          <p><strong>6.</strong> Отворете JSON файла. Намерете:</p>
          <p style="padding-left:16px;">• <code>client_email</code> → копирайте в полето "Service Account Email" долу</p>
          <p style="padding-left:16px;">• <code>private_key</code> (целият текст между кавичките, включително <code>-----BEGIN...</code> и <code>-----END...</code>) → копирайте в полето "Private Key"</p>
          <p><strong>7.</strong> Създайте Google Sheets файл → Share → залепете <code>client_email</code> като Editor</p>
          <p><strong>8.</strong> Копирайте Spreadsheet ID от URL: <code style="font-size:10px;">docs.google.com/spreadsheets/d/<span style="color:var(--brand-light);">SPREADSHEET_ID</span>/edit</code></p>
        </div>
      </details>

      <div class="form-grid">
        <div class="form-group full">
          <label>Service Account Email</label>
          <input id="g-email" placeholder="bodex-sheets@your-project.iam.gserviceaccount.com" value="${s.google.email}">
        </div>
        <div class="form-group full">
          <label>Private Key ${s.google.private_key_set ? '<span style="color:var(--green);">(вече запазен)</span>' : ''}</label>
          <textarea id="g-key" rows="6" placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIEvAIBADANBgkqhkiG9w0BAQEFAAS...&#10;-----END PRIVATE KEY-----" style="font-family:monospace; font-size:11px;"></textarea>
          <div style="font-size:10px;color:#666;margin-top:4px;">${s.google.private_key_set ? 'Оставете празно за да запазите текущия ключ' : 'Копирайте от JSON файла, заедно с BEGIN/END редовете'}</div>
        </div>
        <div class="form-group full">
          <label>Spreadsheet ID</label>
          <input id="g-sheet" placeholder="1AbC...XyZ" value="${s.google.spreadsheet_id}">
          <div style="font-size:10px;color:#666;margin-top:4px;">От URL на Google Sheet</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn btn-primary" onclick="saveGoogle()">💾 Запази Google ключове</button>
        <button class="btn btn-secondary" onclick="testGoogle()" ${!s.google.configured ? 'disabled' : ''}>🔌 Тествай връзката</button>
      </div>
      <div id="g-result" class="sync-result"></div>
    </div>

    <!-- ========= FACEBOOK ADS ========= -->
    <div class="card fade-in">
      <div class="card-title">
        📢 Facebook Ads
        <span class="badge ${s.facebook.connected ? 'badge-won' : (s.facebook.configured ? 'badge-qualified' : 'badge-new')}" style="margin-left:auto;">
          ${s.facebook.connected ? '✅ Свързано' : (s.facebook.configured ? '⚠️ Грешка' : '⚫ Не е настроено')}
        </span>
      </div>

      <details style="margin-bottom:16px; background:rgba(255,255,255,0.02); padding:12px 14px; border-radius:8px;">
        <summary style="cursor:pointer; font-size:12px; color:var(--brand-light); font-weight:600;">📖 Как да получа ключове? (10 минути)</summary>
        <div style="font-size:12px; color:#aaa; line-height:1.8; margin-top:10px;">
          <p><strong>1.</strong> Отидете на <a href="https://developers.facebook.com" target="_blank" style="color:var(--brand-light);">developers.facebook.com</a> → "My Apps" → "Create App"</p>
          <p><strong>2.</strong> Тип на приложението: <strong>"Business"</strong> → име: <code>BODEX Office</code> → Create App</p>
          <p><strong>3.</strong> В app dashboard → "Add Product" → намерете <strong>"Marketing API"</strong> → Set Up</p>
          <p><strong>4.</strong> "App settings" → "Basic" → копирайте:</p>
          <p style="padding-left:16px;">• <strong>App ID</strong> → в полето "App ID" долу</p>
          <p style="padding-left:16px;">• <strong>App Secret</strong> (натиснете Show) → в полето "App Secret"</p>
          <p><strong>5.</strong> Получаване на <strong>Ad Account ID</strong>:</p>
          <p style="padding-left:16px;">• Отидете на <a href="https://business.facebook.com/settings/ad-accounts" target="_blank" style="color:var(--brand-light);">business.facebook.com/settings/ad-accounts</a></p>
          <p style="padding-left:16px;">• Натиснете на вашия рекламен акаунт → копирайте номера (само цифри, без act_)</p>
          <p><strong>6.</strong> Получаване на <strong>Access Token</strong>:</p>
          <p style="padding-left:16px;">• Отворете <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color:var(--brand-light);">Graph API Explorer</a></p>
          <p style="padding-left:16px;">• Изберете вашия app горе вдясно</p>
          <p style="padding-left:16px;">• "User or Page" → User Token</p>
          <p style="padding-left:16px;">• Добавете permissions: <code>ads_read, ads_management, leads_retrieval, business_management</code></p>
          <p style="padding-left:16px;">• "Generate Access Token" → копирайте</p>
          <p><strong>7.</strong> ⚠️ Краткият token е валиден 1-2 часа. За дълъг token (60 дни) натиснете <strong>Get Token → Extend Access Token</strong> или използвайте този линк:</p>
          <p style="padding-left:16px; font-size:10px;"><code>graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN</code></p>
        </div>
      </details>

      <div class="form-grid">
        <div class="form-group">
          <label>App ID</label>
          <input id="f-app" placeholder="1234567890123456" value="${s.facebook.app_id}">
        </div>
        <div class="form-group">
          <label>Ad Account ID (без act_)</label>
          <input id="f-acc" placeholder="1234567890" value="${s.facebook.ad_account_id.replace(/^act_/, '')}">
        </div>
        <div class="form-group full">
          <label>App Secret ${s.facebook.app_secret_set ? '<span style="color:var(--green);">(вече запазен)</span>' : ''}</label>
          <input id="f-secret" type="password" placeholder="${s.facebook.app_secret_set ? '••••••••' : 'app secret'}">
        </div>
        <div class="form-group full">
          <label>Access Token (дълъг, 60 дни) ${s.facebook.access_token_set ? '<span style="color:var(--green);">(вече запазен)</span>' : ''}</label>
          <textarea id="f-token" rows="3" placeholder="EAAxxxxxxxxx..." style="font-family:monospace; font-size:11px;"></textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn btn-primary" onclick="saveFacebook()">💾 Запази FB ключове</button>
        <button class="btn btn-secondary" onclick="testFacebook()" ${!s.facebook.configured ? 'disabled' : ''}>🔌 Тествай връзката</button>
      </div>
      <div id="f-result" class="sync-result"></div>
    </div>

    <!-- ========= STATUS ========= -->
    <div class="card fade-in">
      <div class="card-title">🔍 Статус на интеграциите</div>
      <div class="grid-2">
        <div style="padding:12px;background:rgba(255,255,255,0.02);border-radius:8px;">
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Google Sheets</div>
          <div style="font-size:14px;margin-top:6px;color:${s.google.connected ? 'var(--green)' : '#888'};">
            ${s.google.connected ? '✅ Свързано и работи' : (s.google.configured ? '⚠️ Има ключове, но връзката не работи' : '⚫ Демо режим')}
          </div>
        </div>
        <div style="padding:12px;background:rgba(255,255,255,0.02);border-radius:8px;">
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Facebook Ads</div>
          <div style="font-size:14px;margin-top:6px;color:${s.facebook.connected ? 'var(--green)' : '#888'};">
            ${s.facebook.connected ? '✅ Свързано и работи' : (s.facebook.configured ? '⚠️ Има ключове, но връзката не работи' : '⚫ Демо режим')}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function saveGmailOAuth() {
  const result = document.getElementById('gmail-result');
  result.className = 'sync-result show';
  result.textContent = 'Запазване...';
  try {
    await api('/api/gmail/configure', {
      method: 'POST',
      body: {
        client_id: document.getElementById('gmail-client-id').value.trim(),
        client_secret: document.getElementById('gmail-client-secret').value,
        redirect_uri: document.getElementById('gmail-redirect-uri').value.trim(),
      },
    });
    result.className = 'sync-result show ok';
    result.textContent = '✅ Gmail OAuth е запазен. Сега свържете нужните акаунти.';
    setTimeout(() => renderSettings(document.getElementById('main')), 900);
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = '❌ ' + err.message;
  }
}

async function connectGmailAccount(email) {
  try {
    const response = await api('/api/gmail/connect', {
      method: 'POST',
      body: { email },
    });
    window.location.href = response.url;
  } catch (err) {
    alert('Не удалось подключить Gmail: ' + err.message);
  }
}

async function disconnectGmailAccount(email) {
  if (!confirm(`Отключить отправку с ${email}?`)) return;
  try {
    await api(`/api/gmail/accounts/${encodeURIComponent(email)}`, { method: 'DELETE' });
    await renderSettings(document.getElementById('main'));
  } catch (err) {
    alert('Не удалось отключить Gmail: ' + err.message);
  }
}

async function saveGoogle() {
  const r = document.getElementById('g-result');
  r.className = 'sync-result show';
  r.textContent = 'Запазване...';
  try {
    const data = {
      service_account_email: document.getElementById('g-email').value,
      private_key: document.getElementById('g-key').value,
      spreadsheet_id: document.getElementById('g-sheet').value,
    };
    const res = await api('/api/settings/google', { method: 'POST', body: data });
    r.className = 'sync-result show ' + (res.connected ? 'ok' : 'err');
    r.textContent = res.connected ? '✅ Запазено и свързано с Google Sheets!' : '⚠️ Запазено, но връзката не работи. Проверете данните.';
    setTimeout(() => renderSettings(document.getElementById('main')), 2000);
  } catch (err) {
    r.className = 'sync-result show err';
    r.textContent = '❌ ' + err.message;
  }
}

async function testGoogle() {
  const r = document.getElementById('g-result');
  r.className = 'sync-result show';
  r.textContent = 'Тестване...';
  try {
    const res = await api('/api/settings/google/test', { method: 'POST' });
    r.className = 'sync-result show ' + (res.ok ? 'ok' : 'err');
    r.textContent = (res.ok ? '✅ ' : '❌ ') + res.message;
  } catch (err) {
    r.className = 'sync-result show err';
    r.textContent = '❌ ' + err.message;
  }
}

async function saveFacebook() {
  const r = document.getElementById('f-result');
  r.className = 'sync-result show';
  r.textContent = 'Запазване...';
  try {
    const data = {
      app_id: document.getElementById('f-app').value,
      app_secret: document.getElementById('f-secret').value,
      access_token: document.getElementById('f-token').value,
      ad_account_id: document.getElementById('f-acc').value,
    };
    const res = await api('/api/settings/facebook', { method: 'POST', body: data });
    r.className = 'sync-result show ' + (res.connected ? 'ok' : 'err');
    r.textContent = res.connected ? '✅ Запазено и свързано с Facebook!' : '⚠️ Запазено, но връзката не работи.';
    setTimeout(() => renderSettings(document.getElementById('main')), 2000);
  } catch (err) {
    r.className = 'sync-result show err';
    r.textContent = '❌ ' + err.message;
  }
}

async function testFacebook() {
  const r = document.getElementById('f-result');
  r.className = 'sync-result show';
  r.textContent = 'Тестване...';
  try {
    const res = await api('/api/settings/facebook/test', { method: 'POST' });
    r.className = 'sync-result show ' + (res.ok ? 'ok' : 'err');
    r.textContent = (res.ok ? '✅ ' : '❌ ') + res.message;
  } catch (err) {
    r.className = 'sync-result show err';
    r.textContent = '❌ ' + err.message;
  }
}

// ===== MODALS =====
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

async function openDailyBriefModal(scope = 'materials') {
  if (currentRole !== 'admin') return;
  const brief = await api(`/api/dashboard/daily-brief?scope=${encodeURIComponent(scope)}`).catch(() => ({
    scope,
    content: '',
  }));
  openModal('Задача от админа на сегодня', `
    <div class="form-group">
      <label>Что менеджер должен сделать сегодня</label>
      <textarea id="daily-brief-content" rows="7" placeholder="Например: Прозвонить клиентов со статусом КП отправлено, пропинговать 5 лидов, уточнить детали по новым заявкам...">${escapeHtml(brief.content || '')}</textarea>
    </div>
    <div id="daily-brief-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveDailyBrief('${escapeAttr(scope)}')">Сохранить</button>
    </div>
  `);
  setTimeout(() => document.getElementById('daily-brief-content')?.focus(), 50);
}

async function saveDailyBrief(scope = 'materials') {
  const result = document.getElementById('daily-brief-result');
  result.className = 'sync-result show';
  result.textContent = 'Сохранение...';
  try {
    await api('/api/dashboard/daily-brief', {
      method: 'PUT',
      body: {
        scope,
        content: document.getElementById('daily-brief-content')?.value || '',
      },
    });
    result.className = 'sync-result show ok';
    result.textContent = '✅ Задача обновлена.';
    setTimeout(() => {
      closeModal();
      renderLeads(document.getElementById('main'), currentLeadFilters);
    }, 350);
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = `❌ ${err.message}`;
  }
}

function openNewLeadModal(section = 'materials') {
  const tireMode = section === 'tires' || section === 'tires_base';
  const coldBaseMode = section === 'tires_base';
  openModal(tireMode ? (coldBaseMode ? 'Новый клиент в холодную базу' : 'New tire lead') : 'Нов лид', `
    <form onsubmit="createLead(event, '${coldBaseMode ? 'tires_base' : tireMode ? 'tires' : 'materials'}')" novalidate>
      ${tireMode ? `
        <input type="hidden" name="lead_type" value="${coldBaseMode ? 'tire_cold_base' : 'tire_inquiry'}">
        <input type="hidden" name="crm_segment" value="objects">
      ` : ''}
      <div class="form-grid">
        <div class="form-group"><label>${tireMode ? 'Company / customer' : 'Компания'}</label><input name="company_name" required></div>
        <div class="form-group"><label>${tireMode ? 'Contact person' : 'Контакт'}</label><input name="contact_name"></div>
        <div class="form-group"><label>Email</label><input name="email" type="email"></div>
        <div class="form-group"><label>${tireMode ? 'Phone' : 'Телефон'}</label><input name="phone"></div>
        <div class="form-group"><label>${tireMode ? 'City' : 'Град'}</label><input name="city"></div>
        <div class="form-group">
          <label>${tireMode ? 'Customer type' : 'Тип фирма'}</label>
          <select name="company_type">
            ${tireMode ? `
              <option value="private">Private customer</option>
              <option value="company">Company / fleet</option>
              <option value="service">Car service / tire shop</option>
              <option value="dealer">Store / dealer</option>
            ` : `
              <option value="construction">Строителна фирма</option>
              <option value="designer">Проектант</option>
              <option value="distributor">Дистрибутор</option>
            `}
            <option value="other">${tireMode ? 'Other' : 'Друго'}</option>
          </select>
        </div>
        ${tireMode ? '' : `<div class="form-group">
          <label>Воронка продаж</label>
          <select name="crm_segment">
            <option value="objects">Объекты / покупатели материалов</option>
            <option value="distributor">Дистрибьюторы / партнёры</option>
          </select>
        </div>`}
        <div class="form-group">
          <label>${tireMode ? 'Source' : 'Източник'}</label>
          <select name="source">
            ${coldBaseMode ? '' : `<option value="facebook" ${tireMode ? 'selected' : ''}>Facebook</option>`}
            ${coldBaseMode ? '<option value="tire_cold_base" selected>Cold base</option>' : ''}
            <option value="website" ${tireMode ? '' : 'selected'}>${tireMode ? 'Website' : 'Сайт'}</option>
            <option value="phone">${tireMode ? 'Phone' : 'Телефон'}</option>
            <option value="email">Email</option>
            <option value="chatbot">${tireMode ? 'Chatbot' : 'Чатбот'}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${tireMode ? 'Priority' : 'Приоритет'}</label>
          <select name="priority">
            <option value="medium">${tireMode ? 'Medium' : 'Среден'}</option>
            <option value="high">${tireMode ? 'High' : 'Висок'}</option>
            <option value="hot">${tireMode ? 'Hot' : 'Горещ'}</option>
            <option value="low">${tireMode ? 'Low' : 'Нисък'}</option>
          </select>
        </div>
        <div class="form-group"><label>${coldBaseMode ? 'Fleet / short note' : tireMode ? 'Tires / wheels of interest' : 'Продукти (интерес)'}</label><input name="interest_products" value="${coldBaseMode ? '' : tireMode ? 'Tires' : ''}" placeholder="${coldBaseMode ? 'Например: 50 LKW / fleet / transport' : tireMode ? 'Michelin, Dunlop, Goodyear, wheels...' : 'HB-PU500, PAK-01...'}"></div>
        <div class="form-group"><label>${tireMode ? 'Estimated value (BGN)' : 'Стойност (лв)'}</label><input name="estimated_value" type="number"></div>
        <div class="form-group full"><label>${tireMode ? 'Notes' : 'Бележки'}</label><textarea name="notes" rows="2" placeholder="${coldBaseMode ? 'Website, company profile, cold call notes...' : tireMode ? 'Vehicle, tire size, season, quantity, wheels required...' : ''}"></textarea></div>
      </div>
      <div id="new-lead-result" class="sync-result"></div>
      <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:12px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">${tireMode ? 'Cancel' : 'Отказ'}</button>
        <button id="new-lead-submit" type="submit" class="btn btn-primary">${tireMode ? 'Create lead' : '💾 Създай'}</button>
      </div>
    </form>
  `);
}

async function createLead(e, section = 'materials') {
  e.preventDefault();
  const form = e.target;
  const result = document.getElementById('new-lead-result');
  const submit = document.getElementById('new-lead-submit');
  const data = Object.fromEntries(new FormData(form));
  Object.keys(data).forEach((key) => {
    if (typeof data[key] === 'string') {
      data[key] = data[key].trim();
      if (data[key] === '') data[key] = null;
    }
  });
  data.estimated_value = data.estimated_value ? parseFloat(data.estimated_value) : null;
  if (!data.company_name) {
    result.className = 'sync-result show err';
    result.textContent = section === 'tires' || section === 'tires_base' ? 'Company or customer name is required.' : 'Компанията е задължителна.';
    return;
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    result.className = 'sync-result show err';
    result.textContent = section === 'tires' || section === 'tires_base' ? 'Enter a valid email address.' : 'Въведете валиден email.';
    return;
  }
  submit.disabled = true;
  submit.textContent = section === 'tires' || section === 'tires_base' ? 'Creating...' : 'Създаване...';
  result.className = 'sync-result show';
  result.textContent = section === 'tires' || section === 'tires_base' ? 'Saving lead...' : 'Запазване...';
  try {
    await api('/api/leads', { method: 'POST', body: data });
    result.className = 'sync-result show ok';
    result.textContent = section === 'tires' || section === 'tires_base' ? 'Lead created successfully.' : 'Лидът е създаден.';
    closeModal();
    navigate(section === 'tires' ? 'tires' : section === 'tires_base' ? 'tire-base' : 'leads');
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = ((section === 'tires' || section === 'tires_base') ? 'Could not create lead: ' : 'Грешка: ') + err.message;
    submit.disabled = false;
    submit.textContent = section === 'tires' || section === 'tires_base' ? 'Create lead' : '💾 Създай';
  }
}

async function openLeadDetail(id) {
  try {
    const data = await api(`/api/leads/${id}`);
    const offerData = await api(`/api/offers/lead/${id}`).catch(() => ({ offers: [] }));
    const l = data.lead;
    const snapshot = data.snapshot || {};
    const offers = offerData.offers || [];
    const formResponses = data.form_responses || [];
    const historyActivities = (data.activities || []).filter(a => a.action !== 'comment');
    const qualificationActivities = (data.activities || []).filter(a => a.action === 'qualification');
    const leadNotes = formatLeadNotesForEditor(l.notes);
    currentLeadFormResponses = formResponses;
    currentLeadDetail = l;
    currentLeadQualificationActivities = qualificationActivities;

    openModal(`${l.company_name || 'Лид #' + l.id}`, `
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px;">
        <div style="padding:12px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;background:rgba(255,255,255,0.03);">
          <div style="font-size:11px;color:#8a8f9f;">Lead score</div>
          <div style="font-size:24px;font-weight:800;color:${snapshot.score?.value >= 75 ? '#f6d365' : snapshot.score?.value >= 45 ? '#8dd3ff' : '#ddd'};">${snapshot.score?.value || 0}</div>
          <div style="font-size:11px;color:#b9bcc7;">${(snapshot.score?.reasons || []).slice(0, 2).join(' · ') || 'Без сигналов'}</div>
        </div>
        <div style="padding:12px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;background:rgba(255,255,255,0.03);">
          <div style="font-size:11px;color:#8a8f9f;">Статус клиента</div>
          <div style="font-size:18px;font-weight:800;color:#ddd;">${statusLabel(snapshot.stage || l.status)}</div>
          <div style="font-size:11px;color:#b9bcc7;">${snapshot.next_action || 'Уточнить следующий шаг'}</div>
        </div>
        <div style="padding:12px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;background:rgba(255,255,255,0.03);">
          <div style="font-size:11px;color:#8a8f9f;">Карточка клиента</div>
          <div style="font-size:18px;font-weight:800;color:#ddd;">${snapshot.forms_count || 0} форм · ${snapshot.offers_count || 0} КП</div>
          <div style="font-size:11px;color:#b9bcc7;">
            ${snapshot.latest_comment || 'Комментариев пока нет'}
            ${snapshot.has_fresh_comment ? '<span class="fresh-comment-pill">свежий</span>' : ''}
          </div>
        </div>
        <div style="padding:12px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;background:rgba(255,255,255,0.03);">
          <div style="font-size:11px;color:#8a8f9f;">Сигналы</div>
          <div style="font-size:18px;font-weight:800;color:#ddd;">${snapshot.is_premium ? 'Premium' : snapshot.is_specific_object ? 'Объект' : 'Обычный'}</div>
          <div style="font-size:11px;color:#b9bcc7;">${snapshot.waiting_for_offer ? 'Ждёт КП' : 'КП пока не требуется'}</div>
        </div>
      </div>

      ${currentRole === 'admin' ? `
        <div style="display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px 16px;margin-bottom:16px;border:1px solid rgba(99,102,241,0.35);border-radius:10px;background:rgba(99,102,241,0.08);">
          <div>
            <div style="font-weight:800;color:#eee;font-size:14px;">Коммерческое предложение</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px;">
              Данные клиента уже подставлены: ${l.company_name || l.contact_name || ('лид #' + l.id)}${l.phone ? ' · ' + l.phone : ''}${l.email ? ' · ' + l.email : ''}
            </div>
          </div>
          <button class="btn btn-primary" onclick="openOfferModal(${l.id})">📄 Создать КП PDF</button>
        </div>
      ` : ''}

      <div class="form-grid">
        <div class="form-group"><label>Компания</label><input id="ld-company" value="${l.company_name || ''}"></div>
        <div class="form-group"><label>Контакт</label><input id="ld-contact" value="${l.contact_name || ''}"></div>
        <div class="form-group"><label>Email</label><input id="ld-email" value="${l.email || ''}"></div>
        <div class="form-group"><label>Телефон</label><input id="ld-phone" value="${l.phone || ''}"></div>
        <div class="form-group"><label>Град</label><input id="ld-city" value="${l.city || ''}"></div>
        <div class="form-group">
          <label>Воронка продаж</label>
          <select id="ld-crm-segment" onchange="refreshLeadStatusOptions()">
            <option value="objects" ${isDistributorLead(l) ? '' : 'selected'}>Объекты / покупатели материалов</option>
            <option value="distributor" ${isDistributorLead(l) ? 'selected' : ''}>Дистрибьюторы / партнёры</option>
          </select>
        </div>
        <div class="form-group">
          <label>Статус</label>
          <select id="ld-status">
            ${leadStagesForLead(l).map(s =>
              `<option value="${s}" ${leadDisplayStatus(l)===s?'selected':''}>${statusLabel(s)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Приоритет</label>
          <select id="ld-priority">
            ${['low','medium','high','hot'].map(p =>
              `<option value="${p}" ${l.priority===p?'selected':''}>${p}</option>`
            ).join('')}
          </select>
        </div>
        ${currentRole === 'admin' ? `
          <div class="form-group">
            <label>Premium лид</label>
            <label style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:10px;background:rgba(246,211,101,0.06);cursor:pointer;">
              <input id="ld-premium-manual" type="checkbox" ${l.premium_manual || l.is_gold_lead ? 'checked' : ''} style="width:16px;height:16px;">
              <span style="font-size:12px;color:#f6d365;font-weight:700;">Пометить этот лид как premium вручную</span>
            </label>
          </div>
        ` : ''}
        <div class="form-group"><label>Стойност (лв)</label><input id="ld-value" type="number" value="${l.estimated_value || ''}"></div>
        <div class="form-group">
          <label>Следующий звонок</label>
          <div style="display:grid;grid-template-columns:minmax(145px,1fr) 92px 38px;gap:8px;align-items:center;">
            <input id="ld-followup-date" type="date" value="${toDateInput(l.next_followup_at)}">
            <input id="ld-followup-time" type="time" value="${toTimeInput(l.next_followup_at) || '09:00'}">
            <button class="btn btn-secondary btn-sm" type="button" onclick="openNativePicker('ld-followup-date')" title="Открыть календарь">📅</button>
          </div>
        </div>
        <div class="form-group full"><label>Бележки</label><textarea id="ld-notes" rows="2">${escapeHtml(leadNotes)}</textarea></div>
      </div>

      ${renderLeadContactActions(l)}

      <div style="margin-top:16px;padding:12px 14px;border:1px solid rgba(34,197,94,0.25);border-radius:10px;background:rgba(34,197,94,0.06);display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-size:12px;font-weight:800;color:#ddd;">📝 Ответы Google Forms</div>
          <div style="font-size:11px;color:#8faaa0;margin-top:3px;">
            ${formResponses.length ? `${formResponses.length} ответ(ов) клиента по форме${formResponses.some(r => r.form_type === 'materials') ? ' · материалы' : ''}` : 'Ответов пока нет. Можно импортировать Google Forms и проверить совпадение по email.'}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="openLeadFormResponsesModal()">Посмотреть ответы</button>
      </div>

      <div style="margin-top:16px;padding:14px;border:1px solid rgba(56,189,248,0.25);border-radius:10px;background:rgba(56,189,248,0.06);">
        <div class="card-title" style="font-size:12px;margin-bottom:8px;">💬 Комментарий после звонка</div>
        <textarea id="ld-comment" rows="3" placeholder="Например: Позвонил, клиенту нужны PU смолы 20 кг, просит цену сегодня. Следующий шаг: отправить КП." style="width:100%;"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:10px;">
          <button class="btn btn-secondary btn-sm" onclick="saveLeadComment(${l.id})">Добавить комментарий</button>
        </div>
        <div id="ld-comment-result" class="sync-result"></div>
      </div>

      <div style="margin-top:16px;padding:12px 14px;border:1px solid rgba(250,204,21,0.22);border-radius:10px;background:rgba(250,204,21,0.06);display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-size:12px;font-weight:800;color:#ddd;">📋 История опросника</div>
          <div style="font-size:11px;color:#b9bcc7;margin-top:3px;">
            ${qualificationActivities.length ? `Сохранённых версий: ${qualificationActivities.length}` : 'Сохранённых версий опросника пока нет'}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="openQualificationHistoryModal()">Посмотреть</button>
      </div>

      <div style="margin-top:16px;">
        <div class="card-title" style="font-size:12px;">📜 История</div>
        ${historyActivities.map(a => `
          <div style="display:flex;gap:8px;align-items:flex-start;font-size:11px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.03);color:#888;">
            <div style="flex:1;">
              <span style="color:#555;">${new Date(a.created_at).toLocaleString('bg-BG')}</span> —
              <strong style="color:${a.action === 'comment' ? 'var(--brand-light)' : '#aaa'};">${leadActivityLabel(a.action)}</strong>${a.performed_by ? ` · ${a.performed_by}` : ''}: ${a.description || ''}
            </div>
            ${a.action === 'comment' ? `<button class="btn btn-sm btn-secondary" style="padding:2px 7px;font-size:10px;" onclick="deleteLeadComment(${l.id}, ${a.id})">Удалить</button>` : ''}
          </div>
        `).join('') || '<div style="font-size:11px;color:#555;">Няма активност</div>'}
      </div>

      ${offers.length ? `
        <div style="margin-top:16px;">
          <div class="card-title" style="font-size:12px;">📄 Коммерческие предложения</div>
          ${offers.map(o => `
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:11px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
              <div>
                <div style="font-weight:700;color:#ddd;">${o.offer_number}</div>
                <div style="color:#777;">${o.status} · ${Number(o.total || 0).toLocaleString()} ${o.currency || 'EUR'} · ${formatDateTime(o.created_at)}</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="downloadOfferPdf(${o.id})">PDF</button>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
        <button class="btn btn-danger btn-sm" onclick="deleteLead(${l.id})">🗑️ Изтрий</button>
        <div style="flex:1;"></div>
        <button class="btn btn-secondary" onclick="closeModal()">Затвори</button>
        <button class="btn btn-primary" onclick="updateLead(${l.id})">💾 Запази</button>
      </div>
    `);
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

function openLeadComment(id) {
  openQuickCommentModal(id, '');
}

function leadActivityLabel(action) {
  const map = {
    created: 'создан',
    status_change: 'статус',
    comment: 'комментарий',
    followup_change: 'следующий звонок',
    google_form: 'Google Form',
    qualification: 'квалификационный бриф',
  };
  return map[action] || action || 'активность';
}

function formatFormAnswers(answers = {}) {
  return Object.entries(answers || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .slice(0, 30)
    .map(([key, value]) => ({
      key: escapeHtml(String(key)),
      value: escapeHtml(Array.isArray(value) ? value.join(', ') : String(value)),
    }));
}

function formatLeadNotesForEditor(notes = '') {
  const text = String(notes || '').trim();
  if (!text.includes('Fields:')) return text;
  const fieldsText = text.split('Fields:').slice(1).join('Fields:');
  const rows = fieldsText
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const idx = part.indexOf(':');
      if (idx === -1) return null;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (!value) return null;
      return `${humanizeLeadFieldName(key)}: ${humanizeLeadAnswer(value, key)}`;
    })
    .filter(Boolean);

  return rows.length ? rows.join('\n') : text;
}

function humanizeLeadFieldName(key = '') {
  const normalized = String(key).toLowerCase();
  if (normalized.includes('full_name') || normalized === 'name') return 'Име';
  if (normalized.includes('phone')) return 'Телефон';
  if (normalized.includes('email')) return 'Email';
  if (normalized.includes('company_name')) return 'Компания';
  if (normalized.includes('какъв_тип_компания') || normalized.includes('тип_компания')) return 'Тип компания';
  if (normalized.includes('какви_материали') || normalized.includes('материали')) return 'Материалы';
  if (normalized.includes('какъв_тип_запитване') || normalized.includes('запитване')) return 'Обем / тип запитване';
  if (normalized.includes('city')) return 'Град';
  return key.replace(/_/g, ' ').replace(/\?+$/g, '').trim();
}

function humanizeLeadAnswer(value = '', key = '') {
  const raw = String(value || '').trim();
  if (/email/i.test(key) || /phone/i.test(key) || raw.includes('@')) return raw;
  return raw
    .split(',')
    .map(item => item.trim().replace(/_/g, ' '))
    .filter(Boolean)
    .join(', ');
}

function renderLeadContactActions(lead = {}) {
  const phone = String(lead.phone || '').trim();
  const whatsapp = whatsappUrl(phone, buildLeadTemplateMessage(lead, 'intro'));
  const viber = viberUrl(phone, buildLeadTemplateMessage(lead, 'intro'));
  const gmailEnabled = currentRole === 'admin'
    && gmailSenderConnected(selectedGmailSender().email)
    && String(lead.email || '').trim();

  return `
    <div style="margin-top:16px;padding:12px 14px;border:1px solid rgba(99,102,241,0.28);border-radius:10px;background:rgba(99,102,241,0.07);">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
        <div>
          <div style="font-size:12px;font-weight:800;color:#ddd;">⚡ Быстрый контакт</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:3px;">Email отправляется через подтверждённый Gmail API аккаунт.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="sendLeadEmail(${lead.id}, 'intro')" ${gmailEnabled ? '' : 'disabled'}>✉️ Отправить email</button>
          <a class="btn btn-secondary btn-sm ${whatsapp ? '' : 'disabled'}" ${whatsapp ? `href="${escapeAttr(whatsapp)}" target="_blank" rel="noopener"` : ''}>💬 WhatsApp</a>
          <a class="btn btn-secondary btn-sm ${viber ? '' : 'disabled'}" ${viber ? `href="${escapeAttr(viber)}"` : ''}>📲 Viber</a>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-secondary btn-sm" onclick="openLeadTemplate('intro')">Уточнить детали</button>
        <button class="btn btn-secondary btn-sm" onclick="openLeadTemplate('offer_followup')">Follow-up по КП</button>
      </div>
    </div>
  `;
}

function renderLeadTableContactActions(lead = {}) {
  const phone = String(lead.phone || '').trim();
  const whatsapp = whatsappUrl(phone);
  const viber = viberUrl(phone);
  const gmailEnabled = currentRole === 'admin'
    && gmailSenderConnected(selectedGmailSender().email)
    && String(lead.email || '').trim();
  const showTireFollowups = currentLeadFilters.view === 'tires' && currentLeadFilters.status === 'offer_sent' && leadDisplayStatus(lead) === 'offer_sent';

  if (showTireFollowups) {
    return renderTireOfferFollowupButtons(lead);
  }

  return `
    <div class="lead-contact-actions">
      <button class="lead-contact-btn ${gmailEnabled ? '' : 'disabled'}" title="Отправить с ${escapeAttr(selectedGmailSender().email)}" onclick="event.stopPropagation();sendLeadEmail(${lead.id}, 'intro')" ${gmailEnabled ? '' : 'disabled'}>✉️</button>
      <a class="lead-contact-btn ${whatsapp ? '' : 'disabled'}" title="WhatsApp" ${whatsapp ? `href="${escapeAttr(whatsapp)}" target="_blank" rel="noopener"` : ''}>💬</a>
      <a class="lead-contact-btn ${viber ? '' : 'disabled'}" title="Viber" ${viber ? `href="${escapeAttr(viber)}"` : ''}>📲</a>
    </div>
  `;
}

function defaultLeadMessage(lead = {}) {
  const name = lead.contact_name || lead.company_name || '';
  const interest = lead.interest_products || '';
  return [
    name ? `Здравейте, ${name},` : 'Здравейте,',
    '',
    'Пиша Ви от BODEX Bulgaria относно Вашето запитване за строителни материали.',
    interest ? `Виждам, че се интересувате от: ${interest}.` : '',
    'Можем да уточним нужния материал, обем и срок, за да подготвим оферта.',
    '',
    'Поздрави,',
    'BODEX Bulgaria',
  ].filter(line => line !== '').join('\n');
}

function buildLeadTemplateMessage(lead = {}, type = 'intro') {
  const name = lead.contact_name || lead.company_name || '';
  const interest = lead.interest_products || lead.area_label || '';
  const formLines = leadApplicationFormLines(lead);
  const templateBodies = {
    intro: [
      interest ? `Виждам, че интересът е: ${interest}.` : '',
      'Благодаря Ви за интереса към решенията на BODEX Bulgaria.',
      'Ако имате въпроси за материалите, приложението или доставката, пишете ми и ще Ви съдействам.',
    ],
    catalog_ping: [
      'Изпратихме Ви търговско предложение и бих искал да получа Вашата обратна връзка.',
      'Имате ли въпроси по цената, количеството, срока или доставката? Готови сме да уточним условията и следващата стъпка.',
    ],
    offer_followup: [
      'Искам да проследя изпратеното търговско предложение.',
      'Имате ли обратна връзка по цената, обема или срока за доставка, за да подготвим следващата стъпка?',
    ],
  };
  return [
    name ? `Здравейте, ${name},` : 'Здравейте,',
    '',
    'Казвам се Владислав и съм търговски директор на BODEX Bulgaria.',
    '',
    ...(templateBodies[type] || templateBodies.intro),
    ...formLines,
    '',
    'Ако имате въпроси, можете да ми отговорите директно на този имейл.',
    ...vladislavSignatureLines(),
  ].filter(line => line !== null && line !== undefined).join('\n');
}

function germanLeadSalutation(lead = {}) {
  const contact = String(lead.contact_name || '').trim();
  if (!contact) return 'Guten Tag,';
  return `Guten Tag Herr ${contact},`;
}

function buildTireOfferFollowupMessage(lead = {}, step = 1) {
  const messages = {
    1: [
      germanLeadSalutation(lead),
      '',
      'ich habe Ihnen soeben unser Angebot per E-Mail gesendet.',
      'Bei Fragen stehe ich Ihnen gerne zur Verfügung.',
      'Mit freundlichen Grüßen',
    ],
    2: [
      germanLeadSalutation(lead),
      '',
      'ich wollte kurz nachfragen, ob Sie unser Angebot erhalten haben.',
      'Passt die angebotene Variante grundsätzlich für Sie, oder sollen wir etwas anpassen?',
    ],
    3: [
      'Gibt es bereits eine Rückmeldung zu unserem Angebot?',
      'Falls Preis, Menge oder Marke angepasst werden sollen, können wir das gerne prüfen.',
    ],
  };

  return (messages[step] || messages[1]).join('\n');
}

function renderTireOfferFollowupButtons(lead = {}) {
  const phone = String(lead.phone || '').trim();
  const steps = [1, 2, 3];
  return `
    <div class="lead-followup-steps" style="display:flex;gap:4px;align-items:center;">
      ${steps.map(step => {
        const url = whatsappUrl(phone, buildTireOfferFollowupMessage(lead, step));
        const sentAt = lead[`tire_fu${step}_sent_at`];
        const active = Boolean(sentAt);
        return `
          <button
            class="lead-followup-step-btn ${active ? 'is-active' : ''} ${url ? '' : 'disabled'}"
            title="FU${step}"
            onclick="event.stopPropagation();${url ? `markLeadPingAndOpen(${lead.id}, 'whatsapp_fu${step}', '${encodeURIComponent(url)}')` : 'return false;'}"
            ${url ? '' : 'disabled'}
            style="width:24px;height:24px;border-radius:7px;border:1px solid ${active ? 'rgba(34,197,94,0.7)' : 'rgba(99,102,241,0.24)'};background:${active ? 'rgba(34,197,94,0.18)' : 'rgba(99,102,241,0.08)'};color:${active ? '#86efac' : '#cbd5e1'};font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;cursor:${url ? 'pointer' : 'not-allowed'};"
          >${step}</button>
        `;
      }).join('')}
    </div>
  `;
}

function bulkPingTemplateForStatus(status = 'needs_discovery') {
  const templates = {
    new: [
      'Благодарим за Вашето запитване към BODEX Bulgaria.',
      'Актуален ли е още интересът Ви? Можем да уточним материала, обема и срока и да предложим следваща стъпка.',
    ],
    needs_discovery: [
      'Свързваме се във връзка с интереса Ви към нашите строителни материали.',
      'За да подготвим конкретно предложение, моля уточнете обекта, нужния материал, количеството, срока и адреса за доставка.',
    ],
    contacted: [
      'Благодаря за разговора с нашия мениджър.',
      'За да продължим, моля потвърдете проблема, обекта, необходимото количество и желания срок.',
    ],
    offer_preparation: [
      'Подготвяме Вашето търговско предложение.',
      'Моля потвърдете дали количеството, адресът за доставка и желаният срок са актуални.',
    ],
    offer_sent: [
      'Успяхте ли да разгледате изпратеното търговско предложение?',
      'Очакваме Вашата обратна връзка по цената, обема и срока за доставка.',
    ],
    negotiation: [
      'Свързваме се, за да продължим обсъждането на условията.',
      'Готови сме да уточним финалната цена, количеството, доставката и срока за изпълнение.',
    ],
    office_meeting: [
      'Потвърждаваме интереса към среща в офиса.',
      'Моля, предложете удобни дата и час, за да подготвим материалите и конкретните условия за обсъждане.',
    ],
    contract: [
      'Свързваме се във връзка с договора и договорените условия.',
      'Имате ли въпроси или липсваща информация, за да преминем към подписване и плащане?',
    ],
    purchase: [
      'Готови сме да финализираме поръчката.',
      'Моля, потвърдете количеството, адреса за доставка и желания срок.',
    ],
    won: [
      'Благодарим Ви за доверието и работата с BODEX Bulgaria.',
      'Имате ли нов обект или нужда от повторна доставка, за която можем да помогнем?',
    ],
    lost: [
      'Свързваме се отново, за да проверим дали проектът или нуждата от материали са станали актуални.',
      'Ако желаете, можем да подготвим обновена информация и предложение.',
    ],
    partner_new: [
      'Свързваме се във връзка с интереса Ви към партньорство с BODEX Bulgaria.',
      'Бихме искали да уточним регионите, в които работите, продуктовото Ви портфолио и потенциала за закупуване.',
    ],
    partner_qualification: [
      'За да подготвим подходящ модел за партньорство, моля споделете регионите, каналите за продажба, складовите възможности и ориентировъчния потенциал за закупуване.',
    ],
    partner_negotiation: [
      'Искам да продължим обсъждането на условията за партньорство и следващите стъпки.',
    ],
    partner_meeting: [
      'Благодаря за проведената среща. Нека потвърдим договорените следващи стъпки.',
    ],
    partner_terms_sent: [
      'Изпратихме условията за партньорство. Имате ли въпроси или корекции, които да обсъдим?',
    ],
    partner_test_order: [
      'Готови сме да организираме тестовата поръчка. Моля потвърдете продуктите, количествата и адреса за доставка.',
    ],
    partner_active: [
      'Благодарим за партньорството. Нека планираме следващата поръчка и необходимата търговска подкрепа.',
    ],
  };
  return (templates[status] || templates.needs_discovery).join('\n\n');
}

function buildBulkPingMessage(lead = {}, status = 'needs_discovery', body = '', forcedFormType = '') {
  const name = lead.contact_name || lead.company_name || '';
  const formLines = leadApplicationFormLines(lead, forcedFormType);
  return [
    name ? `Здравейте, ${name},` : 'Здравейте,',
    '',
    'Казвам се Владислав и съм търговски директор на BODEX Bulgaria.',
    '',
    body || bulkPingTemplateForStatus(status),
    ...formLines,
    '',
    'Ако имате въпроси, можете да ми отговорите директно на този имейл.',
    ...vladislavSignatureLines(),
  ].join('\n');
}

async function openBulkPingModal() {
  bulkPingRecipients = [];
  bulkPingQueue = [];
  bulkPingQueueIndex = 0;
  bulkPingQueueChannel = '';
  const initialStatus = currentLeadFilters.status || (currentLeadFilters.view === 'distributors' ? 'partner_qualification' : 'needs_discovery');

  openModal('Массовый пинг клиентов', `
    <div class="bulk-ping-toolbar">
      <div class="form-group" style="margin:0;">
        <label>Статус клиентов</label>
        <select id="bulk-ping-status" onchange="loadBulkPingRecipients()">
          ${leadStagesForView(currentLeadFilters).map(status => `<option value="${status}" ${status === initialStatus ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label>Отправитель Gmail</label>
        <select id="bulk-ping-sender" onchange="setGmailSender(this.value)">
          ${gmailSenderOptions()}
        </select>
      </div>
    </div>
    <div id="bulk-ping-content" class="bulk-ping-content">
      <div style="color:#777;">Загрузка получателей...</div>
    </div>
  `);

  await loadBulkPingRecipients();
}

async function loadBulkPingRecipients() {
  const status = document.getElementById('bulk-ping-status')?.value || 'needs_discovery';
  const content = document.getElementById('bulk-ping-content');
  if (!content) return;
  content.innerHTML = '<div style="color:#777;">Загрузка получателей...</div>';

  try {
    const data = await api(`/api/leads?status=${encodeURIComponent(status)}&limit=500`);
    bulkPingRecipients = data.leads || [];
    bulkPingQueue = [];
    bulkPingQueueIndex = 0;
    bulkPingQueueChannel = '';
    renderBulkPingRecipients(status);
  } catch (err) {
    content.innerHTML = `<div class="sync-result show err">${escapeHtml(err.message)}</div>`;
  }
}

function renderBulkPingRecipients(status) {
  const content = document.getElementById('bulk-ping-content');
  if (!content) return;
  const emailRecipients = bulkPingRecipients.filter(lead => String(lead.email || '').trim());
  const distributorEmailCount = emailRecipients.filter(isDistributorLead).length;
  const servicesEmailCount = emailRecipients.filter(lead => !isDistributorLead(lead) && isServicesLead(lead)).length;
  const materialsEmailCount = emailRecipients.length - distributorEmailCount - servicesEmailCount;
  const emailCount = emailRecipients.length;
  const phoneCount = bulkPingRecipients.filter(lead => phoneDigits(lead.phone || '').length >= 6).length;
  const names = bulkPingRecipients.slice(0, 8).map(lead => lead.company_name || lead.contact_name || `Лид #${lead.id}`);

  content.innerHTML = `
    <div class="bulk-ping-summary">
      <span><strong>${bulkPingRecipients.length}</strong> клиентов</span>
      <span><strong>${emailCount}</strong> email</span>
      <span><strong>${phoneCount}</strong> телефонов</span>
    </div>
    <div class="form-group" style="margin-top:14px;">
      <label>Текст для статуса «${statusLabel(status)}»</label>
      <textarea id="bulk-ping-template" rows="8">${escapeHtml(bulkPingTemplateForStatus(status))}</textarea>
    </div>
    ${names.length ? `<div class="bulk-ping-recipients">${names.map(name => `<span>${escapeHtml(name)}</span>`).join('')}${bulkPingRecipients.length > names.length ? `<span>+${bulkPingRecipients.length - names.length}</span>` : ''}</div>` : ''}
    <div class="bulk-ping-actions">
      <button class="btn btn-secondary" onclick="sendBulkEmailPing('distributor')" ${distributorEmailCount ? '' : 'disabled'}>Email дистрибьюторам (${distributorEmailCount})</button>
      <button class="btn btn-secondary" onclick="sendBulkEmailPing('services')" ${servicesEmailCount ? '' : 'disabled'}>Email по услугам (${servicesEmailCount})</button>
      <button class="btn btn-secondary" onclick="sendBulkEmailPing('materials')" ${materialsEmailCount ? '' : 'disabled'}>Email по материалам (${materialsEmailCount})</button>
      <button class="btn btn-secondary" onclick="startBulkPingQueue('whatsapp')" ${phoneCount ? '' : 'disabled'}>WhatsApp (${phoneCount})</button>
      <button class="btn btn-secondary" onclick="startBulkPingQueue('viber')" ${phoneCount ? '' : 'disabled'}>Viber (${phoneCount})</button>
    </div>
    <div id="bulk-ping-queue-state"></div>
  `;
}

function bulkPingBody() {
  return document.getElementById('bulk-ping-template')?.value.trim() || '';
}

async function recordBulkPings(leads, channel) {
  if (!leads.length) return;
  await api('/api/leads/bulk-ping', {
    method: 'POST',
    body: {
      lead_ids: leads.map(lead => lead.id),
      channel,
      performed_by: currentRole === 'admin' ? 'admin' : 'manager',
    },
  });
}

async function sendBulkEmailPing(group = 'general') {
  setGmailSender(document.getElementById('bulk-ping-sender')?.value || selectedGmailSenderKey);
  const status = document.getElementById('bulk-ping-status')?.value || 'needs_discovery';
  const recipients = bulkPingRecipients.filter(lead => {
    if (!String(lead.email || '').trim()) return false;
    if (group === 'distributor') return isDistributorLead(lead);
    if (group === 'services') return !isDistributorLead(lead) && isServicesLead(lead);
    return !isDistributorLead(lead) && !isServicesLead(lead);
  });
  const formType = ['distributor', 'services', 'materials'].includes(group) ? group : 'materials';
  const emails = [...new Set(recipients.map(lead => String(lead.email || '').trim()).filter(Boolean))];
  if (!emails.length) return;
  const sender = selectedGmailSender().email;
  if (!gmailSenderConnected(sender)) {
    alert(`${sender} не подключён через Gmail OAuth.`);
    return;
  }
  const subject = status === 'offer_preparation'
    ? 'Подготовка на търговско предложение от BODEX Bulgaria'
    : `BODEX Bulgaria - ${statusLabel(status)}`;
  if (!confirm(`Отправить письмо?\n\nОт: ${sender}\nПолучателей: ${emails.length}\nСтатус: ${statusLabel(status)}`)) return;

  try {
    await api('/api/gmail/send', {
      method: 'POST',
      body: {
        sender,
        bcc: emails,
        subject,
        body: buildBulkPingMessage({}, status, bulkPingBody(), formType),
      },
    });
    await recordBulkPings(recipients, 'gmail');
    const state = document.getElementById('bulk-ping-queue-state');
    if (state) state.innerHTML = `<div class="bulk-ping-done">Отправлено с ${escapeHtml(sender)} для ${recipients.length} получателей.</div>`;
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

function startBulkPingQueue(channel) {
  bulkPingQueueChannel = channel;
  bulkPingQueue = bulkPingRecipients.filter(lead => phoneDigits(lead.phone || '').length >= 6);
  bulkPingQueueIndex = 0;
  renderBulkPingQueueState();
}

function renderBulkPingQueueState() {
  const state = document.getElementById('bulk-ping-queue-state');
  if (!state) return;
  const total = bulkPingQueue.length;
  const current = bulkPingQueue[bulkPingQueueIndex];

  if (!current) {
    state.innerHTML = total
      ? `<div class="bulk-ping-done">Очередь завершена: обработано ${total} клиентов.</div>`
      : '';
    return;
  }

  state.innerHTML = `
    <div class="bulk-ping-queue">
      <div>
        <strong>${bulkPingQueueIndex + 1} из ${total}</strong>
        <span>${escapeHtml(current.company_name || current.contact_name || `Лид #${current.id}`)}</span>
      </div>
      <button class="btn btn-primary" onclick="openNextBulkPingRecipient()">Открыть и перейти дальше</button>
    </div>
  `;
}

async function openNextBulkPingRecipient() {
  const lead = bulkPingQueue[bulkPingQueueIndex];
  if (!lead) return;
  const status = document.getElementById('bulk-ping-status')?.value || lead.status || 'needs_discovery';
  const message = buildBulkPingMessage(lead, status, bulkPingBody());
  const url = bulkPingQueueChannel === 'viber'
    ? viberUrl(lead.phone, message)
    : whatsappUrl(lead.phone, message);

  if (url) window.open(url, '_blank', 'noopener');

  try {
    await api(`/api/leads/${lead.id}/ping`, {
      method: 'POST',
      body: {
        channel: bulkPingQueueChannel,
        performed_by: currentRole === 'admin' ? 'admin' : 'manager',
      },
    });
    bulkPingQueueIndex += 1;
    renderBulkPingQueueState();
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

function needsCatalogPing(lead = {}) {
  if ((lead.status || '') !== 'offer_sent') return false;
  if (!String(lead.email || '').trim() && !phoneDigits(lead.phone || '')) return false;
  const lastPingAt = lead.latest_ping_at ? new Date(lead.latest_ping_at).getTime() : 0;
  if (Number.isFinite(lastPingAt) && lastPingAt > 0 && (Date.now() - lastPingAt) < (3 * 24 * 60 * 60 * 1000)) {
    return false;
  }
  const sourceDate = lead.latest_status_change_at || lead.updated_at || lead.created_at;
  if (!sourceDate) return false;
  const timestamp = new Date(sourceDate).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return (Date.now() - timestamp) >= (3 * 24 * 60 * 60 * 1000);
}

function gmailComposeSubject(lead = {}, type = 'intro') {
  if (type === 'catalog_ping') {
    return 'Обратна връзка по търговското предложение от BODEX Bulgaria';
  }
  if (type === 'offer_followup') {
    return 'Търговско предложение от BODEX Bulgaria';
  }
  return `BODEX Bulgaria - ${lead.company_name || lead.contact_name || 'строителни материали'}`;
}

async function sendLeadEmail(leadId, type = 'intro') {
  try {
    const data = await api(`/api/leads/${leadId}`);
    const lead = data?.lead;
    if (!lead?.email) throw new Error('У лида нет email');
    const sender = selectedGmailSender().email;
    if (!gmailSenderConnected(sender)) throw new Error(`${sender} не подключён через Gmail OAuth`);
    if (!confirm(`Отправить письмо?\n\nОт: ${sender}\nКому: ${lead.email}\nТема: ${gmailComposeSubject(lead, type)}`)) return;
    const result = await api('/api/gmail/send', {
      method: 'POST',
      body: {
        sender,
        to: [lead.email],
        subject: gmailComposeSubject(lead, type),
        body: buildLeadTemplateMessage(lead, type),
      },
    });
    if (type === 'catalog_ping') {
      await api(`/api/leads/${lead.id}/ping`, {
        method: 'POST',
        body: {
          channel: 'gmail',
          performed_by: currentRole === 'admin' ? 'admin' : 'manager',
        },
      });
    }
    alert(`Письмо отправлено с ${result.sender}`);
    if (type === 'catalog_ping') {
      closeModal();
      await renderLeads(document.getElementById('main'), currentLeadFilters);
    }
  } catch (err) {
    alert('Ошибка отправки: ' + err.message);
  }
}

function phoneDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function whatsappUrl(phone, message = '') {
  const digits = phoneDigits(phone);
  if (digits.length < 6) return '';
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

function viberUrl(phone, message = '') {
  const digits = phoneDigits(phone);
  if (digits.length < 6) return '';
  return `viber://chat?number=%2B${digits}${message ? `&text=${encodeURIComponent(message)}` : ''}`;
}

function openLeadTemplate(type = 'intro') {
  const lead = currentLeadDetail;
  if (!lead) return;
  openModal('Шаблон сообщения', `
    <div class="form-group" style="margin-bottom:12px;">
      <label>Отправить из Gmail-аккаунта</label>
      <select onchange="setGmailSender(this.value);openLeadTemplate('${type}')">
        ${gmailSenderOptions()}
      </select>
    </div>
    <div style="font-size:12px;color:#9ca3af;margin-bottom:10px;">
      Письмо будет отправлено сервером с подтверждённого адреса <strong>${escapeHtml(selectedGmailSender().email)}</strong>.
    </div>
    <textarea rows="10" style="width:100%;">${escapeHtml(buildLeadTemplateMessage(lead, type))}</textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
      <button class="btn btn-secondary" onclick="sendLeadEmail(${lead.id}, '${type}')" ${lead.email && gmailSenderConnected(selectedGmailSender().email) ? '' : 'disabled'}>✉️ Отправить email</button>
      <a class="btn btn-secondary ${lead.phone ? '' : 'disabled'}" ${lead.phone ? `href="${escapeAttr(whatsappUrl(lead.phone, buildLeadTemplateMessage(lead, type)))}" target="_blank" rel="noopener"` : ''}>💬 WhatsApp</a>
      <a class="btn btn-secondary ${lead.phone ? '' : 'disabled'}" ${lead.phone ? `href="${escapeAttr(viberUrl(lead.phone, buildLeadTemplateMessage(lead, type)))}"` : ''}>📲 Viber</a>
      <button class="btn btn-primary" onclick="closeModal(); setTimeout(() => openLeadDetail(${lead.id}), 50)">Назад к лиду</button>
    </div>
  `);
}

async function openCatalogPingModal(id) {
  try {
    const data = await api(`/api/leads/${id}`);
    const lead = data?.lead;
    if (!lead) return;
    const message = buildLeadTemplateMessage(lead, 'catalog_ping');
    const whatsapp = whatsappUrl(lead.phone, message);
    const viber = viberUrl(lead.phone, message);

    openModal('Запросить обратную связь по КП', `
      <div style="font-size:12px;color:#9ca3af;margin-bottom:10px;">После отправки КП прошло 3+ дня. Можно быстро запросить решение или уточняющие вопросы.</div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Отправить из Gmail-аккаунта</label>
        <select onchange="setGmailSender(this.value);openCatalogPingModal(${lead.id})">
          ${gmailSenderOptions()}
        </select>
      </div>
      <textarea rows="8" style="width:100%;">${escapeHtml(message)}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-secondary" onclick="sendLeadEmail(${lead.id}, 'catalog_ping')" ${lead.email && gmailSenderConnected(selectedGmailSender().email) ? '' : 'disabled'}>✉️ Отправить email</button>
        <button class="btn btn-secondary ${whatsapp ? '' : 'disabled'}" ${whatsapp ? `onclick="markLeadPingAndOpen(${lead.id}, 'whatsapp', '${encodeURIComponent(whatsapp)}')"` : 'disabled'}>💬 WhatsApp</button>
        <button class="btn btn-secondary ${viber ? '' : 'disabled'}" ${viber ? `onclick="markLeadPingAndOpen(${lead.id}, 'viber', '${encodeURIComponent(viber)}')"` : 'disabled'}>📲 Viber</button>
      </div>
    `);
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

async function markLeadPingAndOpen(leadId, channel, encodedUrl) {
  try {
    await api(`/api/leads/${leadId}/ping`, {
      method: 'POST',
      body: {
        channel,
        performed_by: currentRole === 'admin' ? 'admin' : 'manager',
      },
    });
  } catch (err) {
    alert('Грешка: ' + err.message);
    return;
  }

  const url = decodeURIComponent(encodedUrl || '');
  if (url.startsWith('http://') || url.startsWith('https://')) {
    window.open(url, '_blank', 'noopener');
  } else if (url) {
    window.location.href = url;
  }

  closeModal();
  await renderLeads(document.getElementById('main'), currentLeadFilters);
}

function openLeadFormResponsesModal() {
  const responses = currentLeadFormResponses || [];
  openModal('Ответы Google Forms', `
    ${responses.length ? responses.map(r => `
      <div style="padding:14px;border:1px solid rgba(34,197,94,0.22);border-radius:10px;background:rgba(34,197,94,0.06);margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px;">
          <div>
            <div style="font-weight:800;color:#ddd;">${r.spreadsheet_title || 'Google Form'} · ${r.sheet_name}</div>
            <div style="font-size:11px;color:#777;margin-top:4px;">${r.submitted_at ? formatDateTime(r.submitted_at) : formatDateTime(r.synced_at)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <span class="badge badge-qualified">${r.form_type === 'materials' ? 'Материалы' : (r.form_type || 'Форма')}</span>
            <span class="badge badge-new">${r.email || r.phone || 'ответ'}</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
          ${formatFormAnswers(r.answers).map(item => `
            <div style="padding:9px;border-radius:8px;background:rgba(255,255,255,0.04);">
              <div style="font-size:10px;color:#777;text-transform:uppercase;line-height:1.25;">${item.key}</div>
              <div style="font-size:12px;color:#ddd;margin-top:4px;line-height:1.35;">${item.value}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('') : '<div style="color:#777;font-size:13px;">Ответов формы по этому лиду пока нет.</div>'}
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Закрыть</button>
    </div>
  `);
}

async function saveLeadComment(id) {
  const textarea = document.getElementById('ld-comment');
  const result = document.getElementById('ld-comment-result');
  const comment = textarea?.value.trim();
  if (!comment) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ Напишите комментарий.';
    }
    return;
  }

  if (result) {
    result.className = 'sync-result show';
    result.textContent = 'Сохраняю комментарий...';
  }

  try {
    await api(`/api/leads/${id}/comments`, {
      method: 'POST',
      body: {
        comment,
        performed_by: currentRole === 'admin' ? 'admin' : 'manager',
      },
    });
    await openLeadDetail(id);
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ ' + err.message;
    } else {
      alert('Грешка: ' + err.message);
    }
  }
}

async function deleteLeadComment(leadId, commentId) {
  if (!confirm('Удалить комментарий?')) return;
  try {
    await api(`/api/leads/${leadId}/comments/${commentId}`, { method: 'DELETE' });
    await openLeadDetail(leadId);
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

function openQualificationHistoryModal() {
  const activities = currentLeadQualificationActivities || [];
  openModal('История опросника', `
    <div style="font-size:12px;color:#aeb4c2;margin-bottom:14px;">
      Здесь показаны все сохранённые версии опросника из БД. Это помогает увидеть, что менеджер заполнял раньше, даже если текущая форма уже изменилась.
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${activities.length ? activities.map(activity => {
        const entry = formatQualificationHistoryEntry(activity);
        return `
          <div style="padding:14px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;background:rgba(255,255,255,0.03);">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px;">
              <div>
                <div style="font-size:12px;font-weight:800;color:#e5e7eb;">${leadActivityLabel('qualification')} · ${entry.typeLabel}</div>
                <div style="font-size:11px;color:#9ca3af;margin-top:4px;">${new Date(activity.created_at).toLocaleString('bg-BG')}${activity.performed_by ? ` · ${activity.performed_by}` : ''}</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#d6dae3;line-height:1.5;">
              ${entry.lines.map(line => `<div>${escapeHtml(line)}</div>`).join('')}
            </div>
          </div>
        `;
      }).join('') : `
        <div class="worker-activity-empty">Сохранённых версий опросника пока нет.</div>
      `}
    </div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Закрыть</button>
    </div>
  `);
}

async function updateLead(id) {
  const data = {
    company_name: document.getElementById('ld-company').value,
    contact_name: document.getElementById('ld-contact').value,
    email: document.getElementById('ld-email').value,
    phone: document.getElementById('ld-phone').value,
    city: document.getElementById('ld-city').value,
    crm_segment: document.getElementById('ld-crm-segment')?.value || 'objects',
    status: document.getElementById('ld-status').value,
    priority: document.getElementById('ld-priority').value,
    premium_manual: document.getElementById('ld-premium-manual')?.checked || false,
    estimated_value: parseFloat(document.getElementById('ld-value').value) || null,
    next_followup_at: combineDateAndTime('ld-followup-date', 'ld-followup-time'),
    notes: document.getElementById('ld-notes').value,
    performed_by: currentRole === 'admin' ? 'admin' : 'manager',
  };
  try {
    await api(`/api/leads/${id}`, { method: 'PUT', body: data });
    closeModal();
    navigate(currentPage);
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

function refreshLeadStatusOptions() {
  const segment = document.getElementById('ld-crm-segment')?.value || 'objects';
  const select = document.getElementById('ld-status');
  if (!select) return;
  const stages = segment === 'distributor' ? DISTRIBUTOR_CRM_STAGES : OBJECT_CRM_STAGES;
  const current = select.value;
  select.innerHTML = stages.map(status => `<option value="${status}">${statusLabel(status)}</option>`).join('');
  select.value = stages.includes(current) ? current : stages[0];
}

async function inlineUpdateLeadStatus(id, status, event) {
  event?.stopPropagation?.();
  const select = event?.target;
  const previous = select?.dataset?.previousValue || '';

  if (select) {
    select.disabled = true;
  }

  try {
    await api(`/api/leads/${id}`, {
      method: 'PUT',
      body: {
        status,
        performed_by: currentRole === 'admin' ? 'admin' : 'manager',
      },
    });
    await renderLeads(document.getElementById('main'), currentLeadFilters);
  } catch (err) {
    if (select && previous) {
      select.value = previous;
    }
    alert('Грешка: ' + err.message);
  } finally {
    if (select) {
      select.disabled = false;
      select.dataset.previousValue = status;
    }
  }
}

async function deleteLead(id) {
  if (!confirm('Наистина ли искате да изтриете този лид?')) return;
  try {
    await api(`/api/leads/${id}`, { method: 'DELETE' });
    closeModal();
    navigate('leads');
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

async function openOfferModal(leadId) {
  if (currentRole !== 'admin') {
    alert('Admin access required');
    return;
  }

  try {
    const [leadData, products] = await Promise.all([
      api(`/api/leads/${leadId}`),
      api('/api/dashboard/products'),
    ]);
    currentOfferDraft = {
      lead: leadData.lead,
      items: [],
      currency: 'EUR',
      discount_pct: 0,
      valid_until: '',
      notes: '',
      products: products || [],
    };

    openModal(`КП за ${leadData.lead.company_name || ('Лид #' + leadId)}`, `
      <div id="offer-modal-content">
        <div class="form-grid">
          <div class="form-group"><label>Валута</label><select id="offer-currency" onchange="renderOfferDraft()">
            ${['EUR', 'USD', 'BGN'].map(c => `<option value="${c}" ${currentOfferDraft.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select></div>
          <div class="form-group"><label>Отстъпка %</label><input id="offer-discount" type="number" min="0" max="100" value="0" oninput="renderOfferDraft()"></div>
          <div class="form-group"><label>Валидно до</label><input id="offer-valid-until" type="date"></div>
          <div class="form-group full"><label>Бележки</label><textarea id="offer-notes" rows="2" placeholder="Условия, срокове, доставка..."></textarea></div>
        </div>

        <div style="margin-top:14px;">
          <div class="card-title" style="font-size:12px;">Выбери продукти и въведи цена ръчно</div>
          <div class="table-wrap" style="max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:10px;">
            <table>
              <thead>
                <tr><th>Продукт</th><th>Категория</th><th>К-во</th><th>Цена</th><th></th></tr>
              </thead>
              <tbody>
                ${currentOfferDraft.products.map((p) => `
                  <tr>
                    <td style="font-weight:600;color:#ddd;">${p.name_bg || p.name}</td>
                    <td style="color:#888;">${p.category}</td>
                    <td style="width:80px;"><input id="offer-qty-${p.id}" type="number" min="1" value="1" style="width:72px;"></td>
                    <td style="width:120px;"><input id="offer-price-${p.id}" type="number" min="0" step="0.01" value="${Number(p.price_per_kg || 0) || ''}" style="width:100px;"></td>
                    <td><button class="btn btn-secondary btn-sm" onclick="addOfferItem(${p.id})">Добави</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="card-title" style="font-size:12px;">Избрани позиции</div>
          <div id="offer-selected-items" class="offer-selected-items"></div>
          <div id="offer-total-box" style="margin-top:8px;font-weight:700;color:#ddd;"></div>
        </div>

        <div id="offer-result" class="sync-result"></div>
        <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
          <button class="btn btn-secondary" onclick="closeModal()">Отказ</button>
          <button class="btn btn-primary" onclick="saveOffer(${leadId})">📄 Създай КП (PDF)</button>
        </div>
      </div>
    `);
    renderOfferDraft();
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

function addOfferItem(productId) {
  if (!currentOfferDraft) return;
  const product = currentOfferDraft.products.find((p) => Number(p.id) === Number(productId));
  if (!product) return;
  const quantity = Number(document.getElementById(`offer-qty-${productId}`)?.value || 1);
  const unit_price = Number(document.getElementById(`offer-price-${productId}`)?.value || 0);
  if (quantity <= 0 || unit_price <= 0) {
    alert('Въведи количество и цена повече от 0.');
    return;
  }

  currentOfferDraft.items.push({
    product_id: product.id,
    sku: product.sku,
    name: product.name_bg || product.name,
    category: product.category,
    quantity,
    unit_price,
    currency: currentOfferDraft.currency,
  });
  renderOfferDraft();
}

function removeOfferItem(index) {
  if (!currentOfferDraft) return;
  currentOfferDraft.items.splice(index, 1);
  renderOfferDraft();
}

function renderOfferDraft() {
  const itemsEl = document.getElementById('offer-selected-items');
  const totalEl = document.getElementById('offer-total-box');
  if (!itemsEl || !totalEl || !currentOfferDraft) return;
  const items = currentOfferDraft.items;
  const currency = document.getElementById('offer-currency')?.value || currentOfferDraft.currency || 'EUR';
  currentOfferDraft.currency = currency;
  const discount = Number(document.getElementById('offer-discount')?.value || currentOfferDraft.discount_pct || 0);
  currentOfferDraft.discount_pct = discount;
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const total = subtotal - (subtotal * discount / 100);

  itemsEl.innerHTML = items.length ? items.map((item, index) => `
    <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:700;color:#ddd;">${item.name}</div>
        <div style="font-size:11px;color:#888;">${item.quantity} × ${Number(item.unit_price).toLocaleString()} ${item.currency || currency}</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="removeOfferItem(${index})">✕</button>
    </div>
  `).join('') : '<div style="font-size:12px;color:#777;">Добави поне един продукт.</div>';

  totalEl.textContent = `Subtotal: ${subtotal.toLocaleString()} ${currency} · Total: ${total.toLocaleString()} ${currency}`;
}

async function saveOffer(leadId) {
  const result = document.getElementById('offer-result');
  if (!currentOfferDraft || !currentOfferDraft.items.length) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = 'Добави поне един продукт в КП.';
    }
    return;
  }

  const payload = {
    lead_id: leadId,
    items: currentOfferDraft.items,
    currency: document.getElementById('offer-currency')?.value || currentOfferDraft.currency || 'EUR',
    discount_pct: Number(document.getElementById('offer-discount')?.value || 0),
    valid_until: document.getElementById('offer-valid-until')?.value || '',
    notes: document.getElementById('offer-notes')?.value || '',
    status: 'sent',
  };

  if (result) {
    result.className = 'sync-result show';
    result.textContent = 'Създавам КП и PDF...';
  }

  try {
    const res = await api('/api/offers', { method: 'POST', body: payload });
    if (result) {
      result.className = 'sync-result show ok';
      result.textContent = `✅ ${res.offer.offer_number} е готово.`;
    }
    if (res.pdf_base64) {
      openPdfFromBase64(res.pdf_base64, res.pdf_filename || `${res.offer.offer_number}.pdf`);
    }
    setTimeout(() => openLeadDetail(leadId), 800);
  } catch (err) {
    if (result) {
      result.className = 'sync-result show err';
      result.textContent = '❌ ' + err.message;
    } else {
      alert('Грешка: ' + err.message);
    }
  }
}

// ===== OFFERS =====
async function renderOffers(el) {
  const [offerData, leadData] = await Promise.all([
    api('/api/offers?limit=100').catch(() => ({ offers: [] })),
    api('/api/leads?limit=200').catch(() => ({ leads: [] })),
  ]);
  const offers = offerData.offers || [];
  const leads = leadData.leads || [];
  const offerLeadIds = new Set(offers.map(o => Number(o.lead_id)));
  const candidateLeads = leads
    .filter(l => !offerLeadIds.has(Number(l.id)) && !['won', 'lost'].includes(l.status))
    .slice(0, 20);

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>📄 Коммерческие предложения</h2>
      <div class="page-header-actions">
        <button class="btn btn-secondary" onclick="navigate('leads')">👥 Клиенты</button>
      </div>
    </div>

    <div class="stats-grid fade-in">
      <div class="stat-card"><div class="stat-label">Всего КП</div><div class="stat-value">${offers.length}</div></div>
      <div class="stat-card"><div class="stat-label">Отправлено</div><div class="stat-value">${offers.filter(o => o.status === 'sent').length}</div></div>
      <div class="stat-card"><div class="stat-label">Сумма</div><div class="stat-value">${Math.round(offers.reduce((sum, o) => sum + Number(o.total || 0), 0)).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Кандидаты</div><div class="stat-value">${candidateLeads.length}</div></div>
    </div>

    <div class="card fade-in" style="margin-top:18px;">
      <div class="card-title">Создать КП по лиду</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Клиент</th><th>Контакт</th><th>Статус</th><th>Интерес</th><th></th></tr></thead>
          <tbody>
            ${candidateLeads.length ? candidateLeads.map(l => `
              <tr>
                <td style="font-weight:700;color:#ddd;">${l.company_name || '—'}</td>
                <td>${l.contact_name || l.phone || l.email || '—'}</td>
                <td><span class="badge badge-${l.status}">${statusLabel(l.status)}</span></td>
                <td style="max-width:260px;color:#9ca3af;font-size:12px;">${l.interest_products || l.lead_type || '—'}</td>
                <td style="text-align:right;">
                  <button class="btn btn-secondary btn-sm" onclick="openLeadDetail(${l.id})">👁</button>
                  <button class="btn btn-primary btn-sm" onclick="openOfferModal(${l.id})">Создать КП</button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center;color:#777;padding:22px;">Нет активных лидов без КП.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card fade-in" style="margin-top:18px;">
      <div class="card-title">История КП</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Номер</th><th>Клиент</th><th>Сумма</th><th>Статус лида</th><th>Дата</th><th></th></tr></thead>
          <tbody>
            ${offers.length ? offers.map(o => `
              <tr>
                <td style="font-weight:800;color:var(--brand-light);">${o.offer_number}</td>
                <td>
                  <div style="font-weight:700;color:#ddd;">${o.company_name || '—'}</div>
                  <div style="font-size:11px;color:#777;">${o.contact_name || o.phone || o.email || ''}</div>
                </td>
                <td style="font-weight:700;color:var(--green);">${Number(o.total || 0).toLocaleString()} ${o.currency || 'EUR'}</td>
                <td><span class="badge badge-${o.lead_status || 'offer_sent'}">${statusLabel(o.lead_status || 'offer_sent')}</span></td>
                <td style="color:#888;font-size:12px;">${formatDateTime(o.created_at)}</td>
                <td style="text-align:right;">
                  <button class="btn btn-secondary btn-sm" onclick="openLeadDetail(${o.lead_id})">Лид</button>
                  <button class="btn btn-primary btn-sm" onclick="downloadOfferPdf(${o.id})">PDF</button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center;color:#777;padding:22px;">КП пока не создавались.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function projectStatusLabel(status) {
  return ({
    new: 'Новый проект',
    discovery: 'Сбор данных',
    estimate: 'Оценка стоимости',
    offer_preparation: 'Подбор материалов',
    offer_sent: 'КП отправлено',
    waiting_client: 'Ждём клиента',
    approved: 'Согласовано',
    archived: 'Архив',
  })[status] || status || '—';
}

function projectStatusBadge(status) {
  const map = {
    new: 'badge-new',
    discovery: 'badge-needs_discovery',
    estimate: 'badge-thinking',
    offer_preparation: 'badge-catalog_sent',
    offer_sent: 'badge-offer_sent',
    waiting_client: 'badge-negotiation',
    approved: 'badge-won',
    archived: 'badge-low',
  };
  return map[status] || 'badge-medium';
}

async function renderProjects(el) {
  const query = currentProjectFilters?.q || '';
  const status = currentProjectFilters?.status || '';
  const qs = new URLSearchParams();
  if (query) qs.set('q', query);
  if (status) qs.set('status', status);
  const [data, meta] = await Promise.all([
    api(`/api/projects${qs.toString() ? `?${qs.toString()}` : ''}`),
    api('/api/projects/meta').catch(() => ({ leads: [] })),
  ]);
  const rows = data.rows || [];
  const summary = data.summary || {};
  const leads = meta.leads || [];
  const contractors = meta.contractors || [];

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>🏗️ Проекты</h2>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick='openProjectModal(${JSON.stringify(leads).replace(/'/g, "&apos;")}, ${JSON.stringify(contractors).replace(/'/g, "&apos;")})'>+ Новый проект</button>
      </div>
    </div>

    <div class="stats-grid fade-in">
      <div class="stat-card"><div class="stat-label">Всего проектов</div><div class="stat-value">${summary.total || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Активные</div><div class="stat-value blue">${summary.active || 0}</div></div>
      <div class="stat-card"><div class="stat-label">На оценке</div><div class="stat-value yellow">${summary.estimate || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Согласовано</div><div class="stat-value green">${summary.approved || 0}</div></div>
    </div>

    <div class="card fade-in" style="margin-top:18px;">
      <div class="card-title">База объектов и проектов по материалам</div>
      <div class="search-bar" style="margin-bottom:14px;">
        <input
          placeholder="Поиск по проекту, клиенту, городу, типу объекта, проблеме..."
          value="${escapeAttr(query)}"
          oninput="currentProjectFilters = {...currentProjectFilters, q: this.value}"
          onkeydown="if(event.key==='Enter'){renderProjects(document.getElementById('main'))}"
        >
        <select onchange="currentProjectFilters = {...currentProjectFilters, status: this.value}; renderProjects(document.getElementById('main'))">
          <option value="">Все статусы</option>
          ${['new','discovery','estimate','offer_preparation','offer_sent','waiting_client','approved','archived'].map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${projectStatusLabel(s)}</option>`).join('')}
        </select>
        <button class="btn btn-secondary" onclick="renderProjects(document.getElementById('main'))">Поиск</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Проект</th>
              <th>Клиент</th>
              <th>Объект / город</th>
              <th>Проблема</th>
              <th>Материалы</th>
              <th>Подрядчик</th>
              <th>Статус</th>
              <th>След. шаг</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(r => `
              <tr>
                <td>
                  <div style="font-weight:700;color:#e5e7eb;">${escapeHtml(r.title || '—')}</div>
                  <div style="font-size:11px;color:#777;">${escapeHtml(r.site_address || '')}</div>
                </td>
                <td>
                  <div style="font-weight:600;color:#ddd;">${escapeHtml(r.client_name || r.lead_company_name || '—')}</div>
                  <div style="font-size:11px;color:#777;">${escapeHtml(r.contact_name || r.lead_contact_name || '')}</div>
                </td>
                <td>
                  <div>${escapeHtml(r.object_type || '—')}</div>
                  <div style="font-size:11px;color:#777;">${escapeHtml(r.city || '—')}${r.approximate_area_m2 ? ` · ~${escapeHtml(r.approximate_area_m2)} м²` : ''}</div>
                </td>
                <td style="max-width:220px;">
                  <div style="color:#cbd5e1;">${escapeHtml((r.problem_description || '—').slice(0, 140))}${(r.problem_description || '').length > 140 ? '…' : ''}</div>
                </td>
                <td style="max-width:220px;">
                  <div style="color:#cbd5e1;">${escapeHtml((r.materials_needed || '—').slice(0, 120))}${(r.materials_needed || '').length > 120 ? '…' : ''}</div>
                </td>
                <td style="min-width:180px;">
                  <button class="btn btn-secondary btn-sm" onclick='openProjectContractorModal(${JSON.stringify(contractors).replace(/'/g, "&apos;")}, ${JSON.stringify(r).replace(/'/g, "&apos;")})'>
                    ${r.contractor_required ? `🦺 ${escapeHtml(r.contractor_name || r.contractor_company || 'Нужен подрядчик')}` : '🦺 Подрядчик'}
                  </button>
                </td>
                <td><span class="badge ${projectStatusBadge(r.status)}">${projectStatusLabel(r.status)}</span></td>
                <td style="max-width:180px;">${escapeHtml(r.next_step || '—')}</td>
                <td><button class="btn btn-secondary btn-sm" onclick='openProjectModal(${JSON.stringify(leads).replace(/'/g, "&apos;")}, ${JSON.stringify(contractors).replace(/'/g, "&apos;")}, ${JSON.stringify(r).replace(/'/g, "&apos;")})'>Редактировать</button></td>
              </tr>
            `).join('') : '<tr><td colspan="9" style="text-align:center;color:#777;padding:24px;">Пока нет проектов. Создайте первый объект.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openProjectModal(leads = [], contractors = [], record = null) {
  const r = record || {};
  const photos = Array.isArray(r.project_photos) ? r.project_photos : [];
  openModal(record ? 'Редактировать проект' : 'Новый проект', `
    <div class="form-grid">
      <div class="form-group"><label>Название проекта</label><input id="pr-title" value="${escapeHtml(r.title || '')}" placeholder="Например: Паркинг Mall Sofia / Инъектирование трещин"></div>
      <div class="form-group"><label>Связанный клиент / лид</label>
        <select id="pr-lead-id" onchange='fillProjectLeadData(${JSON.stringify(leads).replace(/'/g, "&apos;")})'>
          <option value="">Без привязки</option>
          ${leads.map(l => `<option value="${l.id}" ${Number(r.lead_id) === Number(l.id) ? 'selected' : ''}>${escapeHtml(l.company_name || l.contact_name || ('Лид #' + l.id))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Клиент</label><input id="pr-client-name" value="${escapeHtml(r.client_name || r.lead_company_name || '')}"></div>
      <div class="form-group"><label>Контакт</label><input id="pr-contact-name" value="${escapeHtml(r.contact_name || r.lead_contact_name || '')}"></div>
      <div class="form-group"><label>Телефон</label><input id="pr-phone" value="${escapeHtml(r.phone || '')}"></div>
      <div class="form-group"><label>Email</label><input id="pr-email" value="${escapeHtml(r.email || '')}"></div>
      <div class="form-group"><label>Город</label><input id="pr-city" value="${escapeHtml(r.city || '')}"></div>
      <div class="form-group"><label>Адрес объекта</label><input id="pr-site-address" value="${escapeHtml(r.site_address || '')}" placeholder="Адрес, локация, ориентир"></div>
      <div class="form-group"><label>Тип объекта</label><input id="pr-object-type" value="${escapeHtml(r.object_type || '')}" placeholder="Подземный паркинг, подвал, цех, фасад..."></div>
      <div class="form-group"><label>Примерно м²</label><input id="pr-approximate-area" value="${escapeHtml(r.approximate_area_m2 || '')}" placeholder="Например: 120-150"></div>
      <div class="form-group"><label>Статус проекта</label>
        <select id="pr-status">
          ${['new','discovery','estimate','offer_preparation','offer_sent','waiting_client','approved','archived'].map(s => `<option value="${s}" ${String(r.status || 'new') === s ? 'selected' : ''}>${projectStatusLabel(s)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Валюта</label><input value="EUR" disabled></div>
      <div class="form-group full" style="padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,0.02);">
        <label style="display:flex;align-items:center;gap:10px;margin:0 0 10px;">
          <input id="pr-contractor-required" type="checkbox" ${r.contractor_required ? 'checked' : ''} onchange="toggleProjectContractorFields()">
          <span><strong>Нужен подрядчик</strong></span>
        </label>
        <div id="pr-contractor-fields" ${r.contractor_required ? '' : 'style="display:none;"'}>
          <div class="form-grid">
            <div class="form-group">
              <label>Подрядчик из базы</label>
              <select id="pr-contractor-id" onchange='fillProjectContractorData(${JSON.stringify(contractors).replace(/'/g, "&apos;")})'>
                <option value="">Выбрать подрядчика</option>
                ${contractors.map(c => `<option value="${c.id}" ${Number(r.contractor_id) === Number(c.id) ? 'selected' : ''}>${escapeHtml(c.company_name || '')}${c.city ? ` · ${escapeHtml(c.city)}` : ''}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Компания подрядчика</label>
              <input id="pr-contractor-company" value="${escapeAttr(r.contractor_company || r.contractor_name || '')}" placeholder="Если не из базы, впишите вручную">
            </div>
            <div class="form-group full">
              <label>Комментарий по подрядчику</label>
              <textarea id="pr-contractor-notes" rows="2" placeholder="Кто выполняет работу, договоренности, комментарии...">${escapeHtml(r.contractor_notes || '')}</textarea>
            </div>
          </div>
        </div>
      </div>
      <div class="form-group full"><label>Проблема / дефект</label><textarea id="pr-problem-description" rows="3" placeholder="Течове, пукнатини, влага, вода през шевове, нужда от инжектиране...">${escapeHtml(r.problem_description || '')}</textarea></div>
      <div class="form-group full"><label>Объём работ / оценка ремонта</label><textarea id="pr-repair-scope" rows="3" placeholder="м², линейные метры, количество проходов, ориентировочный объём...">${escapeHtml(r.repair_scope || '')}</textarea></div>
      <div class="form-group full"><label>Ответы на вопросы клиента</label><textarea id="pr-client-answers" rows="4" placeholder="Сюда можно заносить ответы клиента: тип объекта, сроки, кто выполняет работы, что именно болит, какие фото прислал...">${escapeHtml(r.client_answers || '')}</textarea></div>
      <div class="form-group full"><label>Материалы / решение</label><textarea id="pr-materials-needed" rows="3" placeholder="Какие материалы предполагаются: смолы, пакеры, гидроизоляция, ремонтные составы...">${escapeHtml(r.materials_needed || '')}</textarea></div>
      <div class="form-group full"><label>Фото / ссылки / файлы</label><textarea id="pr-photos-info" rows="2" placeholder="Ссылки на фото, Google Drive, короткое описание фото объекта...">${escapeHtml(r.photos_info || '')}</textarea></div>
      <div class="form-group full">
        <label>Загрузить фотографии</label>
        <input id="pr-photo-files" type="file" accept="image/*" multiple>
      </div>
      <div class="form-group full">
        <label>Галерея проекта</label>
        <div id="pr-gallery" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;">
          ${photos.length ? photos.map(photo => `
            <a href="${escapeAttr(photo.url)}" target="_blank" style="display:block;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:rgba(255,255,255,0.03);text-decoration:none;">
              <img src="${escapeAttr(photo.url)}" alt="${escapeAttr(photo.name || 'photo')}" style="width:100%;height:90px;object-fit:cover;display:block;">
              <div style="padding:6px 8px;font-size:11px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(photo.name || 'photo')}</div>
            </a>
          `).join('') : '<div style="font-size:12px;color:#777;">Пока фото не загружены.</div>'}
        </div>
      </div>
      <div class="form-group full"><label>Следующий шаг</label><textarea id="pr-next-step" rows="2" placeholder="Что нужно сделать дальше: выезд, расчёт, подбор решения, отправить КП...">${escapeHtml(r.next_step || '')}</textarea></div>
      <div class="form-group full"><label>Внутренние заметки</label><textarea id="pr-notes" rows="3" placeholder="Дополнительные данные по проекту, проблемам, комментарии менеджера...">${escapeHtml(r.notes || '')}</textarea></div>
    </div>
    <div id="pr-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveProjectRecord(${r.id || 'null'})">Сохранить проект</button>
    </div>
  `);
}

function fillProjectLeadData(leads = []) {
  const leadId = Number(document.getElementById('pr-lead-id')?.value || 0);
  const lead = (leads || []).find(item => Number(item.id) === leadId);
  if (!lead) return;
  const company = document.getElementById('pr-client-name');
  const contact = document.getElementById('pr-contact-name');
  const phone = document.getElementById('pr-phone');
  const email = document.getElementById('pr-email');
  const city = document.getElementById('pr-city');
  if (company && !company.value) company.value = lead.company_name || '';
  if (contact && !contact.value) contact.value = lead.contact_name || '';
  if (phone && !phone.value) phone.value = lead.phone || '';
  if (email && !email.value) email.value = lead.email || '';
  if (city && !city.value) city.value = lead.city || '';
}

function toggleProjectContractorFields() {
  const checked = document.getElementById('pr-contractor-required')?.checked;
  const wrap = document.getElementById('pr-contractor-fields');
  if (wrap) wrap.style.display = checked ? '' : 'none';
}

function fillProjectContractorData(contractors = []) {
  const contractorId = Number(document.getElementById('pr-contractor-id')?.value || 0);
  const contractor = (contractors || []).find(item => Number(item.id) === contractorId);
  if (!contractor) return;
  const company = document.getElementById('pr-contractor-company');
  const notes = document.getElementById('pr-contractor-notes');
  if (company && !company.value) company.value = contractor.company_name || '';
  if (notes && !notes.value) {
    notes.value = [
      contractor.contact_name ? `Контакт: ${contractor.contact_name}` : '',
      contractor.phone ? `Телефон: ${contractor.phone}` : '',
      contractor.email ? `Email: ${contractor.email}` : '',
      contractor.specialties ? `Специализация: ${contractor.specialties}` : '',
    ].filter(Boolean).join('\n');
  }
}

function openProjectContractorModal(contractors = [], record = {}) {
  openModal(`Подрядчик · ${record.title || record.client_name || 'Проект'}`, `
    <div class="form-group full">
      <label style="display:flex;align-items:center;gap:10px;">
        <input id="quick-project-contractor-required" type="checkbox" ${record.contractor_required ? 'checked' : ''} onchange="document.getElementById('quick-project-contractor-fields').style.display = this.checked ? '' : 'none'">
        <span>Нужен подрядчик на выполнение работ</span>
      </label>
    </div>
    <div id="quick-project-contractor-fields" ${record.contractor_required ? '' : 'style="display:none;"'}>
      <div class="form-grid">
        <div class="form-group">
          <label>Подрядчик из базы</label>
          <select id="quick-project-contractor-id" onchange='fillQuickProjectContractorData(${JSON.stringify(contractors).replace(/'/g, "&apos;")})'>
            <option value="">Выбрать подрядчика</option>
            ${contractors.map(c => `<option value="${c.id}" ${Number(record.contractor_id) === Number(c.id) ? 'selected' : ''}>${escapeHtml(c.company_name || '')}${c.city ? ` · ${escapeHtml(c.city)}` : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Компания подрядчика</label>
          <input id="quick-project-contractor-company" value="${escapeAttr(record.contractor_company || record.contractor_name || '')}" placeholder="Название компании">
        </div>
        <div class="form-group full">
          <label>Комментарий</label>
          <textarea id="quick-project-contractor-notes" rows="3" placeholder="Что делает подрядчик, этап, договоренности...">${escapeHtml(record.contractor_notes || '')}</textarea>
        </div>
      </div>
    </div>
    <div id="quick-project-contractor-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveQuickProjectContractor(${record.id || 'null'})">Сохранить</button>
    </div>
  `);
}

function fillQuickProjectContractorData(contractors = []) {
  const contractorId = Number(document.getElementById('quick-project-contractor-id')?.value || 0);
  const contractor = (contractors || []).find(item => Number(item.id) === contractorId);
  if (!contractor) return;
  const company = document.getElementById('quick-project-contractor-company');
  const notes = document.getElementById('quick-project-contractor-notes');
  if (company && !company.value) company.value = contractor.company_name || '';
  if (notes && !notes.value) {
    notes.value = [
      contractor.contact_name ? `Контакт: ${contractor.contact_name}` : '',
      contractor.phone ? `Телефон: ${contractor.phone}` : '',
      contractor.email ? `Email: ${contractor.email}` : '',
      contractor.specialties ? `Специализация: ${contractor.specialties}` : '',
    ].filter(Boolean).join('\n');
  }
}

async function saveQuickProjectContractor(projectId) {
  const result = document.getElementById('quick-project-contractor-result');
  result.className = 'sync-result show';
  result.textContent = 'Сохраняю подрядчика...';
  try {
    const project = await api(`/api/projects/${projectId}`);
    await api(`/api/projects/${projectId}`, {
      method: 'PUT',
      body: {
        ...project,
        contractor_required: document.getElementById('quick-project-contractor-required')?.checked || false,
        contractor_id: document.getElementById('quick-project-contractor-id')?.value || null,
        contractor_company: document.getElementById('quick-project-contractor-company')?.value || '',
        contractor_notes: document.getElementById('quick-project-contractor-notes')?.value || '',
      },
    });
    closeModal();
    navigate('projects');
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = `❌ ${err.message}`;
  }
}

async function saveProjectRecord(id = null) {
  const payload = {
    title: document.getElementById('pr-title')?.value || '',
    lead_id: document.getElementById('pr-lead-id')?.value || null,
    client_name: document.getElementById('pr-client-name')?.value || '',
    contact_name: document.getElementById('pr-contact-name')?.value || '',
    phone: document.getElementById('pr-phone')?.value || '',
    email: document.getElementById('pr-email')?.value || '',
    city: document.getElementById('pr-city')?.value || '',
    site_address: document.getElementById('pr-site-address')?.value || '',
    object_type: document.getElementById('pr-object-type')?.value || '',
    approximate_area_m2: document.getElementById('pr-approximate-area')?.value || '',
    problem_description: document.getElementById('pr-problem-description')?.value || '',
    repair_scope: document.getElementById('pr-repair-scope')?.value || '',
    client_answers: document.getElementById('pr-client-answers')?.value || '',
    materials_needed: document.getElementById('pr-materials-needed')?.value || '',
    photos_info: document.getElementById('pr-photos-info')?.value || '',
    contractor_required: document.getElementById('pr-contractor-required')?.checked || false,
    contractor_id: document.getElementById('pr-contractor-id')?.value || null,
    contractor_company: document.getElementById('pr-contractor-company')?.value || '',
    contractor_notes: document.getElementById('pr-contractor-notes')?.value || '',
    estimated_value: 0,
    currency: 'EUR',
    status: document.getElementById('pr-status')?.value || 'new',
    next_step: document.getElementById('pr-next-step')?.value || '',
    notes: document.getElementById('pr-notes')?.value || '',
  };
  const result = document.getElementById('pr-result');
  result.className = 'sync-result show';
  result.textContent = 'Сохранение проекта...';
  try {
    const path = id ? `/api/projects/${id}` : '/api/projects';
    const method = id ? 'PUT' : 'POST';
    const project = await api(path, { method, body: payload });
    await uploadProjectPhotos(project.id);
    closeModal();
    navigate('projects');
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = `❌ ${err.message}`;
  }
}

async function uploadProjectPhotos(projectId) {
  const input = document.getElementById('pr-photo-files');
  const files = input?.files ? Array.from(input.files) : [];
  if (!files.length) return;
  const formData = new FormData();
  files.forEach(file => formData.append('photos', file));
  const res = await fetch(`${API}/api/projects/${projectId}/photos`, {
    method: 'POST',
    headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function renderContractors(el) {
  const query = currentContractorFilters?.q || '';
  const active = currentContractorFilters?.active || '1';
  const qs = new URLSearchParams();
  if (query) qs.set('q', query);
  if (active !== '') qs.set('active', active);
  const data = await api(`/api/contractors${qs.toString() ? `?${qs.toString()}` : ''}`);
  const rows = data.rows || [];
  const summary = data.summary || {};

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>🦺 Подрядчики</h2>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="openContractorModal()">+ Новый подрядчик</button>
      </div>
    </div>

    <div class="stats-grid fade-in">
      <div class="stat-card"><div class="stat-label">Всего</div><div class="stat-value">${summary.total || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Активные</div><div class="stat-value green">${summary.active || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Неактивные</div><div class="stat-value">${summary.inactive || 0}</div></div>
    </div>

    <div class="card fade-in" style="margin-top:18px;">
      <div class="card-title">База подрядчиков</div>
      <div class="search-bar" style="margin-bottom:14px;">
        <input
          placeholder="Поиск по компании, городу, специализации, контакту..."
          value="${escapeAttr(query)}"
          oninput="currentContractorFilters = {...currentContractorFilters, q: this.value}"
          onkeydown="if(event.key==='Enter'){renderContractors(document.getElementById('main'))}"
        >
        <select onchange="currentContractorFilters = {...currentContractorFilters, active: this.value}; renderContractors(document.getElementById('main'))">
          <option value="1" ${active === '1' ? 'selected' : ''}>Только активные</option>
          <option value="" ${active === '' ? 'selected' : ''}>Все</option>
          <option value="0" ${active === '0' ? 'selected' : ''}>Только неактивные</option>
        </select>
        <button class="btn btn-secondary" onclick="renderContractors(document.getElementById('main'))">Поиск</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Компания</th>
              <th>Контакт</th>
              <th>Город / регионы</th>
              <th>Специализация</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(r => `
              <tr>
                <td><div style="font-weight:700;color:#e5e7eb;">${escapeHtml(r.company_name || '—')}</div><div style="font-size:11px;color:#777;">${escapeHtml(r.email || '')}</div></td>
                <td><div>${escapeHtml(r.contact_name || '—')}</div><div style="font-size:11px;color:#777;">${escapeHtml(r.phone || '')}</div></td>
                <td><div>${escapeHtml(r.city || '—')}</div><div style="font-size:11px;color:#777;">${escapeHtml(r.regions || '')}</div></td>
                <td style="max-width:240px;">${escapeHtml(r.specialties || '—')}</td>
                <td><span class="badge ${r.is_active ? 'badge-won' : 'badge-low'}">${r.is_active ? 'Активный' : 'Неактивный'}</span></td>
                <td><button class="btn btn-secondary btn-sm" onclick='openContractorModal(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Редактировать</button></td>
              </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center;color:#777;padding:24px;">Пока нет подрядчиков.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openContractorModal(record = null) {
  const r = record || {};
  openModal(record ? 'Редактировать подрядчика' : 'Новый подрядчик', `
    <div class="form-grid">
      <div class="form-group"><label>Компания</label><input id="ct-company-name" value="${escapeAttr(r.company_name || '')}" placeholder="Название компании"></div>
      <div class="form-group"><label>Контакт</label><input id="ct-contact-name" value="${escapeAttr(r.contact_name || '')}" placeholder="Имя контакта"></div>
      <div class="form-group"><label>Телефон</label><input id="ct-phone" value="${escapeAttr(r.phone || '')}"></div>
      <div class="form-group"><label>Email</label><input id="ct-email" value="${escapeAttr(r.email || '')}"></div>
      <div class="form-group"><label>Город</label><input id="ct-city" value="${escapeAttr(r.city || '')}"></div>
      <div class="form-group"><label>Регионы</label><input id="ct-regions" value="${escapeAttr(r.regions || '')}" placeholder="София, Пловдив, Варна..."></div>
      <div class="form-group full"><label>Специализация</label><textarea id="ct-specialties" rows="3" placeholder="Инъектирование, гидроизоляция, ремонт бетона...">${escapeHtml(r.specialties || '')}</textarea></div>
      <div class="form-group full"><label>Заметки</label><textarea id="ct-notes" rows="3" placeholder="Комментарии, сильные стороны, условия...">${escapeHtml(r.notes || '')}</textarea></div>
      <div class="form-group full">
        <label style="display:flex;align-items:center;gap:10px;">
          <input id="ct-is-active" type="checkbox" ${r.is_active === false ? '' : 'checked'}>
          <span>Активный подрядчик</span>
        </label>
      </div>
    </div>
    <div id="ct-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveContractorRecord(${r.id || 'null'})">Сохранить</button>
    </div>
  `);
}

async function saveContractorRecord(id = null) {
  const payload = {
    company_name: document.getElementById('ct-company-name')?.value || '',
    contact_name: document.getElementById('ct-contact-name')?.value || '',
    phone: document.getElementById('ct-phone')?.value || '',
    email: document.getElementById('ct-email')?.value || '',
    city: document.getElementById('ct-city')?.value || '',
    regions: document.getElementById('ct-regions')?.value || '',
    specialties: document.getElementById('ct-specialties')?.value || '',
    notes: document.getElementById('ct-notes')?.value || '',
    is_active: document.getElementById('ct-is-active')?.checked || false,
  };
  const result = document.getElementById('ct-result');
  result.className = 'sync-result show';
  result.textContent = 'Сохраняю подрядчика...';
  try {
    const path = id ? `/api/contractors/${id}` : '/api/contractors';
    const method = id ? 'PUT' : 'POST';
    await api(path, { method, body: payload });
    closeModal();
    navigate('contractors');
  } catch (err) {
    result.className = 'sync-result show err';
    result.textContent = `❌ ${err.message}`;
  }
}

async function renderLogistics(el) {
  const [data, leadData] = await Promise.all([
    api('/api/admin/logistics'),
    api('/api/leads?limit=200').catch(() => ({ leads: [] })),
  ]);
  const rows = data.rows || [];
  const summary = data.summary || {};
  const leads = leadData.leads || [];

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>🚚 Логистика</h2>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick='openLogisticsModal(${JSON.stringify(leads).replace(/'/g, "&apos;")})'>+ Новая доставка</button>
      </div>
    </div>

    <div class="stats-grid fade-in">
      <div class="stat-card"><div class="stat-label">Всего</div><div class="stat-value">${summary.total || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Запланировано</div><div class="stat-value blue">${summary.planned || 0}</div></div>
      <div class="stat-card"><div class="stat-label">В пути</div><div class="stat-value yellow">${summary.in_transit || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Доставлено</div><div class="stat-value green">${summary.delivered || 0}</div></div>
    </div>

    <div class="card fade-in" style="margin-top:18px;">
      <div class="card-title">Доставки и транспортные накладные</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Клиент</th><th>Город</th><th>Транспорт</th><th>ТН / tracking</th><th>Дата</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `
              <tr>
                <td style="font-weight:700;color:#ddd;">${r.client_name || r.lead_company_name || '—'}</td>
                <td>${r.delivery_city || '—'}</td>
                <td>
                  <div>${r.transport_company || '—'}</div>
                  <div style="font-size:11px;color:#777;">${r.vehicle_number || r.driver_name || ''}</div>
                </td>
                <td>
                  <div>${r.transport_note_number || '—'}</div>
                  <div style="font-size:11px;color:#777;">${r.tracking_number || ''}</div>
                </td>
                <td>${r.delivered_date || r.planned_date || '—'}</td>
                <td><span class="badge badge-${r.status === 'delivered' ? 'won' : r.status === 'in_transit' ? 'thinking' : 'catalog_sent'}">${logisticsStatusLabel(r.status)}</span></td>
                <td><button class="btn btn-secondary btn-sm" onclick='openLogisticsModal(${JSON.stringify(leads).replace(/'/g, "&apos;")}, ${JSON.stringify(r).replace(/'/g, "&apos;")})'>Редактировать</button></td>
              </tr>
            `).join('') : '<tr><td colspan="7" style="text-align:center;color:#777;padding:24px;">Пока нет логистических записей.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openLogisticsModal(leads = [], record = null) {
  const r = record || {};
  openModal(record ? 'Редактировать доставку' : 'Новая доставка', `
    <div class="form-grid">
      <div class="form-group"><label>Клиент</label><input id="lg-client-name" value="${escapeHtml(r.client_name || '')}"></div>
      <div class="form-group"><label>Связанный лид</label>
        <select id="lg-lead-id">
          <option value="">Без привязки</option>
          ${leads.map(l => `<option value="${l.id}" ${Number(r.lead_id) === Number(l.id) ? 'selected' : ''}>${escapeHtml(l.company_name || l.contact_name || ('Лид #' + l.id))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Город доставки</label><input id="lg-delivery-city" value="${escapeHtml(r.delivery_city || '')}"></div>
      <div class="form-group"><label>Транспортная компания</label><input id="lg-transport-company" value="${escapeHtml(r.transport_company || '')}"></div>
      <div class="form-group"><label>Машина</label><input id="lg-vehicle-number" value="${escapeHtml(r.vehicle_number || '')}"></div>
      <div class="form-group"><label>Водитель</label><input id="lg-driver-name" value="${escapeHtml(r.driver_name || '')}"></div>
      <div class="form-group"><label>Транспортная накладная</label><input id="lg-tn-number" value="${escapeHtml(r.transport_note_number || '')}"></div>
      <div class="form-group"><label>Tracking</label><input id="lg-tracking-number" value="${escapeHtml(r.tracking_number || '')}"></div>
      <div class="form-group"><label>Плановая дата</label><input id="lg-planned-date" type="date" value="${toDateInput(r.planned_date)}"></div>
      <div class="form-group"><label>Дата доставки</label><input id="lg-delivered-date" type="date" value="${toDateInput(r.delivered_date)}"></div>
      <div class="form-group"><label>Статус</label>
        <select id="lg-status">
          ${['planned','in_transit','delivered'].map(s => `<option value="${s}" ${String(r.status || 'planned') === s ? 'selected' : ''}>${logisticsStatusLabel(s)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full"><label>Заметки</label><textarea id="lg-notes" rows="3">${escapeHtml(r.notes || '')}</textarea></div>
    </div>
    <div id="lg-result" class="sync-result"></div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveLogisticsRecord(${r.id || 'null'})">Сохранить</button>
    </div>
  `);
}

async function saveLogisticsRecord(id = null) {
  const payload = {
    lead_id: document.getElementById('lg-lead-id')?.value || null,
    client_name: document.getElementById('lg-client-name')?.value || '',
    delivery_city: document.getElementById('lg-delivery-city')?.value || '',
    transport_company: document.getElementById('lg-transport-company')?.value || '',
    vehicle_number: document.getElementById('lg-vehicle-number')?.value || '',
    driver_name: document.getElementById('lg-driver-name')?.value || '',
    transport_note_number: document.getElementById('lg-tn-number')?.value || '',
    tracking_number: document.getElementById('lg-tracking-number')?.value || '',
    planned_date: document.getElementById('lg-planned-date')?.value || '',
    delivered_date: document.getElementById('lg-delivered-date')?.value || '',
    status: document.getElementById('lg-status')?.value || 'planned',
    notes: document.getElementById('lg-notes')?.value || '',
  };
  const path = id ? `/api/admin/logistics/${id}` : '/api/admin/logistics';
  const method = id ? 'PUT' : 'POST';
  await api(path, { method, body: payload });
  closeModal();
  navigate('logistics');
}

async function renderPayments(el) {
  const [data, leadData, offerData] = await Promise.all([
    api('/api/admin/payments'),
    api('/api/leads?limit=200').catch(() => ({ leads: [] })),
    api('/api/offers?limit=200').catch(() => ({ offers: [] })),
  ]);
  const rows = data.rows || [];
  const summary = data.summary || {};
  const leads = leadData.leads || [];
  const offers = offerData.offers || [];

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>💳 Оплаты</h2>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick='openPaymentModal(${JSON.stringify(leads).replace(/'/g, "&apos;")}, ${JSON.stringify(offers).replace(/'/g, "&apos;")})'>+ Новый инвойс / оплата</button>
      </div>
    </div>

    <div class="stats-grid fade-in">
      <div class="stat-card"><div class="stat-label">Всего</div><div class="stat-value">${summary.total || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Отправлено</div><div class="stat-value blue">${summary.sent || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Просрочено</div><div class="stat-value pink">${summary.overdue || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Оплачено</div><div class="stat-value green">${Number(summary.paid_amount || 0).toLocaleString()} </div></div>
    </div>

    <div class="card fade-in" style="margin-top:18px;">
      <div class="card-title">Инвойсы и оплаты клиентов</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Клиент</th><th>Инвойс</th><th>Сумма</th><th>Срок / оплата</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `
              <tr>
                <td style="font-weight:700;color:#ddd;">${r.client_name || r.lead_company_name || '—'}<div style="font-size:11px;color:#777;">${r.offer_number || ''}</div></td>
                <td>${r.invoice_number || '—'}</td>
                <td>${Number(r.amount || 0).toLocaleString()} ${r.currency || 'EUR'}</td>
                <td><div>${r.due_date || '—'}</div><div style="font-size:11px;color:#777;">${r.paid_date ? `Оплачено: ${r.paid_date}` : ''}</div></td>
                <td><span class="badge badge-${r.status === 'paid' ? 'won' : r.status === 'overdue' ? 'lost' : r.status === 'sent' ? 'catalog_sent' : 'thinking'}">${paymentStatusLabel(r.status)}</span></td>
                <td><button class="btn btn-secondary btn-sm" onclick='openPaymentModal(${JSON.stringify(leads).replace(/'/g, "&apos;")}, ${JSON.stringify(offers).replace(/'/g, "&apos;")}, ${JSON.stringify(r).replace(/'/g, "&apos;")})'>Редактировать</button></td>
              </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center;color:#777;padding:24px;">Пока нет оплат и инвойсов.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openPaymentModal(leads = [], offers = [], record = null) {
  const r = record || {};
  openModal(record ? 'Редактировать оплату' : 'Новый инвойс / оплата', `
    <div class="form-grid">
      <div class="form-group"><label>Клиент</label><input id="pm-client-name" value="${escapeHtml(r.client_name || '')}"></div>
      <div class="form-group"><label>Связанный лид</label>
        <select id="pm-lead-id">
          <option value="">Без привязки</option>
          ${leads.map(l => `<option value="${l.id}" ${Number(r.lead_id) === Number(l.id) ? 'selected' : ''}>${escapeHtml(l.company_name || l.contact_name || ('Лид #' + l.id))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Связанное КП</label>
        <select id="pm-offer-id">
          <option value="">Без КП</option>
          ${offers.map(o => `<option value="${o.id}" ${Number(r.offer_id) === Number(o.id) ? 'selected' : ''}>${escapeHtml(o.offer_number || ('КП #' + o.id))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Инвойс</label><input id="pm-invoice-number" value="${escapeHtml(r.invoice_number || '')}"></div>
      <div class="form-group"><label>Сумма</label><input id="pm-amount" type="number" step="0.01" value="${escapeHtml(String(r.amount || ''))}"></div>
      <div class="form-group"><label>Валюта</label>
        <select id="pm-currency">${['EUR','USD','BGN'].map(c => `<option value="${c}" ${String(r.currency || 'EUR') === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Дата инвойса</label><input id="pm-issue-date" type="date" value="${toDateInput(r.issue_date)}"></div>
      <div class="form-group"><label>Срок оплаты</label><input id="pm-due-date" type="date" value="${toDateInput(r.due_date)}"></div>
      <div class="form-group"><label>Дата оплаты</label><input id="pm-paid-date" type="date" value="${toDateInput(r.paid_date)}"></div>
      <div class="form-group"><label>Статус</label>
        <select id="pm-status">${['draft','sent','paid','overdue'].map(s => `<option value="${s}" ${String(r.status || 'draft') === s ? 'selected' : ''}>${paymentStatusLabel(s)}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Метод оплаты</label><input id="pm-method" value="${escapeHtml(r.payment_method || '')}"></div>
      <div class="form-group full"><label>Заметки</label><textarea id="pm-notes" rows="3">${escapeHtml(r.notes || '')}</textarea></div>
    </div>
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="savePaymentRecord(${r.id || 'null'})">Сохранить</button>
    </div>
  `);
}

async function savePaymentRecord(id = null) {
  const payload = {
    lead_id: document.getElementById('pm-lead-id')?.value || null,
    offer_id: document.getElementById('pm-offer-id')?.value || null,
    client_name: document.getElementById('pm-client-name')?.value || '',
    invoice_number: document.getElementById('pm-invoice-number')?.value || '',
    amount: document.getElementById('pm-amount')?.value || 0,
    currency: document.getElementById('pm-currency')?.value || 'EUR',
    issue_date: document.getElementById('pm-issue-date')?.value || '',
    due_date: document.getElementById('pm-due-date')?.value || '',
    paid_date: document.getElementById('pm-paid-date')?.value || '',
    status: document.getElementById('pm-status')?.value || 'draft',
    payment_method: document.getElementById('pm-method')?.value || '',
    notes: document.getElementById('pm-notes')?.value || '',
  };
  const path = id ? `/api/admin/payments/${id}` : '/api/admin/payments';
  const method = id ? 'PUT' : 'POST';
  await api(path, { method, body: payload });
  closeModal();
  navigate('payments');
}

function openPdfFromBase64(base64, filename) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'offer.pdf';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadOfferPdf(id) {
  try {
    const res = await fetch(`${API}/api/offers/${id}/pdf`, {
      headers: { ...(adminToken ? { 'X-Admin-Token': adminToken } : {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offer-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert('Грешка при сваляне на PDF: ' + err.message);
  }
}

// ===== AGENT REPORTS =====
async function renderAgentReports(el) {
  const params = new URLSearchParams();
  if (agentReportsFilters.agent) params.set('agent', agentReportsFilters.agent);
  if (agentReportsFilters.date_from) params.set('date_from', agentReportsFilters.date_from);
  if (agentReportsFilters.date_to) params.set('date_to', agentReportsFilters.date_to);
  if (agentReportsFilters.limit) params.set('limit', String(agentReportsFilters.limit));

  const data = await api(`/api/agents/reports?${params.toString()}`);
  const byAgent = Object.fromEntries((data.summary?.by_agent || []).map((x) => [x.id, x]));
  const reports = data.reports || [];
  const runs = data.runs || [];
  agentReportsCache = reports;

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>🗂️ Отчёты агентов</h2>
      <div class="page-header-actions">
        <button class="btn btn-secondary" onclick="navigate('agent-reports')">🔄 Обновить</button>
      </div>
    </div>

    <div class="card fade-in">
      <div class="form-grid">
        <div class="form-group">
          <label>Агент</label>
          <select id="agent-reports-agent">
            <option value="all" ${agentReportsFilters.agent === 'all' ? 'selected' : ''}>Все</option>
            <option value="maria" ${agentReportsFilters.agent === 'maria' ? 'selected' : ''}>Maria</option>
            <option value="mark" ${agentReportsFilters.agent === 'mark' ? 'selected' : ''}>Mark</option>
            <option value="steve" ${agentReportsFilters.agent === 'steve' ? 'selected' : ''}>Steve</option>
          </select>
        </div>
        <div class="form-group">
          <label>С даты</label>
          <input id="agent-reports-date-from" type="date" value="${agentReportsFilters.date_from || ''}">
        </div>
        <div class="form-group">
          <label>По дату</label>
          <input id="agent-reports-date-to" type="date" value="${agentReportsFilters.date_to || ''}">
        </div>
        <div class="form-group">
          <label>Лимит</label>
          <input id="agent-reports-limit" type="number" min="10" max="500" value="${agentReportsFilters.limit || 100}">
        </div>
      </div>
      <div class="page-header-actions" style="justify-content:flex-start;margin-top:6px;">
        <button class="btn btn-primary" onclick="applyAgentReportsFilters()">Применить</button>
        <button class="btn btn-secondary" onclick="resetAgentReportsFilters()">Сбросить</button>
      </div>
    </div>

    <div class="stats-grid fade-in">
      <div class="stat-card">
        <div class="stat-label">Всего отчётов</div>
        <div class="stat-value brand">${data.summary?.total_reports || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Maria</div>
        <div class="stat-value pink">${byAgent.maria?.reports || 0}</div>
        <div class="stat-sub">запусков: ${byAgent.maria?.runs || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Mark</div>
        <div class="stat-value blue">${byAgent.mark?.reports || 0}</div>
        <div class="stat-sub">запусков: ${byAgent.mark?.runs || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Steve</div>
        <div class="stat-value green">${byAgent.steve?.reports || 0}</div>
        <div class="stat-sub">запусков: ${byAgent.steve?.runs || 0}</div>
      </div>
    </div>

    <div class="grid-2 fade-in">
      <div class="card">
        <div class="card-title">📑 История запусков</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Время</th><th>Агент</th><th>Статус</th><th>Строк</th><th>Сообщение</th>
              </tr>
            </thead>
            <tbody>
              ${runs.length ? runs.slice(0, 30).map((r) => `
                <tr>
                  <td>${formatDateTime(r.started_at)}</td>
                  <td>${agentName(r.agent_id)}</td>
                  <td>${agentRunLabel(r.status)}</td>
                  <td>${r.rows_created || 0}</td>
                  <td>${r.message || '—'}</td>
                </tr>
              `).join('') : '<tr><td colspan="5" style="text-align:center;color:#777;">Запусков пока нет</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📘 Последние отчёты</div>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:420px;overflow:auto;">
          ${reports.length ? reports.slice(0, 40).map((r) => `
            <div style="padding:10px;border:1px solid var(--border);border-radius:10px;">
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
                <strong>${agentName(r.agent_id)}</strong>
                <span class="badge badge-${r.run_status === 'done' ? 'won' : r.run_status === 'error' ? 'lost' : 'new'}">${agentRunLabel(r.run_status || 'done')}</span>
              </div>
              <div style="font-size:12px;color:#aaa;margin-top:4px;">${reportTypeLabel(r.report_type)} · ${formatDateTime(r.created_at)}</div>
              <div style="font-size:12px;color:#ddd;margin-top:6px;">${reportSummary(r)}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                <button class="btn btn-primary btn-sm" onclick="openAgentReportDetail(${r.id})">Детально</button>
                <button class="btn btn-secondary btn-sm" onclick="downloadAgentReport(${r.id}, 'json')">JSON</button>
                <button class="btn btn-secondary btn-sm" onclick="downloadAgentReport(${r.id}, 'csv')">CSV</button>
              </div>
            </div>
          `).join('') : '<div style="color:#777;font-size:13px;">В выбранном периоде отчётов нет.</div>'}
        </div>
      </div>
    </div>
  `;
}

function applyAgentReportsFilters() {
  agentReportsFilters = {
    agent: document.getElementById('agent-reports-agent')?.value || 'all',
    date_from: document.getElementById('agent-reports-date-from')?.value || '',
    date_to: document.getElementById('agent-reports-date-to')?.value || '',
    limit: Number(document.getElementById('agent-reports-limit')?.value || 100),
  };
  navigate('agent-reports');
}

function resetAgentReportsFilters() {
  agentReportsFilters = { agent: 'all', date_from: '', date_to: '', limit: 100 };
  navigate('agent-reports');
}

function agentName(id) {
  const map = { maria: 'Maria', mark: 'Mark', steve: 'Steve' };
  return map[id] || id || '—';
}

function reportTypeLabel(type) {
  const map = {
    ads_analysis: 'Анализ рекламы',
    ads_active_decision: 'Активная кампания',
    market_scan: 'Скан рынка',
    seo_report: 'SEO отчёт',
    seo_audit: 'SEO аудит',
  };
  return map[type] || type || 'Отчёт';
}

function reportSummary(report) {
  const payload = report?.payload || {};
  if (payload.summary) return payload.summary;
  if (payload.overview?.golden_recommendation) return payload.overview.golden_recommendation;
  if (Array.isArray(payload.rows)) return `Строк в отчёте: ${payload.rows.length}`;
  return report?.run_message || 'Краткое описание недоступно.';
}

function openAgentReportDetail(id) {
  const report = agentReportsCache.find((r) => Number(r.id) === Number(id));
  if (!report) {
    alert('Отчёт не найден. Обновите страницу отчётов.');
    return;
  }

  openModal(`${agentName(report.agent_id)} · ${reportTypeLabel(report.report_type)}`, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <span class="badge badge-${report.run_status === 'done' ? 'won' : report.run_status === 'error' ? 'lost' : 'new'}">${agentRunLabel(report.run_status || 'done')}</span>
      <span class="badge badge-qualified">${formatDateTime(report.created_at)}</span>
      <span class="badge badge-new">Run #${report.run_id || '—'}</span>
    </div>
    <div style="font-size:13px;color:#ddd;line-height:1.55;margin-bottom:14px;">${reportSummary(report)}</div>
    ${renderAgentReportPayload(report)}
    <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:16px;">
      <button class="btn btn-secondary" onclick="downloadAgentReport(${report.id}, 'json')">Скачать JSON</button>
      <button class="btn btn-secondary" onclick="downloadAgentReport(${report.id}, 'csv')">Скачать CSV</button>
      ${report.payload?.html ? `<button class="btn btn-secondary" onclick="downloadAgentReport(${report.id}, 'html')">Скачать HTML</button>` : ''}
      <div style="flex:1;"></div>
      <button class="btn btn-primary" onclick="closeModal()">Закрыть</button>
    </div>
  `);
}

function renderAgentReportPayload(report) {
  const payload = report.payload || {};
  if (Array.isArray(payload.rows)) return renderRowsReport(payload.rows);
  if (Array.isArray(payload.checks) || Array.isArray(payload.recommendations)) return renderSeoReport(payload);
  if (payload.overview || Array.isArray(payload.campaigns)) return renderGenericObjectReport(payload);
  return renderGenericObjectReport(payload);
}

function renderRowsReport(rows) {
  const shown = rows.slice(0, 80);
  const keys = [...new Set(shown.flatMap(row => Object.keys(row || {})))].slice(0, 10);
  return `
    <div class="table-wrap" style="max-height:520px;overflow:auto;">
      <table>
        <thead><tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead>
        <tbody>
          ${shown.map(row => `
            <tr>${keys.map(k => `<td style="font-size:12px;max-width:260px;">${formatReportValue(row?.[k])}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${rows.length > shown.length ? `<div style="font-size:12px;color:#888;margin-top:8px;">Показано ${shown.length} из ${rows.length}. Полный отчёт можно скачать CSV/JSON.</div>` : ''}
  `;
}

function renderSeoReport(payload) {
  return `
    ${payload.summary ? `<div class="agent-run-message">${payload.summary}</div>` : ''}
    ${Array.isArray(payload.checks) ? `
      <div class="card-title" style="font-size:12px;margin-top:12px;">Проверки</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
        ${payload.checks.map(c => `
          <div style="border:1px solid var(--border);border-radius:10px;padding:10px;">
            <div style="font-weight:700;color:${c.ok ? 'var(--green)' : 'var(--red)'};">${c.ok ? 'OK' : 'Нужно исправить'} · ${c.name}</div>
            <div style="font-size:12px;color:#aaa;margin-top:4px;">${c.detail || ''}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${renderReportList('Рекомендации', payload.recommendations)}
    ${renderReportList('Линкбилдинг', payload.linkbuilding)}
    ${renderReportList('Следующие действия', payload.next_actions)}
  `;
}

function renderReportList(title, items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `
    <div class="card-title" style="font-size:12px;margin-top:14px;">${title}</div>
    <div style="display:flex;flex-direction:column;gap:7px;">
      ${items.map(item => `<div class="goal-rule">${formatReportValue(item)}</div>`).join('')}
    </div>
  `;
}

function renderGenericObjectReport(payload) {
  return `
    <pre style="white-space:pre-wrap;max-height:520px;overflow:auto;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:10px;padding:12px;color:#ddd;font-size:12px;">${JSON.stringify(payload || {}, null, 2)}</pre>
  `;
}

function downloadAgentReport(id, format) {
  const report = agentReportsCache.find((r) => Number(r.id) === Number(id));
  if (!report) {
    alert('Отчёт не найден. Обновите страницу отчётов.');
    return;
  }

  const safeName = `${report.agent_id}-${report.report_type}-${report.id}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  if (format === 'csv') {
    const csv = reportToCsv(report);
    downloadTextFile(`${safeName}.csv`, csv, 'text/csv;charset=utf-8');
    return;
  }

  if (format === 'html') {
    const html = report.payload?.html || renderReportAsHtml(report);
    downloadTextFile(`${safeName}.html`, html, 'text/html;charset=utf-8');
    return;
  }

  downloadTextFile(`${safeName}.json`, JSON.stringify(report, null, 2), 'application/json;charset=utf-8');
}

function renderReportAsHtml(report) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${agentName(report.agent_id)} report</title></head><body><pre>${JSON.stringify(report, null, 2)}</pre></body></html>`;
}

function reportToCsv(report) {
  const payload = report.payload || {};
  let rows = [];
  if (Array.isArray(payload.rows)) rows = payload.rows;
  else if (Array.isArray(payload.checks)) rows = payload.checks;
  else if (Array.isArray(payload.recommendations)) rows = payload.recommendations.map((x, i) => ({ index: i + 1, recommendation: x }));
  else rows = flattenObject(payload);

  if (!rows.length) rows = [{ message: reportSummary(report) }];
  const keys = [...new Set(rows.flatMap(row => Object.keys(row || {})))];
  return [
    keys.map(csvCell).join(','),
    ...rows.map(row => keys.map(k => csvCell(row?.[k])).join(',')),
  ].join('\n');
}

function flattenObject(obj, prefix = '') {
  const rows = [];
  for (const [key, value] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) rows.push(...flattenObject(value, path));
    else rows.push({ field: path, value: Array.isArray(value) ? value.join(' | ') : value });
  }
  return rows;
}

function csvCell(value) {
  const text = formatReportValue(value).replace(/"/g, '""');
  return `"${text}"`;
}

function formatReportValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateInput(value) {
  return toDatetimeLocal(value).slice(0, 10);
}

function toTimeInput(value) {
  return toDatetimeLocal(value).slice(11, 16);
}

function combineDateAndTime(dateId, timeId) {
  const date = document.getElementById(dateId)?.value || '';
  if (!date) return null;
  const time = document.getElementById(timeId)?.value || '09:00';
  return `${date}T${time}`;
}

function openNativePicker(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.focus();
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  } else {
    input.click();
  }
}

function formatFollowupShort(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const BERLIN_TIMEZONE = 'Europe/Berlin';
const SOFIA_TIMEZONE = 'Europe/Sofia';
const BERLIN_WORK_START_HOUR = 9;
const BERLIN_WORK_END_HOUR = 18;

function getLeadBusinessTimeZone(tireMode = false) {
  return tireMode ? BERLIN_TIMEZONE : SOFIA_TIMEZONE;
}

function parseApiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value);
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTimeZoneParts(date, timeZone = BERLIN_TIMEZONE) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: weekdayMap[map.weekday],
  };
}

function getTimeZoneOffsetMs(date, timeZone = BERLIN_TIMEZONE) {
  const parts = getTimeZoneParts(date, timeZone);
  if (!parts) return 0;
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

function makeDateInTimeZone(year, month, day, hour, minute = 0, second = 0, timeZone = BERLIN_TIMEZONE) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs);
}

function nextBusinessStart(date, timeZone = BERLIN_TIMEZONE) {
  let cursor = new Date(date.getTime() + 60 * 1000);
  for (let i = 0; i < 10; i += 1) {
    const parts = getTimeZoneParts(cursor, timeZone);
    if (!parts) return cursor;
    const atStart = makeDateInTimeZone(parts.year, parts.month, parts.day, BERLIN_WORK_START_HOUR, 0, 0, timeZone);
    if (parts.weekday >= 1 && parts.weekday <= 5 && cursor <= atStart) {
      return atStart;
    }
    const nextDayStart = makeDateInTimeZone(parts.year, parts.month, parts.day + 1, BERLIN_WORK_START_HOUR, 0, 0, timeZone);
    cursor = nextDayStart;
  }
  return cursor;
}

function calculateBusinessMinutesBetween(startValue, endValue, timeZone = BERLIN_TIMEZONE) {
  const start = parseApiDate(startValue);
  const end = parseApiDate(endValue);
  if (!start || !end || end <= start) return 0;

  let cursor = new Date(start);
  let minutes = 0;

  while (cursor < end) {
    const parts = getTimeZoneParts(cursor, timeZone);
    if (!parts) break;

    if (parts.weekday === 0 || parts.weekday === 6) {
      cursor = nextBusinessStart(cursor, timeZone);
      continue;
    }

    const workStart = makeDateInTimeZone(parts.year, parts.month, parts.day, BERLIN_WORK_START_HOUR, 0, 0, timeZone);
    const workEnd = makeDateInTimeZone(parts.year, parts.month, parts.day, BERLIN_WORK_END_HOUR, 0, 0, timeZone);

    if (cursor < workStart) {
      cursor = workStart;
      continue;
    }

    if (cursor >= workEnd) {
      cursor = nextBusinessStart(cursor, timeZone);
      continue;
    }

    const segmentEnd = end < workEnd ? end : workEnd;
    minutes += Math.max(0, Math.round((segmentEnd - cursor) / 60000));
    cursor = segmentEnd;

    if (cursor >= workEnd) {
      cursor = nextBusinessStart(cursor, timeZone);
    }
  }

  return minutes;
}

function formatBusinessResponseShort(minutes, tireMode = false) {
  if (minutes === null || minutes === undefined) return tireMode ? 'No contact' : 'Нет контакта';
  if (minutes < 60) return tireMode ? `${minutes}m work` : `${minutes}м раб.`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return tireMode
    ? `${hours}h ${restMinutes}m work`
    : `${hours}ч ${restMinutes}м раб.`;
}

function buildLeadResponseMetrics(rows = [], tireMode = false) {
  const timeZone = getLeadBusinessTimeZone(tireMode);
  const values = (rows || [])
    .filter(row => row.first_manager_comment_at)
    .map(row => calculateBusinessMinutesBetween(row.created_at, row.first_manager_comment_at, timeZone))
    .filter(value => Number.isFinite(value) && value >= 0);

  if (!values.length) {
    return { avgMinutes: null, measured: 0 };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    avgMinutes: Math.round(total / values.length),
    measured: values.length,
  };
}

function formatLeadDateOnly(value, tireMode = false) {
  const date = parseApiDate(value);
  if (!date) return '—';
  return date.toLocaleDateString(tireMode ? 'en-GB' : 'ru-RU', {
    timeZone: getLeadBusinessTimeZone(tireMode),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatLeadTimeOnly(value, tireMode = false) {
  const date = parseApiDate(value);
  if (!date) return '—';
  return date.toLocaleTimeString(tireMode ? 'en-GB' : 'ru-RU', {
    timeZone: getLeadBusinessTimeZone(tireMode),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function renderLeadTimingCell(lead, tireMode = false) {
  const timeZone = getLeadBusinessTimeZone(tireMode);
  const responseMinutes = lead.first_manager_comment_at
    ? calculateBusinessMinutesBetween(lead.created_at, lead.first_manager_comment_at, timeZone)
    : null;
  const responseLabel = responseMinutes === null
    ? (tireMode ? 'SLA —' : 'SLA —')
    : `SLA ${formatBusinessResponseShort(responseMinutes, tireMode)}`;
  return `
    <div style="display:flex;flex-direction:column;gap:3px;min-width:106px;">
      <div style="color:#8b97b7;font-size:10px;">CRM ${formatLeadDateOnly(lead.created_at, tireMode)} ${formatLeadTimeOnly(lead.created_at, tireMode)}</div>
      <div style="color:${lead.first_manager_comment_at ? 'var(--green)' : '#8b97b7'};font-size:10px;">${tireMode ? '1st contact' : '1-й контакт'} ${lead.first_manager_comment_at ? `${formatLeadDateOnly(lead.first_manager_comment_at, tireMode)} ${formatLeadTimeOnly(lead.first_manager_comment_at, tireMode)}` : '—'}</div>
      <div style="font-size:10px;color:${lead.first_manager_comment_at ? '#f6d365' : '#a1a1aa'};">${responseLabel}</div>
    </div>
  `;
}

function stringifyQualificationData(lead = {}) {
  const data = leadQualificationData(lead);
  const entries = Object.entries(data || {}).filter(([, value]) => {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  });
  return entries.map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: ${value.join(' | ')}`;
    if (value && typeof value === 'object') {
      return `${key}: ${Object.entries(value).map(([subKey, subValue]) => `${subKey}=${subValue}`).join(' | ')}`;
    }
    return `${key}: ${value}`;
  }).join(' || ');
}

function downloadLeadAnalysisCsv() {
  const tireMode = currentLeadFilters.view === 'tires';
  const rows = currentLeadRowsForExport || [];
  if (!rows.length) {
    alert(tireMode ? 'No leads to export.' : 'Нет лидов для выгрузки.');
    return;
  }

  const exportRows = rows.map(lead => {
    const responseMinutes = lead.first_manager_comment_at
      ? calculateBusinessMinutesBetween(lead.created_at, lead.first_manager_comment_at, getLeadBusinessTimeZone(tireMode))
      : null;
    return {
      lead_id: lead.id,
      company: lead.company_name || '',
      contact: lead.contact_name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      city: lead.city || '',
      source: lead.source || '',
      crm_segment: lead.crm_segment || '',
      status: tireMode ? tireStatusLabel(leadDisplayStatus(lead)) : statusLabel(leadDisplayStatus(lead)),
      status_code: leadDisplayStatus(lead),
      interest: lead.interest_products || '',
      area_label: lead.area_label || '',
      lead_score: lead.lead_score || '',
      lead_score_label: lead.lead_score_label || '',
      created_at_crm: `${formatLeadDateOnly(lead.created_at, tireMode)} ${formatLeadTimeOnly(lead.created_at, tireMode)}`,
      first_contact_at: lead.first_manager_comment_at ? `${formatLeadDateOnly(lead.first_manager_comment_at, tireMode)} ${formatLeadTimeOnly(lead.first_manager_comment_at, tireMode)}` : '',
      sla: responseMinutes === null ? '' : formatBusinessResponseShort(responseMinutes, tireMode),
      latest_comment: lead.latest_comment || '',
      latest_comment_at: lead.latest_comment_at || '',
      form_answers: lead.notes || '',
      qualification_data: stringifyQualificationData(lead),
      fb_campaign: lead.fb_campaign_name || '',
      created_raw: lead.fb_created_time_raw || '',
    };
  });

  const keys = [...new Set(exportRows.flatMap(row => Object.keys(row)))];
  const csv = [
    keys.map(csvCell).join(','),
    ...exportRows.map(row => keys.map(key => csvCell(row[key])).join(',')),
  ].join('\n');

  const scope = tireMode ? 'tires' : (currentLeadFilters.view || 'leads');
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`lead-analysis-${scope}-${dateStamp}.csv`, csv, 'text/csv;charset=utf-8');
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== HELPERS =====
function statusLabel(s) {
  const map = {
    new: 'Новый лид',
    contacted: 'Связались',
    needs_discovery: 'Уточнение деталей',
    details: 'Уточнение деталей',
    interested: 'Уточнение деталей',
    qualified: 'Уточнение деталей',
    catalog_sent: 'Уточнение деталей',
    thinking: 'Уточнение деталей',
    offer_preparation: 'Подготовка КП',
    offer_sent: 'КП отправлено',
    negotiation: 'Переговоры',
    office_meeting: 'Встреча в офисе',
    contract: 'Согласование договора',
    purchase: 'Закупка и доставка',
    won: 'Закрыто успешно',
    lost: 'Отказ / неактуально',
    partner_new: 'Новый партнёр',
    partner_qualification: 'Квалификация',
    partner_negotiation: 'Переговоры',
    partner_meeting: 'Встреча проведена',
    partner_terms_sent: 'Условия направлены',
    partner_test_order: 'Тестовый заказ',
    partner_active: 'Активный дистрибьютор'
  };
  return map[s] || s;
}

function sourceLabel(s) {
  const map = {
    website: '🌐 Сайт', facebook: '📘 Facebook', chatbot: '🤖 Чатбот',
    phone: '📞 Телефон', email: '📧 Email'
  };
  return map[s] || s;
}

function logisticsStatusLabel(status) {
  const map = {
    planned: 'Запланировано',
    in_transit: 'В пути',
    delivered: 'Доставлено',
  };
  return map[status] || status || '—';
}

function paymentStatusLabel(status) {
  const map = {
    draft: 'Черновик',
    sent: 'Отправлено',
    paid: 'Оплачено',
    overdue: 'Просрочено',
  };
  return map[status] || status || '—';
}

// Clock
setInterval(() => {
  const t = new Date().toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  const el = document.getElementById('sidebar-time');
  if (el) el.textContent = t;
}, 1000);

setInterval(() => {
  if (currentPage === 'clients') renderClients(document.getElementById('main'));
  if (currentPage === 'dashboard') renderDashboard(document.getElementById('main'));
}, 60000);

// ===== INIT =====
const gmailCallbackParams = new URLSearchParams(window.location.search);
const gmailCallbackState = gmailCallbackParams.get('gmail');
const gmailCallbackMessage = gmailCallbackParams.get('email') || gmailCallbackParams.get('message') || '';
if (gmailCallbackState) {
  window.history.replaceState({}, document.title, window.location.pathname);
}
refreshRole().finally(() => {
  navigate(gmailCallbackState && currentRole === 'admin' ? 'settings' : (currentRole === 'admin' ? 'dashboard' : 'leads'));
  if (gmailCallbackState === 'connected') {
    setTimeout(() => alert(`Gmail подключён: ${gmailCallbackMessage}`), 300);
  } else if (gmailCallbackState === 'error') {
    setTimeout(() => alert(`Ошибка подключения Gmail: ${gmailCallbackMessage}`), 300);
  }
});
