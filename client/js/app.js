// ===== BODEX Virtual Office — Frontend App =====

const API = '';
let currentPage = 'dashboard';
let currentRole = 'worker';
let adminToken = localStorage.getItem('bodex_admin_token') || '';
let markAgentPoll = null;
let currentLeadFilters = {};

// ===== NAVIGATION =====
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage(page);
}

async function renderPage(page) {
  const main = document.getElementById('main');
  main.innerHTML = '<div style="text-align:center;padding:60px;color:#555;">Зареждане...</div>';

  try {
    if (page === 'goals' && currentRole !== 'admin') {
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
      case 'leads': await renderLeads(main); break;
      case 'clients': await renderClients(main); break;
      case 'deals': await renderDeals(main); break;
      case 'pipeline': await renderPipeline(main); break;
      case 'facebook': await renderFacebook(main); break;
      case 'sheets': await renderSheets(main); break;
      case 'products': await renderProducts(main); break;
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
    el.style.display = currentRole === 'admin' ? 'flex' : 'none';
  });
  const roleValue = document.getElementById('role-value');
  const loginBtn = document.getElementById('admin-login-btn');
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (roleValue) roleValue.textContent = currentRole === 'admin' ? 'Админ' : 'Работник / AI';
  if (loginBtn) loginBtn.style.display = currentRole === 'admin' ? 'none' : 'inline-flex';
  if (logoutBtn) logoutBtn.style.display = currentRole === 'admin' ? 'inline-flex' : 'none';
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
  if (currentPage === 'goals') navigate('dashboard');
}

async function renderAdminGate(el) {
  el.innerHTML = `
    <div class="page-header fade-in"><h2>🔒 Админ доступ</h2></div>
    <div class="card fade-in">
      <div class="card-title">Цели 2026 закрыты для работников и AI-агентов</div>
      <p style="font-size:13px;color:#aaa;line-height:1.6;margin-bottom:16px;">В рабочем режиме доступны клиенты, CRM, Google Sheets и задачи. Бизнес-план, финансовые ориентиры и стратегические цели видит только админ.</p>
      <button class="btn btn-primary" onclick="openAdminLogin()">Войти как админ</button>
    </div>
  `;
}

// ===== DASHBOARD =====
async function renderDashboard(el) {
  const [data, recommendations] = await Promise.all([
    api('/api/dashboard/stats'),
    api('/api/google/recommendations').catch(() => []),
  ]);
  const leads = data.leads || {};
  const fb = data.fb || {};
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
        <button class="btn btn-secondary" style="margin-top:12px;" onclick="navigate('clients')">👥 Отвори клиентите</button>
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
  const agentStatus = ['mark', 'maria'].includes(worker.id)
    ? await api(`/api/agents/${worker.id}/status`).catch(err => ({ error: err.message }))
    : null;
  const mariaAnalysis = worker.id === 'maria'
    ? await api('/api/agents/maria/analysis').catch(err => ({ error: err.message, rows: [] }))
    : null;
  const relatedLink = {
    rostislav: `<button class="btn btn-secondary" onclick="navigate('clients')">👥 Клиенты</button><button class="btn btn-secondary" onclick="navigate('leads')">📋 CRM лиды</button>`,
    mark: `<button class="btn btn-secondary" onclick="navigate('products')">📦 Продукты</button><button class="btn btn-secondary" onclick="navigate('clients')">👥 B2B база</button>`,
    maria: `<button class="btn btn-secondary" onclick="navigate('facebook')">📢 Facebook Ads</button><button class="btn btn-secondary" onclick="navigate('clients')">👥 Лиды</button>`,
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

    ${renderMonthlyGoals(worker)}
    ${worker.id === 'mark' ? renderMarkAgentPanel(agentStatus) : ''}
    ${worker.id === 'maria' ? renderMariaAgentPanel(agentStatus, mariaAnalysis) : ''}

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
            Mark берёт список материалов из приложения, ищет рыночные цены по болгарскому рынку, формирует рекомендацию и записывает результат во вкладку Google Sheets <strong>Mark Market Report</strong>. Для точных источников можно добавить прямые URL во вкладку <strong>Mark Sources</strong>.
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
        <button class="btn btn-secondary" onclick="navigate('sheets')">Google Sheets</button>
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
            Maria синхронизирует Facebook Ads, считает spend, impressions, clicks, CTR, CPC, leads и CPL за последние 30 дней. Потом пишет отчёт во вкладку Google Sheets <strong>Maria Ads Report</strong> и отмечает, что усилить, что остановить и где менять креатив/аудиторию.
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
              <th>Spend</th>
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
                <td>$${Number(row.spend || 0).toLocaleString()}</td>
                <td style="color:var(--green);font-weight:700;">${row.leads || 0}</td>
                <td>$${row.cpl || 0}</td>
                <td>${row.ctr || 0}%</td>
                <td><span class="maria-verdict">${row.verdict}</span></td>
                <td style="min-width:260px;color:#aaa;line-height:1.45;">${row.recommendation}</td>
              </tr>
            `).join('') : '<tr><td colspan="8" style="text-align:center;color:#666;padding:26px;">Нет отчёта. Нажмите “Запустить агента”.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div style="font-size:11px;color:#777;margin-top:10px;">Этот же отчёт записывается в Google Sheets во вкладку Maria Ads Report.</div>
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
        <div class="maria-highlight">${best ? `${best.name}: ${best.leads} лидов при CPL $${best.cpl}` : '—'}</div>
      </div>
      <div>
        <div class="monthly-goal-label">Самая дорогая кампания</div>
        <div class="maria-highlight">${weakest ? `${weakest.name}: CPL $${weakest.cpl}` : '—'}</div>
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
            <small>${row.leads} лидов · CPL $${row.cpl} · CTR ${row.ctr}% · ${row.verdict}</small>
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
    result.textContent = 'Mark запущен. Он сканирует рынок и запишет отчёт в Google Sheets...';
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
  const params = new URLSearchParams(filters);
  const [data, recommendations] = await Promise.all([
    api(`/api/google/clients?${params}`),
    api('/api/google/recommendations').catch(() => []),
  ]);
  const stats = data.stats || {};
  const rows = data.rows || [];

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>👥 Клиенти от Google таблици</h2>
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
      <div class="stat-card"><div class="stat-label">Висок приоритет</div><div class="stat-value pink">${stats.high_priority || 0}</div></div>
    </div>

    <div class="card fade-in">
      <div class="card-title">🎯 Препоръки за днес</div>
      ${recommendations.length ? recommendations.map(r => `
        <details style="background:rgba(255,255,255,0.02);border-radius:8px;padding:12px;margin-bottom:10px;">
          <summary style="cursor:pointer;color:#ddd;font-weight:600;font-size:13px;">
            ${r.title} <span class="badge badge-${r.type === 'hot' ? 'hot' : r.type === 'b2b' ? 'qualified' : 'new'}" style="margin-left:8px;">${r.count}</span>
          </summary>
          <div style="font-size:12px;color:#888;margin-top:8px;line-height:1.5;">${r.description}</div>
          <div style="margin-top:10px;">
            ${(r.clients || []).map(c => `
              <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1.8fr;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,0.04);font-size:11px;">
                <span style="color:#ddd;font-weight:600;">${c.company_name || c.contact_name || '—'}</span>
                <span>${c.phone || c.email || '—'}</span>
                <span>${c.sheet_name}</span>
                <span style="color:#aaa;">${c.action_needed || c.status || c.problem || c.notes || '—'}</span>
              </div>
            `).join('')}
          </div>
        </details>
      `).join('') : '<div style="font-size:12px;color:#777;">Няма препоръки. Обновете данните от Google Sheets.</div>'}
    </div>

    <div class="search-bar fade-in">
      <input type="text" placeholder="Търси фирма, човек, телефон, email, проблем..." id="client-search" value="${filters.search || ''}" onkeyup="if(event.key==='Enter')searchClients()">
      <select id="client-sheet" onchange="searchClients()">
        <option value="">Всички таблици</option>
        <option value="УСЛУГИ" ${filters.sheet_name==='УСЛУГИ'?'selected':''}>УСЛУГИ</option>
        <option value="МАТЕРИАЛЫ" ${filters.sheet_name==='МАТЕРИАЛЫ'?'selected':''}>МАТЕРИАЛЫ</option>
        <option value="ПРОЕКТЫ" ${filters.sheet_name==='ПРОЕКТЫ'?'selected':''}>ПРОЕКТЫ</option>
        <option value="b2b" ${filters.sheet_name==='b2b'?'selected':''}>b2b</option>
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
              <th>Източник</th>
              <th>Компания / Клиент</th>
              <th>Контакт</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Статус</th>
              <th>Приоритет</th>
              <th>Следващо действие</th>
              <th>Контекст</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(c => `
              <tr>
                <td><span class="badge badge-new">${c.sheet_name}</span></td>
                <td style="font-weight:600;color:#ddd;">${c.company_name || '—'}<div style="font-size:10px;color:#666;">${c.city || c.segment || ''}</div></td>
                <td>${c.contact_name || '—'}</td>
                <td>${c.phone || '—'}</td>
                <td style="font-size:11px;">${c.email || '—'}</td>
                <td>${c.status || '—'}</td>
                <td><span class="badge badge-${c.priority === 'high' ? 'hot' : c.priority === 'low' ? 'low' : 'medium'}">${c.priority || 'medium'}</span></td>
                <td style="max-width:220px;">${c.action_needed || '—'}</td>
                <td style="max-width:320px;font-size:11px;color:#888;">${c.problem || c.interest || c.notes || '—'}</td>
              </tr>
            `).join('') : '<tr><td colspan="9" style="text-align:center;color:#666;padding:30px;">Няма данни. Натиснете “Обнови от Google Sheets”.</td></tr>'}
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
    priority: document.getElementById('client-priority').value,
  });
}

async function pullBusinessSheets() {
  const el = document.getElementById('clients-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Чета УСЛУГИ, МАТЕРИАЛЫ, ПРОЕКТЫ и b2b от Google Sheets...';
  try {
    const result = await api('/api/google/pull/business', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ Обновено: ${result.rows} реда.`;
    setTimeout(() => renderClients(document.getElementById('main')), 1200);
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

    <div class="stats-grid fade-in">
      <div class="stat-card"><div class="stat-label">Всего контактов в воронке</div><div class="stat-value brand">${summary.total || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Интерес / горячие</div><div class="stat-value yellow">${summary.interested || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Каталог или КП</div><div class="stat-value purple">${summary.catalog_or_offer || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Договор / закупка / закрыто</div><div class="stat-value green">${summary.contract_purchase_won || 0}</div></div>
    </div>

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

      <div class="card">
        <div class="card-title">Цикл сделки: ${section.label}</div>
        <div class="deal-cycle">
          ${stages.map(stage => `
            <div class="deal-cycle-step">
              <span>${stage.short}</span>
              <strong>${stage.count}</strong>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="deals-board">
        ${stages.map(stage => `
        <section class="deal-col deal-stage-${stage.id}">
          <div class="deal-col-header">
            <span>${stage.label}</span>
            <strong>${stage.count}</strong>
          </div>
          <div class="deal-col-body">
            ${stage.clients.length ? stage.clients.map(c => `
              <article class="deal-card">
                <div class="deal-card-top">
                  <span class="badge badge-${dealBadgeClass(stage.id)}">${c.sheet_name || 'таблица'}</span>
                  <span class="deal-row">#${c.row_number || c.id}</span>
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
    contract: 'won',
    purchase: 'won',
    won: 'won',
    lost: 'lost',
  };
  return map[stageId] || 'new';
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
  currentLeadFilters = filters;
  const params = new URLSearchParams(filters);
  const [data, summary] = await Promise.all([
    api(`/api/leads?${params}`),
    api('/api/leads/summary').catch(() => ({ total: 0, statuses: [], sources: [] })),
  ]);
  const rows = data.leads || [];
  const statusCounts = Object.fromEntries((summary.statuses || []).map(row => [row.status, row.count]));

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>📋 Лидове <span style="color:#666;font-size:14px;">(${data.total})</span></h2>
      <div class="page-header-actions">
        <button class="btn btn-secondary" onclick="syncFacebookLeadsFromLeadsPage()">📘 Синхронизирай FB лиды</button>
        <button class="btn btn-primary" onclick="openNewLeadModal()">+ Нов лид</button>
      </div>
    </div>

    <div id="leads-sync-result" class="sync-result"></div>

    <div class="lead-tabs fade-in">
      ${leadTab('Все', { }, summary.total || 0, !filters.view && !filters.status && !filters.source)}
      ${leadTab('Facebook', { view: 'facebook' }, summary.facebook || 0, filters.view === 'facebook')}
      ${leadTab('Новые', { status: 'new' }, statusCounts.new || 0, filters.status === 'new' && !filters.view)}
      ${leadTab('Материалы', { view: 'materials' }, summary.materials || 0, filters.view === 'materials')}
      ${leadTab('Услуги', { view: 'services' }, summary.services || 0, filters.view === 'services')}
      ${leadTab('Сегодня', { date_range: 'today' }, summary.today || 0, filters.date_range === 'today')}
      ${leadTab('7 дней', { date_range: 'week' }, summary.week || 0, filters.date_range === 'week')}
    </div>

    <div class="lead-status-tabs fade-in">
      ${['new','contacted','qualified','offer_sent','negotiation','won','lost'].map(status =>
        `<button class="lead-status-tab ${filters.status === status ? 'active' : ''}" onclick="renderLeads(document.getElementById('main'), {...currentLeadFilters, status: '${status}'})">
          ${statusLabel(status)} <span>${statusCounts[status] || 0}</span>
        </button>`
      ).join('')}
    </div>

    <div class="search-bar fade-in">
      <input type="text" placeholder="Търси по фирма, контакт, email, град..." id="lead-search" value="${filters.search || ''}" onkeyup="if(event.key==='Enter')searchLeads()">
      <select id="lead-filter-status" onchange="searchLeads()">
        <option value="">Всички статуси</option>
        <option value="new" ${filters.status==='new'?'selected':''}>Нов</option>
        <option value="contacted" ${filters.status==='contacted'?'selected':''}>Контактуван</option>
        <option value="qualified" ${filters.status==='qualified'?'selected':''}>Квалифициран</option>
        <option value="offer_sent" ${filters.status==='offer_sent'?'selected':''}>Оферта</option>
        <option value="negotiation" ${filters.status==='negotiation'?'selected':''}>Преговори</option>
        <option value="won" ${filters.status==='won'?'selected':''}>Спечелен</option>
        <option value="lost" ${filters.status==='lost'?'selected':''}>Загубен</option>
      </select>
      <select id="lead-filter-source" onchange="searchLeads()">
        <option value="">Всички източници</option>
        <option value="website" ${filters.source==='website'?'selected':''}>Сайт</option>
        <option value="facebook" ${filters.source==='facebook'?'selected':''}>Facebook</option>
        <option value="chatbot" ${filters.source==='chatbot'?'selected':''}>Чатбот</option>
        <option value="phone" ${filters.source==='phone'?'selected':''}>Телефон</option>
        <option value="email" ${filters.source==='email'?'selected':''}>Email</option>
      </select>
      <select id="lead-date-range" onchange="searchLeads()">
        <option value="" ${!filters.date_range?'selected':''}>Все даты</option>
        <option value="today" ${filters.date_range==='today'?'selected':''}>Сегодня</option>
        <option value="week" ${filters.date_range==='week'?'selected':''}>7 дней</option>
      </select>
      <select id="lead-sort" onchange="searchLeads()">
        <option value="date_desc" ${filters.sort!=='date_asc' && filters.sort!=='status'?'selected':''}>Новые сверху</option>
        <option value="date_asc" ${filters.sort==='date_asc'?'selected':''}>Старые сверху</option>
        <option value="status" ${filters.sort==='status'?'selected':''}>По статусу</option>
      </select>
      <button class="btn btn-secondary" onclick="searchLeads()">🔍</button>
    </div>

    <div class="card fade-in">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Компания</th>
              <th>Контакт</th>
              <th>Телефон / Email</th>
              <th>Град</th>
              <th>Статус</th>
              <th>Приоритет</th>
              <th>Източник</th>
              <th>Тип / интерес</th>
              <th>Стойност</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(l => `
              <tr class="${l.status === 'new' ? 'lead-row-new' : ''}" onclick="openLeadDetail(${l.id})" style="cursor:pointer;">
                <td style="font-weight:500;color:#ddd;">${l.company_name || '—'}</td>
                <td>${l.contact_name || '—'}</td>
                <td style="font-size:11px;">${l.phone || l.email || '—'}</td>
                <td>${l.city || '—'}</td>
                <td><span class="badge badge-${l.status}">${statusLabel(l.status)}</span></td>
                <td><span class="badge badge-${l.priority}">${l.priority}</span></td>
                <td>${sourceLabel(l.source)}</td>
                <td style="max-width:240px;font-size:11px;color:#aaa;">${l.interest_products || l.lead_type || '—'}</td>
                <td style="color:var(--green);font-weight:500;">${l.estimated_value ? l.estimated_value + ' лв' : '—'}</td>
                <td style="color:#666;font-size:11px;">${new Date(l.created_at).toLocaleDateString('bg-BG')}</td>
                <td><button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();openLeadDetail(${l.id})">👁</button></td>
              </tr>
            `).join('') : '<tr><td colspan="11" style="text-align:center;color:#666;padding:30px;">Нет лидов по этому фильтру.</td></tr>'}
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

function searchLeads() {
  const search = document.getElementById('lead-search').value;
  const status = document.getElementById('lead-filter-status').value;
  const source = document.getElementById('lead-filter-source').value;
  const date_range = document.getElementById('lead-date-range').value;
  const sort = document.getElementById('lead-sort').value;
  renderLeads(document.getElementById('main'), { ...currentLeadFilters, search, status, source, date_range, sort });
}

async function syncFacebookLeadsFromLeadsPage() {
  const el = document.getElementById('leads-sync-result');
  el.className = 'sync-result show';
  el.textContent = 'Синхронизирую Facebook Lead Forms...';
  try {
    const result = await api('/api/facebook/sync/leads', { method: 'POST' });
    el.className = 'sync-result show ok';
    el.textContent = `✅ FB лиды: проверено ${result.leads_checked || 0}, новых ${result.new_leads || 0}, обновлено ${result.updated_leads || 0}.`;
    setTimeout(() => renderLeads(document.getElementById('main'), { view: 'facebook' }), 900);
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

  const stages = ['new', 'contacted', 'qualified', 'offer_sent', 'negotiation', 'won', 'lost'];
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
    el.textContent = '❌ Грешка: ' + err.message;
  }
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
        <button class="btn btn-secondary" onclick="setupSheets()">🧱 Подготви листовете</button>
        <button class="btn btn-secondary" onclick="navigate('settings')">⚙️ Настройки</button>
      </div>
      <div id="sheets-setup-result" class="sync-result"></div>
    </div>

    <div class="card fade-in">
      <div class="card-title">🔄 Синхронизация</div>
      <p style="font-size:12px;color:#888;margin-bottom:14px;">Данните се синхронизират автоматично на всеки 15 минути. Можете и ръчно:</p>
      <div class="sync-actions">
        <button class="btn btn-primary" onclick="syncSheets('all')">📤 Синхронизирай всичко</button>
        <button class="btn btn-secondary" onclick="syncSheets('leads')">📋 Push Лидове</button>
        <button class="btn btn-secondary" onclick="syncSheets('products')">📦 Push Продукти</button>
        <button class="btn btn-secondary" onclick="syncSheets('stats')">📊 Push Статистика</button>
        <button class="btn btn-secondary" onclick="syncSheetsPull()">📥 Pull Лидове от Sheets</button>
        <button class="btn btn-secondary" onclick="pullBusinessSheetsFromSheetsPage()">👥 Pull Клиенти/B2B</button>
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
    <div class="page-header fade-in"><h2>📦 Продукти ARCAN</h2></div>
    <div class="card fade-in">
      <div class="table-wrap">
        <table>
          <thead><tr><th>SKU</th><th>Име</th><th>Категория</th><th>Описание</th><th>Мин. поръчка</th><th>Наличност</th></tr></thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td style="font-weight:600;color:var(--brand-light);">${p.sku}</td>
                <td style="font-weight:500;color:#ddd;">${p.name_bg || p.name}</td>
                <td>${categories[p.category] || p.category}</td>
                <td style="max-width:300px;font-size:11px;color:#888;">${p.description_bg || '—'}</td>
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

// ===== SETTINGS =====
async function renderSettings(el) {
  const s = await api('/api/settings');

  el.innerHTML = `
    <div class="page-header fade-in">
      <h2>⚙️ Интеграции — Настройки</h2>
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

function openNewLeadModal() {
  openModal('Нов лид', `
    <form onsubmit="createLead(event)">
      <div class="form-grid">
        <div class="form-group"><label>Компания</label><input name="company_name" required></div>
        <div class="form-group"><label>Контакт</label><input name="contact_name"></div>
        <div class="form-group"><label>Email</label><input name="email" type="email"></div>
        <div class="form-group"><label>Телефон</label><input name="phone"></div>
        <div class="form-group"><label>Град</label><input name="city"></div>
        <div class="form-group">
          <label>Тип фирма</label>
          <select name="company_type">
            <option value="construction">Строителна фирма</option>
            <option value="designer">Проектант</option>
            <option value="distributor">Дистрибутор</option>
            <option value="other">Друго</option>
          </select>
        </div>
        <div class="form-group">
          <label>Източник</label>
          <select name="source">
            <option value="website">Сайт</option>
            <option value="facebook">Facebook</option>
            <option value="phone">Телефон</option>
            <option value="email">Email</option>
            <option value="chatbot">Чатбот</option>
          </select>
        </div>
        <div class="form-group">
          <label>Приоритет</label>
          <select name="priority">
            <option value="medium">Среден</option>
            <option value="high">Висок</option>
            <option value="hot">Горещ</option>
            <option value="low">Нисък</option>
          </select>
        </div>
        <div class="form-group"><label>Продукти (интерес)</label><input name="interest_products" placeholder="HB-PU500, PAK-01..."></div>
        <div class="form-group"><label>Стойност (лв)</label><input name="estimated_value" type="number"></div>
        <div class="form-group full"><label>Бележки</label><textarea name="notes" rows="2"></textarea></div>
      </div>
      <div class="modal-footer" style="padding:12px 0 0;border-top:1px solid var(--border);margin-top:12px;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Отказ</button>
        <button type="submit" class="btn btn-primary">💾 Създай</button>
      </div>
    </form>
  `);
}

async function createLead(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  if (data.estimated_value) data.estimated_value = parseFloat(data.estimated_value);
  try {
    await api('/api/leads', { method: 'POST', body: data });
    closeModal();
    navigate('leads');
  } catch (err) {
    alert('Грешка: ' + err.message);
  }
}

async function openLeadDetail(id) {
  try {
    const data = await api(`/api/leads/${id}`);
    const l = data.lead;

    openModal(`${l.company_name || 'Лид #' + l.id}`, `
      <div class="form-grid">
        <div class="form-group"><label>Компания</label><input id="ld-company" value="${l.company_name || ''}"></div>
        <div class="form-group"><label>Контакт</label><input id="ld-contact" value="${l.contact_name || ''}"></div>
        <div class="form-group"><label>Email</label><input id="ld-email" value="${l.email || ''}"></div>
        <div class="form-group"><label>Телефон</label><input id="ld-phone" value="${l.phone || ''}"></div>
        <div class="form-group"><label>Град</label><input id="ld-city" value="${l.city || ''}"></div>
        <div class="form-group">
          <label>Статус</label>
          <select id="ld-status">
            ${['new','contacted','qualified','offer_sent','negotiation','won','lost'].map(s =>
              `<option value="${s}" ${l.status===s?'selected':''}>${statusLabel(s)}</option>`
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
        <div class="form-group"><label>Стойност (лв)</label><input id="ld-value" type="number" value="${l.estimated_value || ''}"></div>
        <div class="form-group full"><label>Бележки</label><textarea id="ld-notes" rows="2">${l.notes || ''}</textarea></div>
      </div>

      <div style="margin-top:16px;">
        <div class="card-title" style="font-size:12px;">📜 История</div>
        ${(data.activities || []).map(a => `
          <div style="font-size:11px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.03);color:#888;">
            <span style="color:#555;">${new Date(a.created_at).toLocaleString('bg-BG')}</span> —
            <strong style="color:#aaa;">${a.action}</strong>: ${a.description || ''}
          </div>
        `).join('') || '<div style="font-size:11px;color:#555;">Няма активност</div>'}
      </div>

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

async function updateLead(id) {
  const data = {
    company_name: document.getElementById('ld-company').value,
    contact_name: document.getElementById('ld-contact').value,
    email: document.getElementById('ld-email').value,
    phone: document.getElementById('ld-phone').value,
    city: document.getElementById('ld-city').value,
    status: document.getElementById('ld-status').value,
    priority: document.getElementById('ld-priority').value,
    estimated_value: parseFloat(document.getElementById('ld-value').value) || null,
    notes: document.getElementById('ld-notes').value,
  };
  try {
    await api(`/api/leads/${id}`, { method: 'PUT', body: data });
    closeModal();
    navigate(currentPage);
  } catch (err) {
    alert('Грешка: ' + err.message);
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

// ===== HELPERS =====
function statusLabel(s) {
  const map = {
    new: 'Нов', contacted: 'Контактуван', qualified: 'Квалифициран',
    offer_sent: 'Оферта', negotiation: 'Преговори', won: 'Спечелен', lost: 'Загубен'
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
refreshRole().finally(() => navigate('dashboard'));
