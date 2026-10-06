/* ============================================================
   ВЫПАДАЮЩИЙ СПИСОК УВЕДОМЛЕНИЙ
   — клик по 🔔 открывает/закрывает
   — клик по уведомлению: пометить прочитанным + открыть сущность
   ============================================================ */

let notifDropdownOpen = false;

function toggleNotifDropdown(forceState) {
  const dd = document.getElementById('notif-dropdown');
  if (!dd) return;
  notifDropdownOpen = typeof forceState === 'boolean' ? forceState : !notifDropdownOpen;
  dd.classList.toggle('hidden', !notifDropdownOpen);
  if (notifDropdownOpen) {
    renderNotifDropdown();
  }
}

function closeNotifDropdown() {
  toggleNotifDropdown(false);
}

async function renderNotifDropdown() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  try {
    const data = await api('/api/notifications');
    const items = data.list || [];

    if (!items.length) {
      list.innerHTML = '<div class="notif-empty">🔕 Уведомлений нет</div>';
      return;
    }

    list.innerHTML = items.map(n => renderNotifItem(n)).join('');

    // Клик по уведомлению
    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('.notif-del')) return;
        const id = +el.dataset.id;
        const n = items.find(x => x.id === id);
        if (!n) return;

        // Помечаем прочитанным
        try {
          await api('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id] })
          });
        } catch {}

        el.classList.remove('unread');
        await loadNotif(); // обновить счётчик

        // Открываем связанную сущность
        closeNotifDropdown();

        if (n.document_id) {
          // Если есть примечание — запоминаем, чтобы открыть его в документе
          if (n.annotation_id) {
            state.pendingAnnotationId = n.annotation_id;
          }
          setTimeout(() => {
            if (typeof openDoc === 'function') {
              openDoc(n.document_id);
            }
          }, 150);
        }
      });
    });

  } catch (e) {
    list.innerHTML = `<div class="notif-empty">Ошибка: ${esc(e.message)}</div>`;
  }
}

function renderNotifItem(n) {
  const unreadCls = n.is_read ? '' : 'unread';

  // Иконка в зависимости от типа
  const icons = {
    approval_request: '📥',
    signed:           '✅',
    cancelled:        '❌',
    signer_added:     '➕',
    annotation_added: '🔖',
    annotation_comment: '💬',
    security:         '🔒'
  };
  const icon = icons[n.type] || '🔔';

  // Класс цвета
  const typeCls = 'nt-' + (n.type || 'default').replace(/_/g, '-');

  return `
    <div class="notif-item ${unreadCls} ${typeCls}" data-id="${n.id}" data-doc="${n.document_id || ''}" data-annot="${n.annotation_id || ''}">
      <div class="notif-item-icon">${icon}</div>
      <div class="notif-item-body">
        <div class="notif-item-text">${esc(n.message)}</div>
        <div class="notif-item-date">${fmtDate(n.created_at || n.createdAt)}</div>
      </div>
      ${!n.is_read ? '<span class="notif-item-dot"></span>' : ''}
    </div>`;
}

// Привязка кнопки и закрытие по клику вне
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-notifications');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotifDropdown();
    });
  }

  const clearBtn = document.getElementById('notif-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        await loadNotif();
        renderNotifDropdown();
      } catch {}
    });
  }

  // Закрытие при клике вне
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.notif-wrap');
    if (!wrap) return;
    if (!wrap.contains(e.target)) closeNotifDropdown();
  });

  // Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNotifDropdown();
  });
});


/* ============================================================
   ТЕМЫ — переключение и сохранение
   ============================================================ */

(function initTheme() {
  const STORAGE_KEY = 'edo_theme';
  const html = document.documentElement;

  function applyTheme(theme) {
    const isLight = theme === 'light';
    html.classList.toggle('theme-light', isLight);
    html.classList.toggle('theme-dark', !isLight);

    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.textContent = isLight ? '☀️' : '🌙';
      btn.title = isLight ? 'Переключить на тёмную' : 'Переключить на светлую';
    }

    // Плавный переход
    document.body.classList.add('theme-transitioning');
    setTimeout(() => document.body.classList.remove('theme-transitioning'), 250);
  }

  function getSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY) || 'dark'; }
    catch { return 'dark'; }
  }

  function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }

  function toggleTheme() {
    const current = html.classList.contains('theme-light') ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    saveTheme(next);
    applyTheme(next);
  }

  // Применяем сразу при загрузке (до отрисовки)
  applyTheme(getSavedTheme());

  // Привязка кнопки после загрузки DOM
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
    // Синхронизируем иконку
    applyTheme(getSavedTheme());
  });

  // Экспортируем для возможного внешнего использования
  window.EdoTheme = { applyTheme, toggleTheme, getSavedTheme };
})();



'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function fmtDate(s) {
  if (!s) return '—';
  const iso = String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d)) return String(s);
  return d.toLocaleString('ru-RU',
    { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtSize(b) {
  if (!b) return '0 Б';
  const u = ['Б','КБ','МБ','ГБ']; let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
}

const STATUS = { draft:'Черновик', pending:'Ожидает утверждения',
                 approved:'Утверждён', rejected:'Не утверждён' };
const APPR   = { pending:'Ожидает подписи', signed:'Подписано',
                 cancelled:'Подпись отменена' };

const state = {
  user: null, tab: 'mine',
  notif: { list: [], unread: 0, inbox: 0 },
  pollTimer: null
,
  pendingAnnotationId: null
};

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  if (res.status === 401 && !url.endsWith('/api/login')) {
    showLogin(); throw new Error('Не авторизован');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error((data && data.error) || ('Ошибка ' + res.status));
  return data;
}

let toastTimer = null;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

function showLogin() { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); closeModal(); }
function showApp()   { $('#login').classList.add('hidden');    $('#app').classList.remove('hidden'); }

async function boot() {
  try {
    state.user = await api('/api/me');
    showApp();
    if (state.user.isAdmin) $('#btn-admin').classList.remove('hidden');
    await loadNotif();
    await renderTab();
    startPoll();
    handleDocParam();
  } catch { showLogin(); }
}

function startPoll() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    if (!state.user) return;
    try { await loadNotif(); } catch {}
  }, 20000);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    state.user = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: $('#login-username').value.trim(),
        password: $('#login-password').value
      })
    });
    $('#login-password').value = '';
    showApp();
    if (state.user.isAdmin) $('#btn-admin').classList.remove('hidden');
    else $('#btn-admin').classList.add('hidden');
    await loadNotif();
    await renderTab();
    startPoll();
    handleDocParam();
  } catch (e) { $('#login-error').textContent = e.message; }
});

$('#btn-logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  state.user = null; clearInterval(state.pollTimer); showLogin();
});
$('#btn-profile').addEventListener('click', openProfile);
$('#btn-admin').addEventListener('click', openAdminUsers);
$('#btn-notifications').addEventListener('click', () => switchTab('notifications'));
$('#btn-new').addEventListener('click', () => openComposer());
$$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

function switchTab(tab) {
  // Все вкладки ведут на единый канбан
  state.tab = 'mine';
  const tabEl = $('#tabs'); if (tabEl) tabEl.style.display = 'none';
  renderMine();
}
async function renderTab() {
  return renderMine();
}

async function renderInbox() {
  const main = $('#main');
  main.innerHTML = '<div class="loading">Загрузка…</div>';
  try {
    const docs = await api('/api/documents?box=inbox');
    if (!docs.length) {
      main.innerHTML = '<div class="empty">Задач нет ✓<br><span class="small">Документы на подпись появятся здесь</span></div>';
      return;
    }
    main.innerHTML = docs.map(d => docCard(d, 'inbox')).join('');
    $$('.doc-card', main).forEach(el => el.addEventListener('click', () => openDoc(el.dataset.id)));
  } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

async function renderRejected() {
  const main = $('#main');
  main.innerHTML = '<div class="loading">Загрузка…</div>';
  try {
    const docs = await api('/api/documents?box=rejected');
    if (!docs.length) {
      main.innerHTML = '<div class="empty">Не утверждённых документов нет<br><span class="small">Здесь появятся документы, у которых кто-то отменил подпись</span></div>';
      return;
    }
    main.innerHTML = docs.map(d => docCardRejected(d)).join('');
    $$('.doc-card', main).forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-del-force]')) {
          e.stopPropagation();
          return deleteDocForce(+el.dataset.id);
        }
        openDoc(el.dataset.id);
      });
    });
  } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function docCardRejected(d) {
  const role = d.isOwner ? 'Вы отправитель' : `От: ${esc(d.ownerName || '—')}`;
  const reason = d.rejectReason
    ? `<span class="doc-reason" title="${esc(d.rejectReason)}">
         <b>${esc(d.rejectAuthor || 'Отказ')}:</b> ${esc(d.rejectReason)}
       </span>`
    : '';
  const del = state.user?.isAdmin ? `
    <div class="row-actions" style="margin-top:10px">
      <button class="btn small danger-outline" data-del-force="${d.id}">Удалить (админ)</button>
    </div>` : '';
  return `<div class="doc-card" data-id="${d.id}">
    <div class="doc-head">
      <div class="doc-title">${esc(d.title)}</div>
      ${reason}
    </div>
    <div>${statusBadge('rejected')}</div>
    <div class="doc-sub">
      <span>${role}</span>
      <span>${fmtDate(d.createdAt)}</span>
      <span>${fmtSize(d.size)}</span>
    </div>
    ${del}
  </div>`;
}

/* ============================================================
   КАНБАН-ДОСКА для «Моих документов»
   4 колонки: Черновики / Ожидают / Утверждённые / Не утверждены
   ============================================================ */




async function renderApproved() {
  const main = $('#main');
  main.innerHTML = '<div class="loading">Загрузка…</div>';
  try {
    const docs = await api('/api/documents?box=approved');
    if (!docs.length) {
      main.innerHTML = '<div class="empty">Утверждённых документов нет<br><span class="small">Здесь появятся документы, которые подписали все получатели</span></div>';
      return;
    }
    main.innerHTML = docs.map(d => docCardApproved(d)).join('');
    $$('.doc-card', main).forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-del-force]')) {
          e.stopPropagation();
          return deleteDocForce(+el.dataset.id);
        }
        openDoc(el.dataset.id);
      });
    });
  } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function docCardApproved(d) {
  const role = d.isOwner ? 'Вы отправитель' : `От: ${esc(d.ownerName || '—')}`;
  const count = d.approvalsCount ? `Подписей: ${d.signedCount}/${d.approvalsCount}` : '';
  const del = state.user?.isAdmin ? `
    <div class="row-actions" style="margin-top:10px">
      <button class="btn small danger-outline" data-del-force="${d.id}">Удалить (админ)</button>
    </div>` : '';
  return `<div class="doc-card" data-id="${d.id}">
    <div class="doc-title">${esc(d.title)}</div>
    <div>${statusBadge('approved')}</div>
    <div class="doc-sub">
      <span>${role}</span>
      ${count ? `<span>${count}</span>` : ''}
      <span>${fmtDate(d.createdAt)}</span>
      <span>${fmtSize(d.size)}</span>
    </div>
    ${del}
  </div>`;
}

function docCard(d, box) {
  const badge = box === 'inbox'
    ? `${statusBadge(d.status)}${d.approvalStatus ? ` <span class="badge ap-${d.approvalStatus}">${APPR[d.approvalStatus]}</span>` : ''}`
    : statusBadge(d.status);
  const sub = box === 'inbox'
    ? `От: ${esc(d.ownerName || '—')} · ${fmtDate(d.createdAt)}`
    : `${d.approvalsCount ? `Подписали ${d.signedCount}/${d.approvalsCount} · ` : ''}${fmtDate(d.createdAt)}`;

  const senderInfo = (box === 'mine' && d.status === 'draft' && d.senderSigned)
    ? `<div class="sender-signed-badge">✍️ Подписано отправителем: ${fmtDate(d.senderSignedAt)}</div>`
    : '';

  // Кнопки для статуса draft (только владелец)
  let actions = (box === 'mine' && d.status === 'draft') ? `
    <div class="row-actions" style="margin-top:10px">
      <button class="btn small primary" data-send="${d.id}">Отправить</button>
      <button class="btn small danger-outline" data-del="${d.id}">Удалить</button>
    </div>` : '';

  // Для админа — кнопка удаления в статусе pending (в любом табе)
  if (state.user?.isAdmin && d.status === 'pending') {
    actions = `
      <div class="row-actions" style="margin-top:10px">
        <button class="btn small danger-outline" data-del-force="${d.id}">Удалить (админ)</button>
      </div>`;
  }

  return `<div class="doc-card" data-id="${d.id}">
    <div class="doc-title">${esc(d.title)}</div>
    <div>${badge}</div>
    ${senderInfo}
    <div class="doc-sub"><span>${sub}</span><span>${fmtSize(d.size)}</span></div>
    ${actions}
  </div>`;
}
const statusBadge = s => `<span class="badge status-${s}">${STATUS[s] || s}</span>`;

async function loadNotif() {
  const data = await api('/api/notifications');
  state.notif = data;

  const b = $('#notif-badge');
  if (data.unread > 0) { b.textContent = data.unread > 99 ? '99+' : data.unread; b.classList.remove('hidden'); }
  else b.classList.add('hidden');

  const ib = $('#inbox-badge');
  if (ib) {
    if (data.inbox > 0) { ib.textContent = data.inbox > 99 ? '99+' : data.inbox; ib.classList.remove('hidden'); }
    else ib.classList.add('hidden');
  }

  if (state.tab === 'notifications') renderNotifications();
}

async function renderNotifications() {
  const main = $('#main');
  const list = state.notif.list;
  if (!list.length) { main.innerHTML = '<div class="empty">Уведомлений нет</div>'; return; }
  main.innerHTML = `
    <div class="row-actions" style="margin:0 0 12px">
      <button class="btn small" id="read-all">Отметить все прочитанными</button>
    </div>
    ${list.map(n => `<div class="notif ${n.is_read ? '' : 'unread'}">
      <div class="notif-msg">${esc(n.message)}</div>
      <div class="notif-date">${fmtDate(n.created_at)}</div>
    </div>`).join('')}`;
  $('#read-all').addEventListener('click', async () => {
    await api('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await loadNotif();
    renderNotifications();
  });
}

function closeModal() { $('#modal-root').innerHTML = ''; }
function openModal({ title, body, onMount }) {
  $('#modal-root').innerHTML = `
    <div class="overlay" id="ovl">
      <div class="sheet">
        <div class="sheet-head">
          <button class="icon-btn" id="m-close">✕</button>
          <div class="sheet-title">${esc(title)}</div>
        </div>
        <div class="sheet-body" id="m-body">${body}</div>
      </div>
    </div>`;
  $('#m-close').addEventListener('click', closeModal);
  $('#ovl').addEventListener('click', e => { if (e.target.id === 'ovl') closeModal(); });
  if (onMount) onMount($('#m-body'));
}

async function openProfile() {
  try {
    const st = await api('/api/keys/status');
    openModal({
      title: 'Личный кабинет',
      body: `
        <div class="section">
          <h3>Пользователь</h3>
          <div class="meta-grid">
            <div><span>Логин</span><div>${esc(state.user.username)}</div></div>
            <div><span>ФИО</span><div>${esc(state.user.fullName)}</div></div>
            <div><span>Роль</span><div>${state.user.isAdmin ? 'Администратор' : 'Пользователь'}</div></div>
          </div>
        </div>
        ${state.user?.isAdmin ? `
        <div class="section">
          <h3>Категории документов</h3>
          <p class="muted small" style="margin-top:0">Управление категориями для загружаемых документов.</p>
          <button class="btn primary full" id="open-categories" style="margin-top:8px">Управление категориями</button>
        </div>` : ''}
        <div class="section">
          <h3>Группы подписантов</h3>
          <p class="muted small" style="margin-top:0">Создавайте готовые группы с порядком подписания и используйте их при отправке документов.</p>
          <button class="btn primary full" id="open-groups" style="margin-top:8px">Управление группами</button>
        </div>
        <div class="section">
          <h3>НЭП (электронная подпись)</h3>
          ${st.hasKey
            ? `<p>Ключ создан: <b>${fmtDate(st.createdAt)}</b></p>
               <p class="muted small">Приватный ключ хранится зашифрованным. Пароль НЭП знаете только вы.</p>
               <div class="row-actions" style="margin-top:12px">
                 <button class="btn danger-outline full" id="regen-key">Перегенерировать НЭП</button>
               </div>
               <p class="muted small" style="margin-top:8px;color:var(--warning,#b8860b)">
                 ⚠ После перегенерации <b>все ранее выданные подписи этим ключом станут недействительны</b>.
                 Новый пароль НЭП зададите здесь же.
               </p>`
            : `<p class="muted small">У вас ещё нет ключа. Создайте его — потребуется пароль НЭП (минимум 6 символов).
                 <br>Этот пароль используется при каждой подписи и <b>не может быть восстановлен</b>.</p>
               <label style="margin-top:10px">Пароль НЭП
                 <input type="password" id="np" minlength="6" autocomplete="new-password"></label>
               <label style="margin-top:10px">Повторите пароль
                 <input type="password" id="np2" minlength="6" autocomplete="new-password"></label>
               <button class="btn primary full" id="gen-key" style="margin-top:12px">Сгенерировать НЭП</button>
               <div class="error" id="kp-err"></div>`}
        </div>`,
      onMount(body) {
        const btn = $('#gen-key', body);
        if (btn) {
          btn.addEventListener('click', async () => {
            const p1 = $('#np', body).value;
            const p2 = $('#np2', body).value;
            const err = $('#kp-err', body);
            err.textContent = '';
            if (p1.length < 6) return err.textContent = 'Минимум 6 символов';
            if (p1 !== p2) return err.textContent = 'Пароли не совпадают';
            btn.disabled = true;
            try {
              await api('/api/keys/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nepPassword: p1 })
              });
              toast('НЭП создана', 'success');
              openProfile();
            } catch (e) { err.textContent = e.message; btn.disabled = false; }
          });
        }

        const regenBtn = $('#regen-key', body);
        if (regenBtn) {
          regenBtn.addEventListener('click', () => openRegenerateModal());
        }

        const groupsBtn = $('#open-groups', body);
        if (groupsBtn) {
          groupsBtn.addEventListener('click', () => openGroupsManager());
        }

        const catsBtn = $('#open-categories', body);
        if (catsBtn) {
          catsBtn.addEventListener('click', () => openCategoriesManager());
        }
      }
    });
  } catch (e) { toast(e.message, 'error'); }
}

function openRegenerateModal() {
  openModal({
    title: 'Перегенерация НЭП',
    body: `
      <div class="section">
        <p class="muted small" style="margin-top:0">
          Будет создан новый приватный ключ. Все подписи, сделанные старым ключом,
          станут недействительны. Новый пароль НЭП используется для подписи этим ключом.
        </p>
        <label style="margin-top:12px">Текущий пароль учётной записи
          <input type="password" id="rp-current" autocomplete="current-password">
        </label>
        <label style="margin-top:10px">Новый пароль НЭП (минимум 6 символов)
          <input type="password" id="rp-new" minlength="6" autocomplete="new-password">
        </label>
        <label style="margin-top:10px">Повторите новый пароль НЭП
          <input type="password" id="rp-new2" minlength="6" autocomplete="new-password">
        </label>
        <div class="error" id="rp-err" style="margin-top:10px;min-height:0"></div>
        <div class="row-actions" style="margin-top:14px">
          <button class="btn danger" id="rp-submit">Перегенерировать</button>
          <button class="btn ghost" id="rp-cancel">Отмена</button>
        </div>
      </div>`,
    onMount(body) {
      const submitBtn = $('#rp-submit', body);
      const cancelBtn = $('#rp-cancel', body);
      const errEl = $('#rp-err', body);

      cancelBtn.addEventListener('click', () => openProfile());

      submitBtn.addEventListener('click', async () => {
        errEl.textContent = '';
        const cur = $('#rp-current', body).value;
        const p1 = $('#rp-new', body).value;
        const p2 = $('#rp-new2', body).value;
        if (!cur) return errEl.textContent = 'Введите текущий пароль';
        if (p1.length < 6) return errEl.textContent = 'Пароль НЭП — минимум 6 символов';
        if (p1 !== p2) return errEl.textContent = 'Пароли не совпадают';

        submitBtn.disabled = true;
        submitBtn.textContent = 'Перегенерация...';
        try {
          await api('/api/keys/regenerate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: cur, nepPassword: p1 })
          });
          toast('НЭП успешно перегенерирована', 'success');
          openProfile();
        } catch (e) {
          errEl.textContent = e.message;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Перегенерировать';
        }
      });
    }
  });
}


async function openAdminUsers() {
  const body = `
    <div class="section">
      <h3>Создать пользователя</h3>
      <label>Логин
        <input type="text" id="nu-login" autocapitalize="none" autocomplete="off" placeholder="например: ivanov">
      </label>
      <label style="margin-top:10px">ФИО
        <input type="text" id="nu-name" placeholder="Иванов Иван Иванович">
      </label>
      <label style="margin-top:10px">Пароль (мин. 6 символов)
        <input type="password" id="nu-pass" autocomplete="new-password">
      </label>
      <label style="margin-top:10px;flex-direction:row;align-items:center;gap:8px;color:var(--text)">
        <input type="checkbox" id="nu-admin"> Сделать администратором
      </label>
      <button class="btn primary full" id="nu-submit" style="margin-top:12px">Создать</button>
      <div class="error" id="nu-err"></div>
    </div>
    <div class="section">
      <h3>Пользователи системы</h3>
      <div id="users-list"><div class="muted small">Загрузка…</div></div>
    </div>`;

  openModal({
    title: 'Управление пользователями',
    body,
    onMount: async (host) => {
      const listEl = $('#users-list', host);
      const errEl = $('#nu-err', host);

      async function refresh() {
        try {
          const users = await api('/api/admin/users');
          if (!users.length) { listEl.innerHTML = '<div class="muted small">Нет пользователей</div>'; return; }
          listEl.innerHTML = users.map(u => `
            <div class="approver-row static">
              <div class="approver-info">
                <div class="approver-name">${esc(u.fullName)}${u.is_admin ? ' <span class="badge status-pending" style="margin-left:6px">Админ</span>' : ''}${u.id === state.user.id ? ' <span class="muted small">(вы)</span>' : ''}</div>
                <div class="muted small">@${esc(u.username)} · создан ${fmtDate(u.created_at)}</div>
              </div>
              ${u.id === state.user.id ? '' : `<button class="btn small danger-outline" data-del-user="${u.id}">Удалить</button>`}
            </div>`).join('');

          $$('[data-del-user]', listEl).forEach(btn => {
            btn.addEventListener('click', async () => {
              const id = +btn.dataset.delUser;
              if (!confirm('Удалить пользователя? Действие необратимо.')) return;
              try {
                await api('/api/admin/users/' + id, { method: 'DELETE' });
                toast('Пользователь удалён', 'success');
                refresh();
              } catch (e) { toast(e.message, 'error'); }
            });
          });
        } catch (e) {
          listEl.innerHTML = `<div class="muted small">${esc(e.message)}</div>`;
        }
      }

      $('#nu-submit', host).addEventListener('click', async () => {
        errEl.textContent = '';
        const username = $('#nu-login', host).value.trim();
        const fullName = $('#nu-name', host).value.trim();
        const password = $('#nu-pass', host).value;
        const isAdmin  = $('#nu-admin', host).checked;

        if (!username) return errEl.textContent = 'Введите логин';
        if (!fullName) return errEl.textContent = 'Введите ФИО';
        if (password.length < 6) return errEl.textContent = 'Пароль — минимум 6 символов';

        try {
          await api('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, fullName, password, isAdmin })
          });
          toast('Пользователь создан', 'success');
          $('#nu-login', host).value = '';
          $('#nu-name', host).value = '';
          $('#nu-pass', host).value = '';
          $('#nu-admin', host).checked = false;
          refresh();
        } catch (e) { errEl.textContent = e.message; }
      });

      refresh();
    }
  });
}

/* ============================================================
   Группы подписантов — раздел в личном кабинете
   ============================================================ */



/* ============================================================
   Редактор группы с уровнями подписания
   ============================================================ */

function openGroupEditor(group, users, onSaved) {
  const isNew = !group;
  const draft = {
    id: group?.id || null,
    name: group?.name || '',
    sequential: group?.sequential || false,
    levels: group?.levels
      ? group.levels.map(lvl => ({ members: lvl.members.map(m => ({ userId: m.userId, name: m.fullName })) }))
      : [{ members: [] }]
  };

  openModal({
    title: isNew ? 'Новая группа' : 'Редактирование группы',
    body: `
      <div class="section">
        <label>Название группы
          <input type="text" id="g-name" maxlength="200" value="${esc(draft.name)}" placeholder="Например: Согласующие договора">
        </label>
        <label class="group-toggle" style="margin-top:10px">
          <input type="checkbox" id="g-seq" ${draft.sequential ? 'checked' : ''}>
          <span>По очереди — этапы подписываются последовательно</span>
        </label>
      </div>
      <div class="section">
        <h3>Этапы подписания</h3>
        <p class="muted small" style="margin-top:0">На одном уровне может быть несколько участников — они подписывают параллельно. Следующий уровень включается после подписания всеми на текущем.</p>
        <div id="g-levels"></div>
        <button class="btn" id="g-add-level" type="button" style="margin-top:8px">+ Добавить этап</button>
      </div>
      <div class="row-actions" style="margin-top:12px">
        <button class="btn primary" id="g-save">${isNew ? 'Создать' : 'Сохранить'}</button>
        <button class="btn ghost" id="g-cancel">Отмена</button>
      </div>
      <div class="error" id="g-err"></div>
    `,
    onMount(body) {
      const nameEl    = $('#g-name', body);
      const seqEl     = $('#g-seq', body);
      const levelsEl  = $('#g-levels', body);
      const addLevel  = $('#g-add-level', body);
      const saveBtn   = $('#g-save', body);
      const cancelBtn = $('#g-cancel', body);
      const errEl     = $('#g-err', body);

      nameEl.value = draft.name;
      seqEl.checked = draft.sequential;

      function renderLevels() {
        levelsEl.innerHTML = draft.levels.map((lvl, li) => `
          <div class="level-card" data-li="${li}">
            <div class="level-head">
              <span class="level-title">Этап ${li + 1}</span>
              ${draft.levels.length > 1 ? `<button class="order-btn order-del" data-rm-level="${li}" type="button">✕</button>` : ''}
            </div>
            <div class="level-members">
              ${lvl.members.length
                ? lvl.members.map((m, mi) => `
                    <span class="member-chip">
                      ${esc(m.name)}
                      <span class="member-rm" data-rm="${li}:${mi}">×</span>
                    </span>`).join('')
                : '<span class="muted small">Пусто — добавьте участника</span>'}
            </div>
            <button class="btn small" data-add-to="${li}" type="button" style="margin-top:6px">+ Добавить в уровень</button>
          </div>
        `).join('');
      }

      addLevel.addEventListener('click', () => {
        draft.levels.push({ members: [] });
        renderLevels();
      });

      levelsEl.addEventListener('click', e => {
        const rmLevel = e.target.closest('[data-rm-level]');
        const rmMember = e.target.closest('[data-rm]');
        const addTo = e.target.closest('[data-add-to]');

        if (rmLevel) {
          draft.levels.splice(+rmLevel.dataset.rmLevel, 1);
          renderLevels();
          return;
        }
        if (rmMember) {
          const [li, mi] = rmMember.dataset.rm.split(':').map(Number);
          draft.levels[li].members.splice(mi, 1);
          renderLevels();
          return;
        }
        if (addTo) {
          const li = +addTo.dataset.addTo;
          openUserPicker(li);
        }
      });

      function openUserPicker(levelIndex) {
        // Создаём дропдаун поверх
        const used = new Set(draft.levels.flatMap(l => l.members.map(m => m.userId)));
        const wrap = document.createElement('div');
        wrap.className = 'picker-overlay';
        wrap.innerHTML = `
          <div class="picker-modal">
            <div class="picker-modal-head">
              <div style="font-weight:700">Добавить в этап ${levelIndex + 1}</div>
              <button class="order-btn order-del" id="pm-close" type="button">✕</button>
            </div>
            <input type="text" class="approver-dropdown-search" id="pm-search" placeholder="🔍 Поиск по ФИО..." autofocus>
            <div class="picker-modal-list" id="pm-list"></div>
          </div>`;
        document.body.appendChild(wrap);

        const listEl = wrap.querySelector('#pm-list');
        const searchEl = wrap.querySelector('#pm-search');
        const closeBtn = wrap.querySelector('#pm-close');

        function renderList(q) {
          const query = (q || '').toLowerCase().trim();
          const filtered = users.filter(u =>
            !used.has(u.id) && (query === '' || u.full_name.toLowerCase().includes(query))
          );
          if (!filtered.length) {
            listEl.innerHTML = '<div class="muted small" style="padding:14px;text-align:center">Ничего не найдено</div>';
            return;
          }
          listEl.innerHTML = filtered.map(u => `
            <div class="picker-modal-item" data-id="${u.id}" data-name="${esc(u.full_name)}">
              <div style="font-weight:600">${esc(u.full_name)}</div>
              <div class="muted small">@${esc(u.username)}</div>
            </div>`).join('');
        }

        searchEl.addEventListener('input', () => renderList(searchEl.value));
        listEl.addEventListener('click', e => {
          const item = e.target.closest('.picker-modal-item');
          if (!item) return;
          const userId = +item.dataset.id;
          const name = item.dataset.name;
          draft.levels[levelIndex].members.push({ userId, name });
          document.body.removeChild(wrap);
          renderLevels();
        });
        closeBtn.addEventListener('click', () => document.body.removeChild(wrap));
        wrap.addEventListener('click', e => { if (e.target === wrap) document.body.removeChild(wrap); });
        renderList('');
        setTimeout(() => searchEl.focus(), 50);
      }

      cancelBtn.addEventListener('click', () => openGroupsManager());

      saveBtn.addEventListener('click', async () => {
        errEl.textContent = '';
        draft.name = nameEl.value.trim();
        draft.sequential = seqEl.checked;
        if (!draft.name) return errEl.textContent = 'Укажите название';
        const hasMembers = draft.levels.some(l => l.members.length > 0);
        if (!hasMembers) return errEl.textContent = 'Добавьте хотя бы одного участника';

        // Убираем пустые уровни
        const cleanLevels = draft.levels.filter(l => l.members.length > 0);
        const payload = {
          name: draft.name,
          sequential: draft.sequential,
          levels: cleanLevels.map(l => ({ members: l.members.map(m => ({ userId: m.userId })) }))
        };

        saveBtn.disabled = true;
        try {
          if (isNew) {
            await api('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          } else {
            await api(`/api/groups/${draft.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          }
          toast(isNew ? 'Группа создана' : 'Группа сохранена', 'success');
          if (typeof onSaved === 'function') onSaved();
          else openGroupsManager();
        } catch (e) {
          errEl.textContent = e.message;
          saveBtn.disabled = false;
        }
      });

      renderLevels();
    }
  });
}

/* ============================================================
   Менеджер групп — список с уровнями
   ============================================================ */

async function openGroupsManager() {
  let users = [];
  let groups = [];
  try {
    users = await api('/api/users');
    groups = await api('/api/groups');
  } catch (e) { return toast(e.message, 'error'); }

  openModal({
    title: 'Группы подписантов',
    body: `
      <div class="section">
        <button class="btn primary full" id="g-new">+ Создать группу</button>
      </div>
      <div class="section">
        <h3>Мои группы</h3>
        <div id="g-list"></div>
      </div>
    `,
    onMount(body) {
      const listEl = $('#g-list', body);
      const newBtn = $('#g-new', body);

      function renderList() {
        if (!groups.length) {
          listEl.innerHTML = '<div class="muted small">Групп пока нет.</div>';
          return;
        }
        listEl.innerHTML = groups.map(g => `
          <div class="group-card" data-id="${g.id}">
            <div class="group-card-head">
              <div>
                <div class="group-card-name">👥 ${esc(g.name)}</div>
                <div class="muted small">${g.sequential ? '🔢 По очереди' : '🔄 Параллельно'} · ${g.members.length} участник(ов) · ${g.levels.length} этап.</div>
              </div>
            </div>
            <div class="group-card-levels">
              ${g.levels.map(lvl => `
                <div class="group-level-line">
                  <span class="group-level-num">${lvl.levelIndex}</span>
                  <span class="group-level-members">${lvl.members.map(m => esc(m.fullName)).join(' + ')}</span>
                </div>`).join('')}
            </div>
            <div class="row-actions" style="margin-top:8px">
              <button class="btn small" data-edit="${g.id}">Редактировать</button>
              <button class="btn small danger-outline" data-del="${g.id}">Удалить</button>
            </div>
          </div>
        `).join('');
      }

      async function reload() {
        try { groups = await api('/api/groups'); renderList(); }
        catch (e) { toast(e.message, 'error'); }
      }

      listEl.addEventListener('click', async e => {
        const editBtn = e.target.closest('[data-edit]');
        const delBtn = e.target.closest('[data-del]');
        if (editBtn) {
          const g = groups.find(x => x.id === +editBtn.dataset.edit);
          if (g) openGroupEditor(g, users, reload);
        }
        if (delBtn) {
          if (!confirm('Удалить группу?')) return;
          try { await api(`/api/groups/${delBtn.dataset.del}`, { method: 'DELETE' }); reload(); }
          catch (err) { toast(err.message, 'error'); }
        }
      });

      newBtn.addEventListener('click', () => openGroupEditor(null, users, reload));
      renderList();
    }
  });
}

/* ============================================================
   Модалка добавления подписанта участником подписания
   ============================================================ */


/* ============================================================
   Модалка добавления нескольких подписантов
   ============================================================ */

async function openAddSignerModal(doc) {
  let users = [];
  try { users = await api('/api/users'); } catch {}

  const already = new Set((doc.approvals || []).map(a => a.approverId));
  already.add(doc.ownerId);
  users = users.filter(u => !already.has(u.id));

  const draft = {
    selected: [],   // [{ userId, name }]
    page: null,
    x: null,
    y: null
  };

  openModal({
    title: 'Добавить подписантов',
    body: `
      <div class="section">
        <p class="muted small" style="margin-top:0">
          Вы можете добавить одного или нескольких участников. Они будут подписывать <b>одновременно</b> на выбранном этапе.
        </p>

        <label style="display:block;margin-top:6px">Выбранные подписанты</label>
        <div id="as-chips" class="as-chips"></div>

        <div class="approver-picker" style="margin-top:8px">
          <input type="text" class="approver-picker-input" id="as-picker" placeholder="Нажмите, чтобы добавить подписанта" readonly>
          <div class="approver-dropdown hidden" id="as-drop">
            <input type="text" class="approver-dropdown-search" id="as-search" placeholder="🔍 Поиск по ФИО...">
            <div class="approver-dropdown-items" id="as-items"></div>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Место подписи</h3>
        <div id="as-status" class="sender-status">❌ Место не выбрано</div>
        <p class="muted small" style="margin:6px 0 8px">
          Кликните на документе — это будет <b>единое место подписи</b> для всех выбранных.
        </p>
        <div class="pages" id="as-pages"></div>
      </div>

      <div class="row-actions" style="margin-top:12px">
        <button class="btn primary" id="as-submit" disabled>Добавить</button>
        <button class="btn ghost" id="as-cancel">Отмена</button>
      </div>
      <div class="error" id="as-err" style="min-height:0"></div>
    `,
    onMount(body) {
      const chipsEl   = $('#as-chips', body);
      const pickerEl  = $('#as-picker', body);
      const dropEl    = $('#as-drop', body);
      const searchEl  = $('#as-search', body);
      const itemsEl   = $('#as-items', body);
      const pagesEl   = $('#as-pages', body);
      const statusEl  = $('#as-status', body);
      const submitBtn = $('#as-submit', body);
      const cancelBtn = $('#as-cancel', body);
      const errEl     = $('#as-err', body);

      // Превью страниц
      pagesEl.innerHTML = Array.from({ length: doc.pages }, (_, i) => `
        <div class="page-wrap placing" data-page="${i + 1}">
          <img class="page-img" src="/api/documents/${doc.id}/pages/${i + 1}" loading="lazy" alt="">
          <div class="page-overlay"></div>
        </div>`).join('');

      // Показываем уже занятые места (подпись отправителя + подписи других получателей)
      function renderExistingStamps() {
        pagesEl.querySelectorAll('.existing-stamp').forEach(el => el.remove());

        // Отправитель
        if (doc.senderSigned && doc.senderPage != null) {
          const wrap = pagesEl.querySelector(`.page-wrap[data-page="${doc.senderPage}"]`);
          if (wrap) {
            const s = document.createElement('div');
            s.className = 'existing-stamp existing-sender';
            s.style.left = ((doc.senderPosX ?? 0.5) * 100) + '%';
            s.style.top = ((doc.senderPosY ?? 0.75) * 100) + '%';
            s.innerHTML = `<div class="existing-name">✍️ ${esc(doc.ownerName)}</div>`;
            wrap.appendChild(s);
          }
        }

        // Все approvals
        (doc.approvals || []).forEach(a => {
          if (a.page == null || a.x == null || a.y == null) return;
          const wrap = pagesEl.querySelector(`.page-wrap[data-page="${a.page}"]`);
          if (!wrap) return;
          const s = document.createElement('div');
          s.className = 'existing-stamp existing-' + a.status;
          s.style.left = (a.x * 100) + '%';
          s.style.top = (a.y * 100) + '%';
          const mark = a.status === 'signed' ? '✓' : (a.status === 'cancelled' ? '✕' : '⏳');
          s.innerHTML = `<div class="existing-name">${mark} ${esc(a.approverName)}</div>`;
          wrap.appendChild(s);
        });
      }

      // Ждём загрузки картинок и только потом рендерим существующие места
      setTimeout(renderExistingStamps, 150);

      let stamp = null;
      pagesEl.addEventListener('click', e => {
        const wrap = e.target.closest('.page-wrap');
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        draft.page = +wrap.dataset.page;
        draft.x = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
        draft.y = Math.min(0.98, Math.max(0.02, (e.clientY - rect.top)  / rect.height));

        if (stamp) stamp.remove();
        stamp = document.createElement('div');
        stamp.className = 'stamp group-stamp placing active';
        stamp.style.left = (draft.x * 100) + '%';
        stamp.style.top  = (draft.y * 100) + '%';
        stamp.innerHTML = `
          <div class="group-stamp-title">👥 Новые подписанты</div>
          ${draft.selected.length
            ? draft.selected.map((s, i) => `<div class="group-stamp-row"><span class="group-stamp-num">${i + 1}.</span><span>${esc(s.name)}</span></div>`).join('')
            : '<div class="group-stamp-empty">Никто не выбран</div>'}
        `;
        wrap.appendChild(stamp);

        statusEl.classList.add('done');
        statusEl.innerHTML = `✅ Место выбрано: Стр. ${draft.page} (${Math.round(draft.x * 100)}% / ${Math.round(draft.y * 100)}%)`;
        updateSubmit();
      });

      // Чипы выбранных
      function renderChips() {
        if (!draft.selected.length) {
          chipsEl.innerHTML = '<span class="muted small">Никого не выбрано</span>';
          return;
        }
        chipsEl.innerHTML = draft.selected.map((s, i) => `
          <span class="as-chip">
            <span class="as-chip-name">${esc(s.name)}</span>
            <span class="as-chip-rm" data-rm="${s.userId}" title="Убрать">×</span>
          </span>`).join('');
      }

      chipsEl.addEventListener('click', e => {
        const rm = e.target.closest('[data-rm]');
        if (!rm) return;
        const uid = +rm.dataset.rm;
        draft.selected = draft.selected.filter(s => s.userId !== uid);
        renderChips();
        updateStamp();
        updateSubmit();
      });

      function updateStamp() {
        if (!stamp) return;
        stamp.innerHTML = `
          <div class="group-stamp-title">👥 Новые подписанты</div>
          ${draft.selected.length
            ? draft.selected.map((s, i) => `<div class="group-stamp-row"><span class="group-stamp-num">${i + 1}.</span><span>${esc(s.name)}</span></div>`).join('')
            : '<div class="group-stamp-empty">Никто не выбран</div>'}
        `;
      }

      // Дропдаун с чекбоксами
      function openPicker() {
        dropEl.classList.remove('hidden');
        searchEl.value = '';
        renderItems('');
        setTimeout(() => searchEl.focus(), 50);
      }
      function closePicker() { dropEl.classList.add('hidden'); }

      function renderItems(query) {
        const q = (query || '').toLowerCase().trim();
        const selIds = new Set(draft.selected.map(s => s.userId));
        const filtered = users.filter(u => q === '' || u.full_name.toLowerCase().includes(q));
        if (!filtered.length) {
          itemsEl.innerHTML = '<div class="muted small" style="padding:16px;text-align:center">Ничего не найдено</div>';
          return;
        }
        itemsEl.innerHTML = filtered.map(u => {
          const checked = selIds.has(u.id);
          return `
            <label class="as-item ${checked ? 'checked' : ''}" data-id="${u.id}" data-name="${esc(u.full_name)}">
              <span class="as-checkbox ${checked ? 'on' : ''}">${checked ? '✓' : ''}</span>
              <span class="as-name">${esc(u.full_name)}</span>
            </label>`;
        }).join('');
      }

      pickerEl.addEventListener('click', () => {
        if (!users.length) {
          toast('Нет доступных пользователей', 'error');
          return;
        }
        openPicker();
      });
      searchEl.addEventListener('input', () => renderItems(searchEl.value));

      // Клик по элементу — переключить выбор
      itemsEl.addEventListener('click', e => {
        const item = e.target.closest('.as-item');
        if (!item) return;
        e.preventDefault();
        const uid = +item.dataset.id;
        const name = item.dataset.name;
        const idx = draft.selected.findIndex(s => s.userId === uid);
        if (idx >= 0) draft.selected.splice(idx, 1);
        else draft.selected.push({ userId: uid, name });
        renderChips();
        updateStamp();
        updateSubmit();
        renderItems(searchEl.value); // перерисовать с обновлёнными чекбоксами
      });

      document.addEventListener('mousedown', function(e) {
        if (!pickerEl.contains(e.target) && !dropEl.contains(e.target)) closePicker();
      });

      function updateSubmit() {
        submitBtn.disabled = !(draft.selected.length > 0 && draft.page != null);
      }

      cancelBtn.addEventListener('click', () => {
        closeModal();
        if (typeof openDoc === 'function') openDoc(doc.id);
      });

      submitBtn.addEventListener('click', async () => {
        errEl.textContent = '';
        if (!draft.selected.length) return errEl.textContent = 'Выберите хотя бы одного пользователя';
        if (draft.page == null) return errEl.textContent = 'Укажите место подписи';

        submitBtn.disabled = true;
        submitBtn.textContent = 'Добавление...';
        try {
          await api(`/api/documents/${doc.id}/approvals/add-signers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: draft.selected.map(s => s.userId),
              page: draft.page,
              x: draft.x,
              y: draft.y
            })
          });
          const names = draft.selected.map(s => s.name).join(', ');
          toast(`Добавлено подписантов: ${names}`, 'success');
          closeModal();
          if (typeof openDoc === 'function') openDoc(doc.id);
        } catch (e) {
          errEl.textContent = e.message;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Добавить';
        }
      });

      renderChips();
    }
  });
}

/* ============================================================
   Примечания к документу (стикеры на страницах)
   ============================================================ */

async function initAnnotations(doc, body) {
  const btn      = $('#btn-annot', body);
  const countEl  = $('#annot-count', body);
  const pagesWrap = $('#pages-wrap', body) || body.querySelector('.pages');
  if (!btn || !pagesWrap) return;

  const state = {
    mode: false,
    list: [],
    activeId: null
  };

  // Загружаем существующие
  async function reload() {
    try {
      state.list = await api('/api/documents/' + doc.id + '/annotations-with-comments');
    } catch (e) { state.list = []; }
    renderPins();
    renderPanel();
    updateCount();

    // Если пришли из уведомления с примечанием — открыть панель и подсветить
    if (state.pendingAnnotationId) {
      const targetId = state.pendingAnnotationId;
      state.pendingAnnotationId = null; // сбрасываем
      setTimeout(() => openAnnotationById(targetId), 300);
    }
  }

  // Открыть панель, подсветить и проскроллить к примечанию
  function openAnnotationById(annotationId) {
    const a = state.list.find(x => x.id === annotationId);
    if (!a) {
      toast('Примечание не найдено', 'error');
      return;
    }

    // Открываем панель
    const panel = ensurePanel();
    panel.classList.remove('hidden');

    // Ставим активным
    state.activeId = annotationId;
    renderPins();
    renderPanel();

    // Скролл к пину на странице
    setTimeout(() => {
      const pin = pagesWrap.querySelector(`.annot-pin[data-aid="${annotationId}"]`);
      if (pin) {
        pin.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Подсветка
        pin.classList.add('annot-pin-flash');
        setTimeout(() => pin.classList.remove('annot-pin-flash'), 2000);
      }
      // Скролл в панели
      const item = panel.querySelector(`.annot-item[data-aid="${annotationId}"]`);
      if (item) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.classList.add('annot-item-flash');
        setTimeout(() => item.classList.remove('annot-item-flash'), 2000);
      }
    }, 200);
  }

  function updateCount() {
    if (!countEl) return;
    if (state.list.length > 0) {
      countEl.textContent = state.list.length;
      countEl.style.display = 'inline-block';
    } else {
      countEl.textContent = '';
      countEl.style.display = 'none';
    }
  }

  // Панель со списком примечаний (сбоку)
  function ensurePanel() {
    let panel = body.querySelector('.annot-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.className = 'annot-panel hidden';
    panel.innerHTML = `
      <div class="annot-panel-head">
        <div class="annot-panel-title">🔖 Примечания (<span id="ap-count">0</span>)</div>
        <button class="order-btn order-del" id="ap-close" type="button">✕</button>
      </div>
      <div class="annot-panel-list" id="ap-list"></div>
    `;
    body.appendChild(panel);

    panel.querySelector('#ap-close').addEventListener('click', () => {
      panel.classList.add('hidden');
    });

    return panel;
  }

  function renderPanel() {
    const panel = ensurePanel();
    const listEl = panel.querySelector('#ap-list');
    const countSpan = panel.querySelector('#ap-count');

    countSpan.textContent = state.list.length;

    if (!state.list.length) {
      listEl.innerHTML = '<div class="muted small" style="padding:14px;text-align:center">Примечаний пока нет</div>';
      return;
    }

    // Группируем по страницам
    const byPage = {};
    state.list.forEach(a => {
      if (!byPage[a.page]) byPage[a.page] = [];
      byPage[a.page].push(a);
    });

    listEl.innerHTML = Object.keys(byPage).sort((a, b) => a - b).map(pg => `
      <div class="annot-group">
        <div class="annot-group-title">Страница ${pg}</div>
        ${byPage[pg].map((a, i) => `
          <div class="annot-item" data-aid="${a.id}">
            <div class="annot-item-head">
              <span class="annot-pin-mini" style="background:${a.color}">${i + 1}</span>
              <span class="annot-author">${esc(a.authorName)}</span>
              <span class="annot-date">${fmtDate(a.createdAt)}</span>
            </div>
            <div class="annot-text" data-text="${a.id}">${esc(a.text)}</div>
            ${a.canEdit ? `
              <div class="annot-actions">
                <button class="annot-edit" data-edit="${a.id}" type="button">Редактировать</button>
                <button class="annot-del" data-del="${a.id}" type="button">Удалить</button>
              </div>` : ''}

            <div class="annot-comments-block">
              <div class="annot-comments-head">
                💬 Комментарии ${a.comments && a.comments.length ? '(' + a.comments.length + ')' : ''}
              </div>
              <div class="annot-comments-list" data-cid="${a.id}">
                ${(a.comments || []).map(c => `
                  <div class="annot-comment">
                    <div class="annot-comment-head">
                      <span class="annot-author">${esc(c.authorName)}</span>
                      <span class="annot-date">${fmtDate(c.createdAt)}</span>
                      ${c.canDelete ? `<button class="annot-comment-del" data-cdel="${c.id}" data-caid="${a.id}" type="button">×</button>` : ''}
                    </div>
                    <div class="annot-comment-text">${esc(c.text)}</div>
                  </div>`).join('')}
              </div>
              <div class="annot-comment-form">
                <input type="text" class="annot-comment-input" data-cinput="${a.id}" placeholder="Написать комментарий..." maxlength="2000">
                <button class="annot-comment-send" data-csend="${a.id}" type="button">➤</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

    // Клик по аннотации
    listEl.querySelectorAll('.annot-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.annot-comment-form')) return;
        const aid = +el.dataset.aid;
        const a = state.list.find(x => x.id === aid);
        if (!a) return;
        state.activeId = aid;
        renderPins();
        const pin = pagesWrap.querySelector(`.annot-pin[data-aid="${aid}"]`);
        if (pin) pin.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    // Удалить примечание
    listEl.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Удалить примечание?')) return;
        try {
          await api(`/api/documents/${doc.id}/annotations/${btn.dataset.del}`, { method: 'DELETE' });
          await reload();
          toast('Примечание удалено', 'success');
        } catch (err) { toast(err.message, 'error'); }
      });
    });

    // Редактировать примечание
    listEl.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const aid = +btn.dataset.edit;
        const a = state.list.find(x => x.id === aid);
        if (!a) return;
        openAnnotationEditModal(doc, a, async () => {
          await reload();
          renderPanel();
        });
      });
    });

    // Удалить комментарий
    listEl.querySelectorAll('[data-cdel]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Удалить комментарий?')) return;
        const cid = btn.dataset.cdel;
        const caid = btn.dataset.caid;
        try {
          await api(`/api/documents/${doc.id}/annotations/${caid}/comments/${cid}`, { method: 'DELETE' });
          await reload();
          renderPanel();
          toast('Комментарий удалён', 'success');
        } catch (err) { toast(err.message, 'error'); }
      });
    });

    // Отправить комментарий
    listEl.querySelectorAll('[data-csend]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const aid = +btn.dataset.csend;
        const input = listEl.querySelector(`[data-cinput="${aid}"]`);
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        btn.disabled = true;
        try {
          await api(`/api/documents/${doc.id}/annotations/${aid}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
          });
          input.value = '';
          await reload();
          renderPanel();
          toast('Комментарий добавлен', 'success');
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });

    // Enter в поле ввода — отправить
    listEl.querySelectorAll('[data-cinput]').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const aid = inp.dataset.cinput;
          const btn = listEl.querySelector(`[data-csend="${aid}"]`);
          if (btn) btn.click();
        }
      });
    });
  }

  // Рисуем пины на страницах
  function renderPins() {
    pagesWrap.querySelectorAll('.annot-pin').forEach(p => p.remove());
    state.list.forEach((a, idx) => {
      const wrap = pagesWrap.querySelector(`.page-wrap[data-page="${a.page}"]`);
      if (!wrap) return;
      const pin = document.createElement('div');
      pin.className = 'annot-pin' + (state.activeId === a.id ? ' active' : '');
      pin.dataset.aid = a.id;
      pin.style.left = (a.x * 100) + '%';
      pin.style.top = (a.y * 100) + '%';
      pin.style.background = a.color;
      // Номер пина в пределах страницы
      const pageList = state.list.filter(x => x.page === a.page);
      const numInPage = pageList.findIndex(x => x.id === a.id) + 1;
      pin.textContent = numInPage;
      pin.title = a.text.slice(0, 120) + (a.text.length > 120 ? '...' : '');

      pin.addEventListener('click', e => {
        e.stopPropagation();
        state.activeId = a.id;
        renderPins();
        const panel = ensurePanel();
        panel.classList.remove('hidden');
        renderPanel();
        // Подсветить в панели
        setTimeout(() => {
          const item = panel.querySelector(`.annot-item[data-aid="${a.id}"]`);
          if (item) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      });

      wrap.appendChild(pin);
    });
  }

  // Режим добавления
  function setMode(on) {
    state.mode = on;
    pagesWrap.classList.toggle('annot-mode', on);
    btn.classList.toggle('active', on);
    if (on) {
      toast('Кликните на документе, чтобы оставить примечание', 'info');
      const panel = ensurePanel();
      panel.classList.remove('hidden');
    }
  }

  btn.addEventListener('click', () => setMode(!state.mode));

  // Клик по странице в режиме примечаний
  pagesWrap.addEventListener('click', e => {
    if (!state.mode) return;
    if (e.target.closest('.annot-pin')) return;
    const wrap = e.target.closest('.page-wrap');
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    const x = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
    const y = Math.min(0.98, Math.max(0.02, (e.clientY - rect.top)  / rect.height));
    const page = +wrap.dataset.page;

    openAnnotationModal(doc, page, x, y, reload);
  });

  // Закрытие по Escape
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape' && state.mode) {
      setMode(false);
    }
  });

  await reload();
}

function openAnnotationModal(doc, page, x, y, onSaved) {
  const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];
  let selectedColor = colors[0];

  openModal({
    title: 'Новое примечание',
    body: `
      <div class="section">
        <div class="muted small" style="margin-bottom:6px">Страница ${page}</div>
        <label>Текст примечания
          <textarea id="an-text" maxlength="2000" rows="5" placeholder="Введите комментарий или замечание..."></textarea>
        </label>
        <label style="margin-top:12px">Цвет
          <div class="annot-colors" id="an-colors">
            ${colors.map((c, i) => `<button type="button" class="annot-color ${i === 0 ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
          </div>
        </label>
        <div class="error" id="an-err" style="min-height:0;margin-top:8px"></div>
      </div>
      <div class="row-actions" style="margin-top:14px">
        <button class="btn primary" id="an-save">Сохранить</button>
        <button class="btn ghost" id="an-cancel">Отмена</button>
      </div>
    `,
    onMount(body) {
      const textEl = $('#an-text', body);
      const errEl = $('#an-err', body);
      const saveBtn = $('#an-save', body);
      const cancelBtn = $('#an-cancel', body);

      setTimeout(() => textEl.focus(), 100);

      $('#an-colors', body).addEventListener('click', e => {
        const c = e.target.closest('.annot-color');
        if (!c) return;
        selectedColor = c.dataset.color;
        $$('.annot-color', body).forEach(el => el.classList.toggle('active', el === c));
      });

      cancelBtn.addEventListener('click', () => {
        closeModal();
        // Возвращаемся к документу
        if (typeof openDoc === 'function') openDoc(doc.id);
      });

      saveBtn.addEventListener('click', async () => {
        errEl.textContent = '';
        const text = textEl.value.trim();
        if (!text) return errEl.textContent = 'Введите текст примечания';

        saveBtn.disabled = true;
        saveBtn.textContent = 'Сохранение...';
        try {
          await api(`/api/documents/${doc.id}/annotations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page, x, y, text, color: selectedColor })
          });
          toast('Примечание добавлено', 'success');
          closeModal();
          if (typeof onSaved === 'function') onSaved();
          if (typeof openDoc === 'function') openDoc(doc.id);
        } catch (e) {
          errEl.textContent = e.message;
          saveBtn.disabled = false;
          saveBtn.textContent = 'Сохранить';
        }
      });
    }
  });
}

/* ============================================================
   Модалка редактирования примечания
   ============================================================ */

function openAnnotationEditModal(doc, annot, onSaved) {
  const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];
  let selectedColor = annot.color || colors[0];

  openModal({
    title: 'Редактирование примечания',
    body: `
      <div class="section">
        <label>Текст примечания
          <textarea id="ae-text" maxlength="2000" rows="5">${esc(annot.text)}</textarea>
        </label>
        <label style="margin-top:12px">Цвет
          <div class="annot-colors" id="ae-colors">
            ${colors.map(c => `<button type="button" class="annot-color ${c === selectedColor ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
          </div>
        </label>
        <div class="error" id="ae-err" style="min-height:0;margin-top:8px"></div>
      </div>
      <div class="row-actions" style="margin-top:14px">
        <button class="btn primary" id="ae-save">Сохранить</button>
        <button class="btn ghost" id="ae-cancel">Отмена</button>
      </div>
    `,
    onMount(body) {
      const textEl = $('#ae-text', body);
      const errEl = $('#ae-err', body);
      const saveBtn = $('#ae-save', body);
      const cancelBtn = $('#ae-cancel', body);

      setTimeout(() => textEl.focus(), 100);

      $('#ae-colors', body).addEventListener('click', e => {
        const c = e.target.closest('.annot-color');
        if (!c) return;
        selectedColor = c.dataset.color;
        $$('.annot-color', body).forEach(el => el.classList.toggle('active', el === c));
      });

      cancelBtn.addEventListener('click', () => {
        closeModal();
        if (typeof onSaved === 'function') onSaved();
      });

      saveBtn.addEventListener('click', async () => {
        errEl.textContent = '';
        const text = textEl.value.trim();
        if (!text) return errEl.textContent = 'Введите текст';

        saveBtn.disabled = true;
        saveBtn.textContent = 'Сохранение...';
        try {
          await api(`/api/documents/${doc.id}/annotations/${annot.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, color: selectedColor })
          });
          toast('Примечание сохранено', 'success');
          closeModal();
          if (typeof onSaved === 'function') onSaved();
        } catch (e) {
          errEl.textContent = e.message;
          saveBtn.disabled = false;
          saveBtn.textContent = 'Сохранить';
        }
      });
    }
  });
}

/* ============================================================
   ЕДИНАЯ КАНБАН-ДОСКА — все документы пользователя
   Колонки:
   1. Входящие (ждут моей подписи)
   2. Черновики (мои, не отправлены)
   3. Ожидают подписания (я отправил, ждут подписантов)
   4. Утверждённые
   5. Не утверждённые
   ============================================================ */

/* ============================================================
   КАНБАН с поиском и фильтром по категории
   ============================================================ */

async function renderMine() {
  const main = $('#main');
  main.innerHTML = '<div class="loading">Загрузка…</div>';

  try {
    // Загружаем документы и категории параллельно
    const [outbox, inbox, categories] = await Promise.all([
      api('/api/documents?box=outbox').catch(() => []),
      api('/api/documents?box=inbox').catch(() => []),
      api('/api/categories').catch(() => [])
    ]);

    const outboxDocs = Array.isArray(outbox) ? outbox : [];
    const inboxDocs  = Array.isArray(inbox) ? inbox : [];
    const cats       = Array.isArray(categories) ? categories : [];

    // Инициализация фильтров (если ещё нет)
    if (!state.filters) {
      state.filters = { query: '', categoryId: '' };
    }

    // Функция применения фильтров
    function applyFilters(list, isInbox) {
      let result = list;
      const q = (state.filters.query || '').toLowerCase().trim();

      if (q) {
        result = result.filter(d => (d.title || '').toLowerCase().includes(q));
      }

      if (state.filters.categoryId) {
        const cid = Number(state.filters.categoryId);
        result = result.filter(d => Number(d.categoryId) === cid || Number(d.category_id) === cid);
      }

      return result;
    }

    // Применяем фильтры
    const filteredOutbox = applyFilters(outboxDocs, false);
    const filteredInbox  = applyFilters(inboxDocs, true);

    // Раскладываем по колонкам
    const columns = {
      inbox:    filteredInbox.filter(d => d.approvalStatus === 'pending' && d.status !== 'rejected'),
      draft:    filteredOutbox.filter(d => d.status === 'draft'),
      pending:  filteredOutbox.filter(d => d.status === 'pending'),
      approved: filteredOutbox.filter(d => d.status === 'approved'),
      rejected: filteredOutbox.filter(d => d.status === 'rejected')
    };

    const labels = {
      inbox:    { title: '📥 Входящие',       cls: 'k-inbox' },
      draft:    { title: '📝 Черновики',      cls: 'k-draft' },
      pending:  { title: '⏳ Ожидают',        cls: 'k-pending' },
      approved: { title: '✅ Утверждённые',   cls: 'k-approved' },
      rejected: { title: '❌ Не утверждены',  cls: 'k-rejected' }
    };

    const totalOriginal = outboxDocs.length + inboxDocs.length;
    const totalFiltered = Object.values(columns).reduce((sum, arr) => sum + arr.length, 0);
    const hasFilter = state.filters.query || state.filters.categoryId;

    // Панель с кнопкой «Загрузить» + поиск + фильтр
    const toolbar = `
      <div class="kanban-toolbar">
        <button class="btn primary" id="up-2">＋ Загрузить документ</button>
        <div class="kanban-search-wrap">
          <span class="kanban-search-icon">🔍</span>
          <input type="text" id="kb-search" class="kanban-search" placeholder="Поиск по названию…" value="${esc(state.filters.query)}">
          <button class="kanban-search-clear ${state.filters.query ? '' : 'hidden'}" id="kb-search-clear" title="Очистить">✕</button>
        </div>
        <select id="kb-category" class="kanban-filter-cat">
          <option value="">Все категории</option>
          ${cats.map(c => `<option value="${c.id}" ${String(state.filters.categoryId) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        ${hasFilter ? `<button class="btn ghost small" id="kb-reset">Сбросить</button>` : ''}
      </div>
      ${hasFilter ? `<div class="kanban-filter-info">Найдено: <b>${totalFiltered}</b> из ${totalOriginal}</div>` : ''}
    `;

    if (totalOriginal === 0) {
      main.innerHTML = `
        ${toolbar}
        <div class="empty">
          <p style="margin-bottom:14px">У вас пока нет документов</p>
          <button class="btn primary" id="up-1">Загрузить первый документ</button>
        </div>`;
      $('#up-1').addEventListener('click', () => openComposer());
      $('#up-2').addEventListener('click', () => openComposer());
      bindKanbanToolbar();
      return;
    }

    main.innerHTML = `
      ${toolbar}
      <div class="kanban-board kanban-board-5">
        ${Object.keys(columns).map(status => {
          const L = labels[status];
          const items = columns[status];
          return `
            <div class="kanban-column ${L.cls}" data-status="${status}">
              <div class="kanban-column-head">
                <div class="kanban-column-title">${L.title}</div>
                <div class="kanban-column-count">${items.length}</div>
              </div>
              <div class="kanban-column-body">
                ${items.length === 0
                  ? `<div class="kanban-empty">${hasFilter ? 'Ничего не найдено' : 'Пусто'}</div>`
                  : items.map(d => renderKanbanCard(d, status)).join('')
                }
              </div>
            </div>`;
        }).join('')}
      </div>`;

    $('#up-2').addEventListener('click', () => openComposer());

    // Привязка toolbar
    bindKanbanToolbar();

    // Клики по карточкам
    main.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openDoc(+card.dataset.id);
      });
    });

    main.querySelectorAll('[data-send]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openComposer({ id: +btn.dataset.send });
      });
    });

    main.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDraft(+btn.dataset.del);
      });
    });

    main.querySelectorAll('[data-del-force]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = +btn.dataset.delForce;
        if (!confirm(`Удалить документ #${id}?`)) return;
        try {
          await api('/api/documents/' + id, { method: 'DELETE' });
          toast('Документ удалён', 'success');
          renderMine();
        } catch (err) { toast(err.message, 'error'); }
      });
    });

    main.querySelectorAll('[data-sign-inline]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDoc(+btn.dataset.signInline);
      });
    });

  } catch (e) {
    main.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* Привязка поиска и фильтра */
function bindKanbanToolbar() {
  const searchEl = document.getElementById('kb-search');
  const clearBtn = document.getElementById('kb-search-clear');
  const catEl = document.getElementById('kb-category');
  const resetBtn = document.getElementById('kb-reset');

  if (!state.filters) state.filters = { query: '', categoryId: '' };

  // Поиск с debounce
  if (searchEl) {
    let timer = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.filters.query = searchEl.value;
        renderMine().then(() => {
          // Восстанавливаем фокус
          const el = document.getElementById('kb-search');
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        });
      }, 300);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.filters.query = '';
      renderMine();
    });
  }

  if (catEl) {
    catEl.addEventListener('change', () => {
      state.filters.categoryId = catEl.value;
      renderMine();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.filters = { query: '', categoryId: '' };
      renderMine();
    });
  }
}


function renderKanbanCard(d, column) {
  const isInbox = column === 'inbox';

  // Прогресс подписания (для pending)
  let progress = '';
  if (column === 'pending' && d.approvalsCount != null && d.approvalsCount > 0) {
    progress = `<div class="kanban-card-progress">
      <div class="kanban-progress-bar">
        <div class="kanban-progress-fill" style="width: ${Math.round((d.signedCount / d.approvalsCount) * 100)}%"></div>
      </div>
      <span>${d.signedCount}/${d.approvalsCount}</span>
    </div>`;
  }

  // Для входящих — показываем отправителя
  let subtitle = '';
  if (isInbox && d.ownerName) {
    subtitle = `<div class="kanban-card-owner">От: ${esc(d.ownerName)}</div>`;
  }

  // Действия
  let actions = '';

  if (column === 'draft') {
    actions = `<div class="kanban-card-actions">
      <button class="kanban-btn" data-send="${d.id}" title="Отправить на подпись">📤</button>
      <button class="kanban-btn danger" data-del="${d.id}" title="Удалить">🗑</button>
    </div>`;
  } else if (column === 'inbox') {
    actions = `<div class="kanban-card-actions">
      <button class="kanban-btn primary" data-sign-inline="${d.id}" title="Открыть и подписать">✍️</button>
    </div>`;
  } else if (column === 'pending' && state.user?.isAdmin) {
    actions = `<div class="kanban-card-actions">
      <button class="kanban-btn danger" data-del-force="${d.id}" title="Удалить (админ)">🗑</button>
    </div>`;
  }

  // Бейдж статуса подписи для входящих
  let badge = '';
  if (isInbox && d.approvalStatus) {
    const apLabels = { pending: 'Ждёт подписи', signed: 'Подписано', cancelled: 'Отменено' };
    const apCls = { pending: 'ap-pending', signed: 'ap-signed', cancelled: 'ap-cancelled' };
    badge = `<span class="kanban-badge ${apCls[d.approvalStatus] || ''}">${apLabels[d.approvalStatus] || d.approvalStatus}</span>`;
  }

  return `
    <div class="kanban-card" data-id="${d.id}" title="${esc(d.title)}">
      <div class="kanban-card-title">${esc(d.title)}</div>
      ${subtitle}
      <div class="kanban-card-meta">
        <span class="kanban-card-date">${fmtDate(d.createdAt)}</span>
        <span class="kanban-card-size">${fmtSize(d.size)}</span>
      </div>
      ${badge}
      ${progress}
      ${actions}
    </div>`;
}


/* ============================================================
   УПРАВЛЕНИЕ КАТЕГОРИЯМИ ДОКУМЕНТОВ (только админ)
   ============================================================ */

async function openCategoriesManager() {
  let categories = [];
  try { categories = await api('/api/categories'); } catch (e) { return toast(e.message, 'error'); }

  openModal({
    title: 'Категории документов',
    body: `
      <div class="section">
        <h3>Создать категорию</h3>
        <label>Название
          <input type="text" id="cat-name" maxlength="100" placeholder="Например: Договоры, Счета, Акты">
        </label>
        <label style="margin-top:10px">Цвет
          <div class="cat-color-picker" id="cat-colors">
            ${['#2f81f7','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#94a3b8'].map((c,i) => `
              <button type="button" class="cat-color ${i===0?'active':''}" data-color="${c}" style="background:${c}"></button>
            `).join('')}
          </div>
        </label>
        <button class="btn primary full" id="cat-create" style="margin-top:12px">Создать</button>
        <div class="error" id="cat-err" style="min-height:0"></div>
      </div>

      <div class="section">
        <h3>Список категорий</h3>
        <div id="cat-list"></div>
      </div>
    `,
    onMount(body) {
      const nameEl = $('#cat-name', body);
      const errEl = $('#cat-err', body);
      const listEl = $('#cat-list', body);
      const createBtn = $('#cat-create', body);
      let selectedColor = '#2f81f7';

      // Выбор цвета
      $('#cat-colors', body).addEventListener('click', e => {
        const btn = e.target.closest('.cat-color');
        if (!btn) return;
        selectedColor = btn.dataset.color;
        $$('.cat-color', body).forEach(el => el.classList.toggle('active', el === btn));
      });

      // Рендер списка
      function renderList() {
        if (!categories.length) {
          listEl.innerHTML = '<div class="muted small" style="text-align:center;padding:16px">Категорий пока нет</div>';
          return;
        }
        listEl.innerHTML = categories.map(c => `
          <div class="cat-row" data-id="${c.id}">
            <span class="cat-dot" style="background:${c.color}"></span>
            <span class="cat-name-text">${esc(c.name)}</span>
            <div class="cat-row-actions">
              <button class="order-btn" data-edit="${c.id}" type="button" title="Редактировать">✎</button>
              <button class="order-btn order-del" data-del="${c.id}" type="button" title="Удалить">✕</button>
            </div>
          </div>`).join('');
      }

      // Создать
      createBtn.addEventListener('click', async () => {
        errEl.textContent = '';
        const name = nameEl.value.trim();
        if (!name) return errEl.textContent = 'Введите название';
        createBtn.disabled = true;
        try {
          await api('/api/admin/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color: selectedColor })
          });
          toast('Категория создана', 'success');
          nameEl.value = '';
          categories = await api('/api/categories');
          renderList();
        } catch (e) {
          errEl.textContent = e.message;
        } finally { createBtn.disabled = false; }
      });

      // Действия в списке
      listEl.addEventListener('click', async e => {
        const editBtn = e.target.closest('[data-edit]');
        const delBtn = e.target.closest('[data-del]');

        if (editBtn) {
          const id = +editBtn.dataset.edit;
          const c = categories.find(x => x.id === id);
          if (!c) return;
          const newName = prompt('Новое название:', c.name);
          if (!newName || !newName.trim()) return;
          try {
            await api('/api/admin/categories/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: newName.trim(), color: c.color })
            });
            toast('Сохранено', 'success');
            categories = await api('/api/categories');
            renderList();
          } catch (err) { toast(err.message, 'error'); }
        }

        if (delBtn) {
          if (!confirm('Удалить категорию? Документы останутся без категории.')) return;
          try {
            await api('/api/admin/categories/' + delBtn.dataset.del, { method: 'DELETE' });
            toast('Категория удалена', 'success');
            categories = await api('/api/categories');
            renderList();
          } catch (err) { toast(err.message, 'error'); }
        }
      });

      renderList();
    }
  });
}

async function openComposer(existing = null) {
  let users = [];
  try { users = await api('/api/users'); } catch {}

  let doc = existing;
  if (existing && !existing.pages) {
    try {
      const full = await api('/api/documents/' + existing.id);
      doc = { id: full.id, title: full.title, pages: full.pages, status: full.status };
    } catch (e) { return toast(e.message, 'error'); }
  }

  const draft = {
    docId: doc?.id || null,
    pages: doc?.pages || 1,
    approvers: [],
    groupMode: false,        // true = все в одном месте
    groupId: null,           // id применённой сохранённой группы (для очереди/этапов)
    groupSequential: false,  // этапы подписываются последовательно
    groupPlacement: null,
    sender: { page: null, x: null, y: null, comment: '', nep: '' },
    activeIndex: -1
  };

  openModal({
    title: doc ? 'Отправка документа на подпись' : 'Новый документ',
    body: `
      <div class="wizard-actions">
        <button class="btn primary" id="send" disabled>Отправить на подписание</button>
        ${doc ? '' : `<button class="btn" id="save" disabled>Сохранить черновик</button>`}
      </div>
      <div class="error" id="ne" style="margin:0 0 10px;min-height:0"></div>

      ${doc ? `<div class="section">
        <h3>Документ</h3>
        <div class="doc-title">${esc(doc.title)}</div>
        <div class="muted small" style="margin-top:4px">Страниц: ${doc.pages}</div>
      </div>` : `
      <div class="section">
        <h3>1. Файл</h3>
        <input type="file" id="f" accept=".pdf,image/*">
        <label style="margin-top:10px">Название (необязательно)
          <input type="text" id="t" maxlength="200" placeholder="Например: Договор №12">
        </label>
        <label style="margin-top:10px">Категория документа
          <select id="cat-select">
            <option value="">— Без категории —</option>
          </select>
        </label>
        <div class="error" id="fe" style="text-align:left"></div>
      </div>`}

      <div class="section">
        <h3>${doc ? '1' : '2'}. Ваша подпись (отправитель)</h3>
        <p class="muted small" style="margin:0 0 6px">Кликните на документе в месте своей подписи.</p>
        <div id="sender-status" class="sender-status">❌ Место не выбрано</div>
        <label style="margin-top:10px">Комментарий к подписи (опционально)
          <textarea id="sender-comment" maxlength="1000" placeholder="Например: Согласовано"></textarea>
        </label>
        <label style="margin-top:8px">Пароль НЭП
          <input type="password" id="sender-nep" autocomplete="current-password">
        </label>
      </div>

      <div class="section">
        <h3>${doc ? '2' : '3'}. Получатели</h3>

        <div class="recipient-tabs">
          <button type="button" class="rtab active" data-rtab="users">👤 Пользователи</button>
          <button type="button" class="rtab" data-rtab="groups">👥 Группы</button>
        </div>

        <div class="rtab-panel" id="rtab-users">
          <div id="approvers-list" style="margin-top:10px"></div>
          <div class="approver-picker" style="margin-top:10px">
            <input type="text" class="approver-picker-input" id="picker-input" placeholder="Нажмите, чтобы добавить получателя" readonly>
            <div class="approver-dropdown hidden" id="picker-dropdown">
              <input type="text" class="approver-dropdown-search" id="picker-search" placeholder="🔍 Поиск по ФИО...">
              <div class="approver-dropdown-items" id="picker-items"></div>
            </div>
          </div>
        </div>

        <div class="rtab-panel hidden" id="rtab-groups">
          <div id="saved-groups-bar" class="saved-groups-bar" style="margin-top:10px"></div>
        </div>

        <label class="group-toggle" style="margin-top:12px">
          <input type="checkbox" id="group-mode">
          <span>Все подписывают в одном месте</span>
        </label>
        <label class="group-toggle hidden" id="seq-toggle-wrap" style="margin-top:6px">
          <input type="checkbox" id="group-sequential">
          <span>По очереди: подпись переходит к следующему после предыдущего</span>
        </label>
      </div>

      <div class="section">
        <h3>${doc ? '3' : '4'}. Место подписи</h3>
        <div id="placement-hint" class="muted small" style="margin-bottom:8px"></div>
        <div class="pages" id="doc-pages"></div>
      </div>
    `,
    onMount(body) {
      const sendBtn      = $('#send', body);
      const saveBtn      = $('#save', body);
      const feEl         = $('#fe', body);
      const neEl         = $('#ne', body);
      const fileInput    = $('#f', body);
      const titleInput   = $('#t', body);

      // ====== КАТЕГОРИИ ДОКУМЕНТОВ ======
      const catSelect = $('#cat-select', body);
      if (catSelect) {
        (async () => {
          try {
            const cats = await api('/api/categories');
            if (Array.isArray(cats) && cats.length) {
              while (catSelect.options.length > 1) catSelect.remove(1);
              const visible = (state.user && state.user.isAdmin) ? cats : cats.filter(c => c.allowed !== false);
              visible.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                catSelect.appendChild(opt);
              });
            }
          } catch (e) {
            console.warn('Categories load error:', e.message);
          }
        })();
      }
      const senderStatus = $('#sender-status', body);
      const senderComment= $('#sender-comment', body);
      const senderNep    = $('#sender-nep', body);
      const approversEl  = $('#approvers-list', body);
      const pickerInput  = $('#picker-input', body);
      const pickerDrop   = $('#picker-dropdown', body);
      const pickerSearch = $('#picker-search', body);
      const pickerItems  = $('#picker-items', body);
      const docPages     = $('#doc-pages', body);
      const hintEl       = $('#placement-hint', body);
      const groupToggle  = $('#group-mode', body);
      const seqToggle    = $('#group-sequential', body);
      const seqWrap      = $('#seq-toggle-wrap', body);
      const savedGroupsBar = $('#saved-groups-bar', body);

      // ============ ТАБЫ «Пользователи» / «Группы» ============
      const rtabBtns = $$('.rtab', body);
      const rtabUsers = $('#rtab-users', body);
      const rtabGroups = $('#rtab-groups', body);

      function switchRecipientTab(tab) {
        rtabBtns.forEach(b => b.classList.toggle('active', b.dataset.rtab === tab));
        rtabUsers.classList.toggle('hidden', tab !== 'users');
        rtabGroups.classList.toggle('hidden', tab !== 'groups');
      }

      rtabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchRecipientTab(btn.dataset.rtab));
      });

      // Загружаем готовые группы пользователя
      let savedGroups = [];
      (async () => {
        try { savedGroups = await api('/api/groups'); } catch {}
        renderSavedGroups();
      })();

      function renderSavedGroups() {
        if (!savedGroupsBar) return;
        if (!savedGroups.length) {
          savedGroupsBar.innerHTML = `
            <div class="rtab-empty">
              <div class="rtab-empty-icon">👥</div>
              <div class="rtab-empty-title">Групп пока нет</div>
              <div class="rtab-empty-text">Создайте их в личном кабинете — «Управление группами».</div>
            </div>`;
          return;
        }
        savedGroupsBar.innerHTML = `
          <div class="saved-groups-list">
            ${savedGroups.map(g => {
              const totalMembers = (g.members || []).length;
              const levelsCount = (g.levels || []).length;
              return `
                <div class="saved-group-card" data-gid="${g.id}">
                  <div class="sgc-head">
                    <div class="sgc-name">👥 ${esc(g.name)}</div>
                    <div class="sgc-meta">
                      ${g.sequential ? '<span class="sgc-tag sgc-tag-seq">🔢 По очереди</span>' : '<span class="sgc-tag">🔄 Параллельно</span>'}
                      <span class="sgc-tag">${totalMembers} участ.</span>
                      ${levelsCount > 0 ? `<span class="sgc-tag">${levelsCount} этап.</span>` : ''}
                    </div>
                  </div>
                  <div class="sgc-levels">
                    ${(g.levels || []).map(lvl => `
                      <div class="sgc-level">
                        <span class="sgc-level-num">${lvl.levelIndex}</span>
                        <span class="sgc-level-names">${lvl.members.map(m => esc(m.fullName)).join(' + ')}</span>
                      </div>`).join('')}
                  </div>
                  <button class="btn primary full sgc-apply" data-gid="${g.id}" type="button">Применить группу</button>
                </div>`;
            }).join('')}
          </div>`;
      }

      if (savedGroupsBar) {
        savedGroupsBar.addEventListener('click', e => {
          const btn = e.target.closest('[data-gid]');
          if (!btn) return;
          const g = savedGroups.find(x => x.id === +btn.dataset.gid);
          if (!g) return;
          applySavedGroup(g);
          // Переключаемся на таб «Пользователи», чтобы видеть состав
          switchRecipientTab('users');
        });
      }

      function applySavedGroup(g) {
        // Разворачиваем уровни в плоский список с orderIndex
        const flat = [];
        (g.levels || []).forEach(lvl => {
          lvl.members.forEach((m, mi) => {
            flat.push({
              userId: m.userId,
              name: m.fullName,
              page: null,
              x: null,
              y: null,
              levelIndex: lvl.levelIndex,
              orderInLevel: mi + 1
            });
          });
        });
        draft.approvers = flat;
        draft.groupId = g.id || 1;
        draft.groupSequential = !!g.sequential;
        // По умолчанию каждый подписывает в своём месте
        draft.groupMode = false;
        draft.groupPlacement = null;
        draft.activeIndex = flat.length ? 0 : -1;
        if (groupToggle) groupToggle.checked = false;
        if (seqWrap) seqWrap.classList.remove('hidden');
        if (seqToggle) seqToggle.checked = !!g.sequential;
        renderApproversList();
        updatePickerState(); updateSend(); renderHint();
        toast(`Группа «${g.name}» применена (${(g.levels || []).length} этап.). Кликните на документе для места подписи.`, 'info');
      }

      function renderPages() {
        if (!draft.docId) { docPages.innerHTML = '<div class="muted small">Загрузите файл.</div>'; return; }
        docPages.innerHTML = Array.from({ length: draft.pages }, (_, i) => `
          <div class="page-wrap placing" data-page="${i + 1}">
            <img class="page-img" src="/api/documents/${draft.docId}/pages/${i + 1}" loading="lazy" alt="">
            <div class="page-overlay"></div>
          </div>`).join('');
        renderStamps();
      }

      function renderStamps() {
        docPages.querySelectorAll('.stamp').forEach(s => s.remove());

        if (draft.sender.page != null) {
          const wrap = docPages.querySelector(`.page-wrap[data-page="${draft.sender.page}"]`);
          if (wrap) {
            const s = document.createElement('div');
            s.className = 'stamp sender-stamp placing' + (draft.activeIndex === -1 ? ' active' : '');
            s.style.left = (draft.sender.x * 100) + '%';
            s.style.top  = (draft.sender.y * 100) + '%';
            s.innerHTML  = `<div class="stamp-name">✍️ ${esc(state.user.fullName)}</div>`;
            wrap.appendChild(s);
          }
        }

        if (draft.groupMode && draft.groupPlacement) {
          const wrap = docPages.querySelector(`.page-wrap[data-page="${draft.groupPlacement.page}"]`);
          if (wrap) {
            const s = document.createElement('div');
            s.className = 'stamp group-stamp placing';
            s.style.left = (draft.groupPlacement.x * 100) + '%';
            s.style.top  = (draft.groupPlacement.y * 100) + '%';
            s.innerHTML = `
              <div class="group-stamp-title">👥 Группа${draft.groupSequential ? ' (по очереди)' : ''}</div>
              ${draft.approvers.map((a, i) => `<div class="group-stamp-row"><span class="group-stamp-num">${i + 1}.</span><span>${esc(a.name)}</span></div>`).join('')}
            `;
            wrap.appendChild(s);
          }
        } else if (!draft.groupMode) {
          draft.approvers.forEach((a, i) => {
            if (a.page == null) return;
            const wrap = docPages.querySelector(`.page-wrap[data-page="${a.page}"]`);
            if (!wrap) return;
            const s = document.createElement('div');
            s.className = 'stamp placing' + (draft.activeIndex === i ? ' active' : '');
            s.style.left = (a.x * 100) + '%';
            s.style.top  = (a.y * 100) + '%';
            s.innerHTML  = `<div class="stamp-name">${i + 1}. ${esc(a.name)}</div>`;
            wrap.appendChild(s);
          });
        }
      }

      function renderHint() {
        if (!draft.docId) { hintEl.textContent = ''; return; }
        if (draft.activeIndex === -1) hintEl.textContent = 'Кликните на странице — место вашей подписи.';
        else if (draft.groupMode) hintEl.textContent = 'Кликните на странице — общее место подписи группы.';
        else if (draft.approvers[draft.activeIndex]) hintEl.textContent = `Кликните на странице — место подписи: ${draft.approvers[draft.activeIndex].name}.`;
        else hintEl.textContent = '';
      }

      function renderSenderStatus() {
        if (draft.sender.page != null) {
          senderStatus.classList.add('done');
          senderStatus.innerHTML = `✅ Место выбрано: Стр. ${draft.sender.page} (${Math.round(draft.sender.x * 100)}% / ${Math.round(draft.sender.y * 100)}%)`;
        } else {
          senderStatus.classList.remove('done');
          senderStatus.innerHTML = '❌ Место не выбрано';
        }
        senderStatus.classList.toggle('active', draft.activeIndex === -1);
      }

      function renderApproversList() {
        if (!draft.approvers.length) {
          approversEl.innerHTML = '<div class="muted small" style="margin-bottom:8px">Пока никого не выбрали.</div>';
          return;
        }
        approversEl.innerHTML = draft.approvers.map((a, i) => {
          let statusText;
          if (draft.groupMode) {
            // Все в одном месте
            statusText = draft.groupSequential
              ? `🔢 Очередь №${i + 1}`
              : '👥 В группе';
            if (draft.groupPlacement) statusText += ' · ✅ Место выбрано';
            else statusText += ' · ❌ Место группы не выбрано';
          } else if (draft.groupId != null) {
            // Применена группа, но каждый в своём месте
            const prefix = draft.groupSequential ? `🔢 Этап ${a.levelIndex || i + 1}` : '👤 Индивидуально';
            if (a.page != null) {
              statusText = `${prefix} · ✅ Стр. ${a.page} · ${Math.round(a.x * 100)}% / ${Math.round(a.y * 100)}%`;
            } else {
              statusText = `${prefix} · ❌ Место не выбрано`;
            }
          } else {
            // Обычные получатели
            statusText = a.page != null
              ? `✅ Стр. ${a.page} · ${Math.round(a.x * 100)}% / ${Math.round(a.y * 100)}%`
              : '❌ Место не выбрано';
          }
          const active = !draft.groupMode && i === draft.activeIndex;
          const arrows = draft.groupSequential
            ? `<div class="order-arrows">
                 <button class="order-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
                 <button class="order-btn" data-down="${i}" ${i === draft.approvers.length - 1 ? 'disabled' : ''}>▼</button>
               </div>` : '';
          return `<div class="approver-row ${active ? 'active' : ''}" data-i="${i}">
            <div class="approver-info">
              <div class="approver-name">${i + 1}. ${esc(a.name)}</div>
              <div class="muted small">${statusText}</div>
            </div>
            ${arrows}
          </div>`;
        }).join('');
      }

      function updatePickerState() {
        const senderReady = draft.sender.page != null;
        const lastApprover = draft.approvers[draft.approvers.length - 1];
        const lastReady = (!lastApprover || lastApprover.page != null) || draft.groupMode;

        if (!draft.docId) { pickerInput.disabled = true; pickerInput.placeholder = 'Сначала загрузите файл'; pickerInput.classList.add('disabled'); return; }
        if (!senderReady) { pickerInput.disabled = true; pickerInput.placeholder = 'Сначала укажите место своей подписи'; pickerInput.classList.add('disabled'); return; }
        if (!draft.groupMode && !lastReady) {
          pickerInput.disabled = true;
          pickerInput.placeholder = `Сначала укажите место подписи: ${lastApprover.name}`;
          pickerInput.classList.add('disabled'); return;
        }
        pickerInput.disabled = false;
        pickerInput.placeholder = 'Нажмите, чтобы добавить получателя';
        pickerInput.classList.remove('disabled');
      }

      function updateSend() {
        const senderReady = draft.sender.page != null && draft.sender.nep.length > 0;
        let approversReady;
        if (draft.groupMode) approversReady = draft.approvers.length > 0 && draft.groupPlacement != null;
        else approversReady = draft.approvers.length > 0 && draft.approvers.every(a => a.page != null);
        sendBtn.disabled = !(draft.docId && senderReady && approversReady);
      }

      docPages.addEventListener('click', e => {
        const wrap = e.target.closest('.page-wrap');
        if (!wrap || !draft.docId) return;
        const rect = wrap.getBoundingClientRect();
        const x = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
        const y = Math.min(0.98, Math.max(0.02, (e.clientY - rect.top)  / rect.height));
        const page = +wrap.dataset.page;

        if (draft.activeIndex === -1) {
          draft.sender.page = page; draft.sender.x = x; draft.sender.y = y;
          renderSenderStatus(); renderStamps(); updatePickerState(); updateSend();
          toast('Место вашей подписи установлено', 'success');
        } else if (draft.groupMode) {
          draft.groupPlacement = { page, x, y };
          renderApproversList(); renderStamps(); updateSend();
          toast('Место подписи группы установлено', 'success');
        } else {
          const a = draft.approvers[draft.activeIndex];
          if (!a) return;
          a.page = page; a.x = x; a.y = y;
          renderApproversList(); renderStamps(); updatePickerState(); updateSend();
          toast(`Место подписи для ${a.name} установлено`, 'success');
        }
        renderHint();
      });

      senderStatus.addEventListener('click', () => {
        draft.activeIndex = -1;
        renderSenderStatus(); renderApproversList(); renderStamps(); renderHint();
      });

      approversEl.addEventListener('click', e => {
        // Порядок стрелками
        const upBtn = e.target.closest('[data-up]');
        const downBtn = e.target.closest('[data-down]');
        if (upBtn) {
          const i = +upBtn.dataset.up;
          if (i > 0) {
            [draft.approvers[i - 1], draft.approvers[i]] = [draft.approvers[i], draft.approvers[i - 1]];
            renderApproversList(); renderStamps();
          }
          return;
        }
        if (downBtn) {
          const i = +downBtn.dataset.down;
          if (i < draft.approvers.length - 1) {
            [draft.approvers[i + 1], draft.approvers[i]] = [draft.approvers[i], draft.approvers[i + 1]];
            renderApproversList(); renderStamps();
          }
          return;
        }
        // Клик по строке — всегда активирует место для этого получателя
        const row = e.target.closest('.approver-row');
        if (!row) return;
        draft.activeIndex = +row.dataset.i;
        renderSenderStatus(); renderApproversList(); renderStamps(); renderHint();
      });

      groupToggle.addEventListener('change', () => {
        draft.groupMode = groupToggle.checked;
        if (draft.groupMode) {
          seqWrap.classList.remove('hidden');
          draft.groupPlacement = null;
        } else {
          seqWrap.classList.add('hidden');
          seqToggle.checked = false;
          draft.groupSequential = false;
        }
        renderApproversList(); renderStamps(); updatePickerState(); updateSend(); renderHint();
      });

      seqToggle.addEventListener('change', () => {
        draft.groupSequential = seqToggle.checked;
        renderApproversList(); renderStamps();
      });

      senderComment.addEventListener('input', () => { draft.sender.comment = senderComment.value; });
      senderNep.addEventListener('input', () => { draft.sender.nep = senderNep.value; updateSend(); });

      pickerInput.addEventListener('click', () => {
        if (pickerInput.disabled) {
          const lastApprover = draft.approvers[draft.approvers.length - 1];
          if (draft.sender.page == null) toast('Сначала укажите место своей подписи', 'error');
          else if (!draft.groupMode && lastApprover && lastApprover.page == null)
            toast(`Сначала укажите место для подписи: ${lastApprover.name}`, 'error');
          return;
        }
        openPicker();
      });

      function openPicker() {
        pickerDrop.classList.remove('hidden');
        pickerSearch.value = '';
        renderPickerItems('');
        setTimeout(() => pickerSearch.focus(), 50);
      }
      function closePicker() { pickerDrop.classList.add('hidden'); }

      function renderPickerItems(query) {
        const q = (query || '').toLowerCase().trim();
        const used = new Set(draft.approvers.map(a => a.userId));
        const filtered = users.filter(u => !used.has(u.id) && (q === '' || u.full_name.toLowerCase().includes(q)));
        if (!filtered.length) { pickerItems.innerHTML = '<div class="muted small" style="padding:12px;text-align:center">Ничего не найдено</div>'; return; }
        pickerItems.innerHTML = filtered.map(u => `
          <div class="approver-dropdown-item" data-id="${u.id}" data-name="${esc(u.full_name)}">
            <div style="font-weight:600">${esc(u.full_name)}</div>
            <div class="muted small">@${esc(u.username)}</div>
          </div>`).join('');
      }

      pickerSearch.addEventListener('input', () => renderPickerItems(pickerSearch.value));

      pickerItems.addEventListener('click', e => {
        const item = e.target.closest('.as-item') || e.target.closest('.approver-dropdown-item');
        if (!item) return;
        e.preventDefault();
        const userId = +item.dataset.id;
        const name = item.dataset.name;

        // Toggle: если уже выбран — убрать, иначе добавить
        const idx = draft.approvers.findIndex(a => a.userId === userId);
        if (idx >= 0) {
          draft.approvers.splice(idx, 1);
        } else {
          draft.approvers.push({ userId, name, page: null, x: null, y: null });
          if (!draft.groupMode) draft.activeIndex = draft.approvers.length - 1;
        }

        // Перерисовать список с обновлёнными чекбоксами
        const q = (pickerSearch.value || '');
        renderPickerItems(q);

        renderApproversList();
        renderSenderStatus();
        renderStamps();
        updatePickerState();
        updateSend();
        renderHint();
      });

      document.addEventListener('mousedown', function(e) {
        if (!pickerInput.contains(e.target) && !pickerDrop.contains(e.target)) closePicker();
      });

      if (fileInput) {
        fileInput.addEventListener('change', async () => {
          const f = fileInput.files[0];
          if (!f) return;
          feEl.textContent = ''; fileInput.disabled = true;
          try {
            if (!titleInput.value) titleInput.value = f.name.replace(/\.[^.]+$/, '');
            const fd = new FormData();
            fd.append('file', f);
            fd.append('title', titleInput.value || f.name);
            if (catSelect && catSelect.value) {
              fd.append('category_id', (document.getElementById('cat-select')||{}).value || '');
            }
            const res = await fetch('/api/documents', { method: 'POST', credentials: 'same-origin', body: fd });
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Ошибка загрузки'); }
            const { id, pages } = await res.json();
            draft.docId = id; draft.pages = pages; window.__draftDocId = id; window.__draftDocId = id;
            if (saveBtn) saveBtn.disabled = false;
            feEl.style.color = 'var(--success)';
            feEl.textContent = '✓ Черновик сохранён.';
            renderPages(); updatePickerState(); updateSend(); renderHint();
          } catch (e) { feEl.textContent = e.message; fileInput.disabled = false; }
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          toast('Черновик сохранён', 'success');
          closeModal();
          if (state.tab === 'mine') renderMine(); else switchTab('mine');
        });
      }

      sendBtn.addEventListener('click', async () => {
        neEl.textContent = '';
        if (!draft.docId) return neEl.textContent = 'Загрузите файл';
        if (draft.sender.page == null) return neEl.textContent = 'Укажите место вашей подписи';
        if (!draft.sender.nep) return neEl.textContent = 'Введите пароль НЭП';
        if (!draft.approvers.length) return neEl.textContent = 'Добавьте хотя бы одного получателя';

        let payloadApprovers;
        if (draft.groupMode) {
          if (!draft.groupPlacement) return neEl.textContent = 'Укажите место подписи группы';
          payloadApprovers = draft.approvers.map((a, i) => ({
            userId: a.userId,
            page: draft.groupPlacement.page,
            x: draft.groupPlacement.x,
            y: draft.groupPlacement.y,
            groupId: 1,
            orderIndex: draft.groupSequential
              ? (a.levelIndex != null ? a.levelIndex : i + 1)
              : null
          }));
        } else {
          const unplaced = draft.approvers.find(a => a.page == null);
          if (unplaced) return neEl.textContent = `Укажите место подписи для ${unplaced.name}`;
          payloadApprovers = draft.approvers.map((a, i) => ({
            userId: a.userId,
            page: a.page,
            x: a.x,
            y: a.y,
            groupId: draft.groupId || null,
            orderIndex: draft.groupSequential
              ? (a.levelIndex != null ? a.levelIndex : i + 1)
              : null
          }));
        }

        sendBtn.disabled = true;
        try {
          await api(`/api/documents/${draft.docId}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              approvers: payloadApprovers,
              groupSequential: draft.groupSequential,
              nepPassword: draft.sender.nep,
              senderPage: draft.sender.page,
              senderX: draft.sender.x,
              senderY: draft.sender.y,
              senderComment: draft.sender.comment
            })
          });
          toast('Документ подписан вами и отправлен на подписание', 'success');
          const sentDocId = draft.docId;
          closeModal();
          setTimeout(() => { if (typeof openDoc === 'function') openDoc(sentDocId); else switchTab('mine'); }, 250);
        } catch (e) { neEl.textContent = e.message; sendBtn.disabled = false; }
      });

      if (doc) { renderPages(); renderSenderStatus(); renderApproversList(); updatePickerState(); updateSend(); renderHint(); }
    }
  });
}






async function deleteDocForce(id) {
  if (!confirm('Удалить документ и все его подписи? Действие необратимо.')) return;
  try {
    await api('/api/documents/' + id, { method: 'DELETE' });
    toast('Документ удалён', 'success');
    if (state.tab === 'approved') renderApproved();
    else if (state.tab === 'rejected') renderRejected();
    else renderTab();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteDraft(id) {
  if (!confirm('Удалить черновик?')) return;
  try {
    await api('/api/documents/' + id, { method: 'DELETE' });
    toast('Черновик удалён', 'success');
    renderMine();
  } catch (e) { toast(e.message, 'error'); }
}

function handleDocParam() {
  try {
    const params = new URLSearchParams(location.search);
    const docId = params.get('doc');
    if (!docId) return;
    history.replaceState(null, '', location.pathname);
    openDoc(docId);
  } catch {}
}

async function openDoc(id) {
  try {
    const d = await api('/api/documents/' + id);
    renderDoc(d);
  } catch (e) { toast(e.message, 'error'); }
}

/* ============ Штамп подписи: имя + дата + КОММЕНТАРИЙ ============ */
/* ============================================================
   Штамп подписи / плейсхолдер ожидаемой подписи
   ============================================================ */

function buildStampHtml(a, isMine) {
  const s = document.createElement('div');

  // Подписант уже подписал
  if (a.status === 'signed') {
    s.className = 'stamp signed';
    const name = a.approverName ? esc(a.approverName) : 'Подписано';
    const date = a.signedAt ? esc(fmtDate(a.signedAt)) : '';
    const comment = a.comment ? esc(a.comment) : '';
    s.innerHTML = `
      <div class="stamp-name">✓ ${name}</div>
      ${date ? `<div class="stamp-date">${date}</div>` : ''}
      ${comment ? `<div class="stamp-comment">${comment}</div>` : ''}
    `;
    return s;
  }

  // Отменена
  if (a.status === 'cancelled') {
    s.className = 'stamp cancelled';
    const name = a.approverName ? esc(a.approverName) : '—';
    const cancel = a.cancelReason ? esc(a.cancelReason) : '';
    s.innerHTML = `
      <div class="stamp-name">✕ ${name}</div>
      ${cancel ? `<div class="stamp-cancel">${cancel}</div>` : ''}
    `;
    return s;
  }

  // Ожидает подписи — плейсхолдер
  s.className = 'stamp placeholder' + (isMine ? ' my-placeholder' : '');
  const name = a.approverName ? esc(a.approverName) : '';
  s.innerHTML = `
    <div class="placeholder-icon">✍️</div>
    ${name ? `<div class="placeholder-name">${name}</div>` : ''}
    <div class="placeholder-hint">${isMine ? 'Здесь будет ваша подпись' : 'Место подписи'}</div>
  `;
  return s;
}

function renderDoc(d) {
  const my = d.myApproval;
  let actions = '';

  if (!d.isOwner && my) {
    if (my.status === 'pending' && d.status !== 'rejected') {
      actions = `
        <div class="section" id="action-sec">
          <div class="row-actions" style="margin-top:0">
            <button class="btn primary" id="sign">Подписать</button>
            <button class="btn danger-outline" id="cancel">Отменить подпись</button>
            <button class="btn" id="add-signer" type="button">+ Добавить подписантов</button>
          </div>
          <label style="margin-top:12px">Комментарий — появится прямо на документе
            <textarea id="cmt" maxlength="1000" placeholder="Например: Согласовано, замечаний нет"></textarea>
          </label>
          <label style="margin-top:10px">Пароль НЭП
            <input type="password" id="np" autocomplete="current-password">
          </label>
          <div class="error" id="de"></div>
        </div>`;
    } else if (my.status === 'signed') {
      actions = `<div class="section"><h3>Ваша подпись</h3>
        <p>Подписано: <b>${fmtDate(my.signedAt)}</b></p>
        ${my.comment ? `<div class="comment">💬 ${esc(my.comment)}</div>` : ''}
      </div>`;
    } else if (my.status === 'cancelled') {
      actions = `<div class="section"><h3>Ваша подпись</h3>
        <p>Подпись отменена</p>
        ${my.cancelReason ? `<div class="comment danger">Причина: ${esc(my.cancelReason)}</div>` : ''}
      </div>`;
    }
  }

  if (d.isOwner && d.status === 'draft') {
    actions = `<div class="section" id="action-sec">
      <h3>Действие</h3>
      <p class="muted small">Документ ещё не отправлен на подписание.</p>
      <div class="row-actions">
        <button class="btn primary" id="send-now">Отправить на подписание</button>
      </div>
    </div>`;
  }

  const approversHtml = d.approvals.map(a => `
    <div class="approver-row static">
      <div class="approver-info">
        <div class="approver-name">${esc(a.approverName)}</div>
        ${a.comment ? `<div class="comment">💬 ${esc(a.comment)}</div>` : ''}
        ${a.cancelReason ? `<div class="comment danger">✕ ${esc(a.cancelReason)}</div>` : ''}
        <div class="muted small">Стр. ${a.page} · ${Math.round(a.x * 100)}% / ${Math.round(a.y * 100)}%</div>
      </div>
      <span class="badge ap-${a.status}">${APPR[a.status]}</span>
    </div>`).join('');

  openModal({
    title: d.title,
    body: `
      ${actions}
      <div class="section">
        <div class="meta-grid">
          <div><span>Статус</span><div>${statusBadge(d.status)}</div></div>
          <div><span>Отправитель</span><div>${esc(d.ownerName)}</div></div>
          <div><span>Создан</span><div>${fmtDate(d.createdAt)}</div></div>
          <div><span>Размер</span><div>${fmtSize(d.size)}</div></div>
        </div>
        <div class="row-actions">
          <a class="btn small primary" href="/api/documents/${d.id}/file">Скачать</a>
          <button class="btn small" id="btn-print" type="button">Печать</button>
          <button class="btn small" id="btn-annot" type="button">🔖 Примечания <span id="annot-count" class="badge-num"></span></button>
        </div>
      </div>
      <div class="section">
        <h3>Документ</h3>
        <div class="pages">
          ${Array.from({ length: d.pages }, (_, i) => `
            <div class="page-wrap" data-page="${i + 1}">
              <img class="page-img" src="/api/documents/${d.id}/pages/${i + 1}" loading="lazy" alt="">
              <div class="page-overlay"></div>
            </div>`).join('')}
        </div>
      </div>
      ${d.approvals.length ? `<div class="section">
        <h3>Подписанты</h3>
        <div class="approver-list">${approversHtml}</div>
      </div>` : ''}
    `,
    onMount(body) {
      /* Штамп отправителя */
      if (d.senderSigned && d.senderPage != null) {
        const wrap = $(`.page-wrap[data-page="${d.senderPage}"]`, body);
        if (wrap) {
          const s = document.createElement('div');
          s.className = 'stamp sender-stamp';
          s.style.left = ((d.senderPosX ?? 0.5) * 100) + '%';
          s.style.top  = ((d.senderPosY ?? 0.75) * 100) + '%';
          s.innerHTML = `<div class="stamp-name">✍️ ${esc(d.ownerName)}</div>
            ${d.senderComment ? `<div class="stamp-comment">${esc(d.senderComment)}</div>` : ''}`;
          wrap.appendChild(s);
        }
      }

      /* Штампы на страницах (получатели) */
      d.approvals.forEach(a => {
        const wrap = $(`.page-wrap[data-page="${a.page}"]`, body);
        if (!wrap) return;
        const s = buildStampHtml(a);
        s.style.left = (a.x * 100) + '%';
        s.style.top  = (a.y * 100) + '%';
        wrap.appendChild(s);
      });

      const signBtn = $('#sign', body);
      if (signBtn && my) {
        signBtn.addEventListener('click', async () => {
          const err = $('#de', body);
          err.textContent = '';
          const nep = $('#np', body).value;
          const cmt = $('#cmt', body).value;
          if (!nep) return err.textContent = 'Введите пароль НЭП';
          signBtn.disabled = true;
          try {
            await api(`/api/documents/${d.id}/approvals/${my.id}/sign`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nepPassword: nep, comment: cmt })
            });
            toast('Документ подписан', 'success');
            closeModal();
            await loadNotif();
            if (state.tab === 'inbox') renderInbox();
          } catch (e) { err.textContent = e.message; signBtn.disabled = false; }
        });
      }

      const cancelBtn = $('#cancel', body);
      if (cancelBtn && my) {
        cancelBtn.addEventListener('click', () => renderCancelForm(body, d, my));
      }

      const addSignerBtn = $('#add-signer', body);
      if (addSignerBtn) {
        addSignerBtn.addEventListener('click', () => openAddSignerModal(d));
      }

      if (window.EdoWatermark) {
        const pagesContainer = body.querySelector('.pages') || body;
        setTimeout(() => window.EdoWatermark.attach(d.id, pagesContainer), 150);
      }

      // Кнопка «Печать» — открывает чистое окно печати без подписей и watermark
      const printBtn = $('#btn-print', body);
      if (printBtn) {
        printBtn.addEventListener('click', () => {
          if (window.EdoPrint && window.EdoPrint.printDocument) {
            window.EdoPrint.printDocument(d.id, d.title, d.pages);
          } else {
            alert('Модуль печати не загружен');
          }
        });
      }

      const sendNowBtn = $('#send-now', body);
      if (sendNowBtn) {
        sendNowBtn.addEventListener('click', () => {
          closeModal();
          openComposer({ id: d.id });
        });
      }

      // ============ РЕЖИМ ПРИМЕЧАНИЙ ============
      initAnnotations(d, body);
    }
  });
}

function renderCancelForm(host, d, my) {
  const sec = $('#action-sec', host);
  if (!sec) return;
  sec.innerHTML = `
    <h3>Отмена подписи</h3>
    <p class="muted small">Укажите причину — она будет отправлена отправителю.</p>
    <label>Причина (обязательно)
      <textarea id="cr" maxlength="1000"></textarea>
    </label>
    <div class="row-actions">
      <button class="btn ghost" id="cb">Назад</button>
      <button class="btn danger" id="co">Отменить подпись</button>
    </div>
    <div class="error" id="ce"></div>`;

  $('#cb', host).addEventListener('click', () => openDoc(d.id));
  $('#co', host).addEventListener('click', async () => {
    const reason = $('#cr', host).value.trim();
    const ce = $('#ce', host);
    ce.textContent = '';
    if (!reason) return ce.textContent = 'Укажите причину';
    try {
      await api(`/api/documents/${d.id}/approvals/${my.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      toast('Подпись отменена', 'success');
      closeModal();
      await loadNotif();
      if (state.tab === 'inbox') renderInbox();
    } catch (e) { ce.textContent = e.message; }
  });
}


boot();

// === FIX: автозаполнение селекта категорий в модалке загрузки ===
(function initCategorySelectFix() {
  let cachedCategories = null;

  async function loadCategories() {
    if (cachedCategories) return cachedCategories;
    try {
      const res = await fetch('/api/categories', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      cachedCategories = await res.json();
      return cachedCategories;
    } catch (e) {
      console.error('[cat-fix] не удалось загрузить категории:', e);
      cachedCategories = [];
      return [];
    }
  }

  async function fillSelect(sel) {
    if (!sel || sel.dataset.catFixApplied === '1') return;
    sel.dataset.catFixApplied = '1';
    const cats = await loadCategories();
    const current = sel.value;
    sel.innerHTML = '<option value="">— Без категории —</option>' +
      cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (current) sel.value = current;
  }

  function scan() {
    document.querySelectorAll('#cat-select, #catSelect').forEach(fillSelect);
  }

  // Первичный запуск и реакция на появление модалок
  document.addEventListener('DOMContentLoaded', scan);
  const mo = new MutationObserver(scan);
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();

/* === FIX: заполнение селекта категорий в модалке загрузки === */
(function initCategorySelectFix() {
  let cachedCategories = null;

  async function loadCategories() {
    if (cachedCategories) return cachedCategories;
    try {
      const res = await fetch('/api/categories', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      cachedCategories = Array.isArray(data) ? data : [];
      return cachedCategories;
    } catch (e) {
      console.error('[cat-fix] не удалось загрузить категории:', e);
      cachedCategories = [];
      return [];
    }
  }

  async function fillSelect(sel) {
    if (!sel || sel.dataset.catFixApplied === '1') return;
    sel.dataset.catFixApplied = '1';
    const cats = await loadCategories();
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Без категории —</option>' +
      cats.map(c => `<option value="${c.id}">${String(c.name).replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]))}</option>`).join('');
    if (prev) sel.value = prev;
  }

  function scan() {
    document.querySelectorAll('#cat-select, #catSelect').forEach(fillSelect);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();

/* === FIX: сохранение категории при смене селекта === */
(function initCategoryChangeSync() {
  document.addEventListener('change', async (e) => {
    const sel = e.target;
    if (!sel || sel.id !== 'cat-select') return;

    const docId = window.__draftDocId || null;
    if (!docId) {
      console.log('[cat-sync] черновик ещё не создан, категория уйдёт вместе с POST');
      return;
    }

    try {
      const res = await fetch('/api/documents/' + encodeURIComponent(docId), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: sel.value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[cat-sync] ошибка:', data.error || res.status);
      } else {
        console.log('[cat-sync] категория сохранена для документа', docId, '=', sel.value);
      }
    } catch (err) {
      console.error('[cat-sync] fetch error:', err);
    }
  });
})();

/* === FIX: сохранение категории при смене селекта === */
(function initCategoryChangeSync() {
  document.addEventListener('change', async (e) => {
    const sel = e.target;
    if (!sel || sel.id !== 'cat-select') return;

    const docId = window.__draftDocId || null;
    if (!docId) {
      console.log('[cat-sync] черновик ещё не создан, категория уйдёт вместе с POST');
      return;
    }

    try {
      const res = await fetch('/api/documents/' + encodeURIComponent(docId), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: sel.value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[cat-sync] ошибка:', data.error || res.status);
      } else {
        console.log('[cat-sync] категория сохранена для документа', docId, '=', sel.value);
      }
    } catch (err) {
      console.error('[cat-sync] fetch error:', err);
    }
  });
})();

/* === FIX: сохранение категории при смене селекта === */
(function initCategoryChangeSync() {
  document.addEventListener('change', async (e) => {
    const sel = e.target;
    if (!sel || sel.id !== 'cat-select') return;
    const docId = window.__draftDocId || null;
    if (!docId) { console.log('[cat-sync] черновик ещё не создан'); return; }
    try {
      const res = await fetch('/api/documents/' + encodeURIComponent(docId), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: sel.value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) console.error('[cat-sync] ошибка:', data.error || res.status);
      else console.log('[cat-sync] сохранено', docId, '=', sel.value);
    } catch (err) { console.error('[cat-sync] fetch error:', err); }
  });
})();


/* === ADMIN: доступы к категориям (плитки, multi-select) === */
(function initCategoryAccessUI() {
  // --- Стили ---
  if (!document.getElementById('ca-style')) {
    const st = document.createElement('style');
    st.id = 'ca-style';
    st.textContent = `
      .ca-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px}
      .ca-dialog{background:var(--panel,#1a1a1a);border:1px solid #2c2c2c;border-radius:14px;width:100%;max-width:600px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,.6)}
      .ca-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #262626}
      .ca-head h3{margin:0;font-size:16px;font-weight:600}
      .ca-close{background:transparent;border:0;color:#888;font-size:20px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px;transition:all .15s}
      .ca-close:hover{color:#fff;background:#2a2a2a}
      .ca-sub{padding:14px 20px 8px;color:#9a9a9a;font-size:13px;line-height:1.5}
      .ca-tools{display:flex;gap:8px;padding:8px 20px 14px}
      .ca-tools button{background:transparent;border:1px solid #333;color:#bbb;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:all .15s}
      .ca-tools button:hover{border-color:#555;color:#fff;background:#232323}
      .ca-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 20px 16px;overflow-y:auto}
      .ca-tile{display:flex;align-items:center;gap:12px;padding:14px;border:1.5px solid #2c2c2c;border-radius:10px;cursor:pointer;user-select:none;background:#141414;transition:all .15s ease}
      .ca-tile:hover{border-color:#3a3a3a;background:#1a1a1a}
      .ca-tile.selected{border-color:var(--primary,#2f81f7);background:rgba(47,129,247,.10);box-shadow:0 0 0 3px rgba(47,129,247,.12)}
      .ca-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;box-shadow:0 0 8px rgba(0,0,0,.4)}
      .ca-name{flex:1;font-size:14px;font-weight:500}
      .ca-check{width:20px;height:20px;border-radius:6px;border:1.5px solid #3a3a3a;display:flex;align-items:center;justify-content:center;font-size:13px;color:transparent;flex-shrink:0;transition:all .15s;background:#0d0d0d}
      .ca-tile.selected .ca-check{background:var(--primary,#2f81f7);border-color:var(--primary,#2f81f7);color:#fff}
      .ca-empty{grid-column:1/-1;padding:32px;text-align:center;color:#666;font-size:14px}
      .ca-msg{padding:0 20px 12px;font-size:13px;min-height:18px}
      .ca-msg.error{color:#f66}
      .ca-msg.ok{color:#4caf50}
      .ca-footer{display:flex;gap:10px;justify-content:flex-end;padding:14px 20px;border-top:1px solid #262626}
      .ca-btn{padding:9px 18px;border-radius:8px;font-size:14px;cursor:pointer;border:1px solid transparent;transition:all .15s;font-weight:500}
      .ca-btn:disabled{opacity:.5;cursor:not-allowed}
      .ca-btn-primary{background:var(--primary,#2f81f7);color:#fff}
      .ca-btn-primary:hover:not(:disabled){background:#1c6dd0}
      .ca-btn-ghost{background:transparent;border-color:#333;color:#ccc}
      .ca-btn-ghost:hover:not(:disabled){border-color:#555;color:#fff;background:#232323}
    `;
    document.head.appendChild(st);
  }

  let cats = null;
  async function getCats() {
    if (cats) return cats;
    try {
      const r = await fetch('/api/categories', { credentials: 'same-origin' });
      cats = r.ok ? await r.json() : [];
    } catch { cats = []; }
    return cats;
  }

  async function fetchUserCats(userId) {
    try {
      const r = await fetch('/api/users/' + userId + '/categories', { credentials: 'same-origin' });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d.map(Number) : [];
    } catch { return []; }
  }

  async function saveUserCats(userId, ids) {
    const r = await fetch('/api/users/' + userId + '/categories', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_ids: ids })
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Ошибка сохранения');
    }
  }

  const esc2 = s => String(s).replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
  const closeOverlay = () => { const el = document.getElementById('cat-access-overlay'); if (el) el.remove(); };

  async function openAccessDialog(userId, userName) {
    closeOverlay();
    const list = await getCats();
    const selected = new Set(await fetchUserCats(userId));

    const tiles = list.map(c => {
      const isSel = selected.has(Number(c.id));
      const color = c.color || '#2f81f7';
      return `<div class="ca-tile${isSel ? ' selected' : ''}" data-cat-id="${c.id}">
        <span class="ca-dot" style="background:${esc2(color)}"></span>
        <span class="ca-name">${esc2(c.name)}</span>
        <span class="ca-check">✓</span>
      </div>`;
    }).join('');

    const ovl = document.createElement('div');
    ovl.id = 'cat-access-overlay';
    ovl.className = 'ca-overlay';
    ovl.innerHTML = `
      <div class="ca-dialog">
        <div class="ca-head">
          <h3>Доступ к категориям — ${esc2(userName || ('#' + userId))}</h3>
          <button class="ca-close" type="button">✕</button>
        </div>
        <div class="ca-sub">Пользователь увидит только выбранные категории в фильтре и при создании документа. Можно выбрать несколько.</div>
        ${list.length ? `<div class="ca-tools">
          <button type="button" data-act="all">Выбрать все</button>
          <button type="button" data-act="none">Снять все</button>
        </div>` : ''}
        <div class="ca-grid">${tiles || '<div class="ca-empty">Категорий пока нет</div>'}</div>
        <div class="ca-msg" id="ca-msg"></div>
        <div class="ca-footer">
          <button class="ca-btn ca-btn-ghost" type="button" data-act="cancel">Отмена</button>
          <button class="ca-btn ca-btn-primary" type="button" data-act="save">Сохранить</button>
        </div>
      </div>`;
    document.body.appendChild(ovl);

    const grid = ovl.querySelector('.ca-grid');
    const msgEl = ovl.querySelector('#ca-msg');

    grid.addEventListener('click', (e) => {
      const tile = e.target.closest('.ca-tile');
      if (!tile) return;
      e.preventDefault();
      e.stopPropagation();
      tile.classList.toggle('selected');
    });

    ovl.querySelector('.ca-close').addEventListener('click', closeOverlay);
    ovl.addEventListener('click', e => { if (e.target === ovl) closeOverlay(); });

    ovl.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'cancel') return closeOverlay();
        if (act === 'all') { grid.querySelectorAll('.ca-tile').forEach(t => t.classList.add('selected')); return; }
        if (act === 'none') { grid.querySelectorAll('.ca-tile').forEach(t => t.classList.remove('selected')); return; }
        if (act === 'save') {
          msgEl.textContent = ''; msgEl.className = 'ca-msg';
          const ids = Array.from(grid.querySelectorAll('.ca-tile.selected'))
            .map(t => Number(t.dataset.catId))
            .filter(Number.isFinite);
          btn.disabled = true;
          const orig = btn.textContent;
          btn.textContent = 'Сохранение…';
          try {
            await saveUserCats(userId, ids);
            msgEl.className = 'ca-msg ok';
            msgEl.textContent = 'Сохранено';
            setTimeout(closeOverlay, 600);
          } catch (err) {
            msgEl.className = 'ca-msg error';
            msgEl.textContent = err.message;
            btn.disabled = false;
            btn.textContent = orig;
          }
        }
      });
    });
  }

  function enhanceAdminUsersModal() {
    document.querySelectorAll('#modal-root .sheet').forEach(sheet => {
      const titleEl = sheet.querySelector('.sheet-title');
      if (!titleEl || !/управление пользователями/i.test(titleEl.textContent)) return;
      if (sheet.__catAccessAdded) return;
      sheet.__catAccessAdded = true;

      const list = sheet.querySelector('#users-list');
      if (!list) return;

      const attachButtons = () => {
        list.querySelectorAll('.approver-row').forEach(row => {
          if (row.__catBtnAdded) return;
          row.__catBtnAdded = true;

          const delBtn = row.querySelector('[data-del-user]');
          let userId = delBtn ? Number(delBtn.dataset.delUser) : null;
          const nameEl = row.querySelector('.approver-name');
          const displayName = nameEl
            ? nameEl.textContent.replace(/\s*\(вы\)\s*$/, '').replace(/\s*Админ\s*$/, '').trim()
            : '';
          if (!userId && typeof state !== 'undefined' && state.user && nameEl &&
              nameEl.textContent.includes(state.user.fullName)) {
            userId = state.user.id;
          }
          if (!userId) return;

          const btn = document.createElement('button');
          btn.className = 'btn small';
          btn.textContent = 'Доступы';
          btn.style.marginRight = '6px';
          btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            openAccessDialog(userId, displayName);
          });
          if (delBtn) row.insertBefore(btn, delBtn); else row.appendChild(btn);
        });
      };

      attachButtons();
      new MutationObserver(attachButtons).observe(list, { childList: true, subtree: true });

      const submit = sheet.querySelector('#nu-submit');
      if (submit) {
        submit.addEventListener('click', () => {
          const loginEl = sheet.querySelector('#nu-login');
          const username = loginEl ? loginEl.value.trim() : '';
          if (!username) return;
          let tries = 0;
          const iv = setInterval(async () => {
            if (++tries > 20) return clearInterval(iv);
            try {
              const users = await fetch('/api/admin/users', { credentials: 'same-origin' })
                .then(r => r.ok ? r.json() : []);
              const found = users.find(u => u.username === username);
              if (found) { clearInterval(iv); openAccessDialog(found.id, found.fullName || username); }
            } catch {}
          }, 300);
        }, true);
      }
    });
  }

  const root = document.getElementById('modal-root');
  if (root) {
    new MutationObserver(enhanceAdminUsersModal).observe(root, { childList: true, subtree: true });
    enhanceAdminUsersModal();
  }
  window.__openUserCategoryAccess = openAccessDialog;
})();

/* === DOC: доступ к отдельным документам (плитки пользователей) === */
(function initDocAccessUI() {
  if (!document.getElementById('da-style')) {
    const st = document.createElement('style');
    st.id = 'da-style';
    st.textContent = `
      .da-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:#fff;flex-shrink:0;background:#2f81f7}
      .ca-tile .da-meta{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
      .ca-tile .da-meta .da-name{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ca-tile .da-meta .da-login{font-size:12px;color:#888}
      .ca-owner-badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;background:#3a3a3a;color:#ccc;margin-left:6px;text-transform:uppercase;letter-spacing:.5px}
    `;
    document.head.appendChild(st);
  }

  const esc2 = s => String(s || '').replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
  const initials = name => (String(name || '').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()) || '?';
  const colorFromId = id => ['#2f81f7','#8b5cf6','#e11d48','#059669','#d97706','#0891b2','#db2777'][Number(id) % 7];
  const closeOverlay = () => { const el = document.getElementById('doc-access-overlay'); if (el) el.remove(); };

  let usersCache = null;
  async function getUsers() {
    if (usersCache) return usersCache;
    try {
      const r = await fetch('/api/users', { credentials: 'same-origin' });
      usersCache = r.ok ? await r.json() : [];
    } catch { usersCache = []; }
    return usersCache;
  }

  async function fetchDocAccess(docId) {
    try {
      const r = await fetch('/api/documents/' + docId + '/access', { credentials: 'same-origin' });
      if (!r.ok) return [];
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(x => Number(x.user_id)) : [];
    } catch { return []; }
  }

  async function saveDocAccess(docId, userIds) {
    const r = await fetch('/api/documents/' + docId + '/access', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: userIds })
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Ошибка сохранения');
    }
  }

  async function openDocAccessDialog(docId, docTitle, ownerId) {
    closeOverlay();
    const [users, selected] = await Promise.all([getUsers(), fetchDocAccess(docId)]);
    const sel = new Set(selected);

    const tiles = users
      .filter(u => Number(u.id) !== Number(ownerId))
      .map(u => {
        const isSel = sel.has(Number(u.id));
        return `<div class="ca-tile${isSel ? ' selected' : ''}" data-user-id="${u.id}">
          <span class="da-avatar" style="background:${colorFromId(u.id)}">${esc2(initials(u.full_name || u.username))}</span>
          <span class="da-meta">
            <span class="da-name">${esc2(u.full_name || u.username)}</span>
            <span class="da-login">@${esc2(u.username)}</span>
          </span>
          <span class="ca-check">✓</span>
        </div>`;
      }).join('');

    const ovl = document.createElement('div');
    ovl.id = 'doc-access-overlay';
    ovl.className = 'ca-overlay';
    ovl.innerHTML = `
      <div class="ca-dialog">
        <div class="ca-head">
          <h3>Доступ к документу — ${esc2(docTitle)}</h3>
          <button class="ca-close" type="button">✕</button>
        </div>
        <div class="ca-sub">Выбранные пользователи получат доступ к этому документу — увидят его в разделе «Поделились со мной» и смогут открыть.</div>
        ${users.length > 1 ? `<div class="ca-tools">
          <button type="button" data-act="all">Выбрать всех</button>
          <button type="button" data-act="none">Снять всех</button>
        </div>` : ''}
        <div class="ca-grid">${tiles || '<div class="ca-empty">Нет других пользователей</div>'}</div>
        <div class="ca-msg" id="da-msg"></div>
        <div class="ca-footer">
          <button class="ca-btn ca-btn-ghost" type="button" data-act="cancel">Отмена</button>
          <button class="ca-btn ca-btn-primary" type="button" data-act="save">Сохранить</button>
        </div>
      </div>`;
    document.body.appendChild(ovl);

    const grid = ovl.querySelector('.ca-grid');
    const msgEl = ovl.querySelector('#da-msg');

    grid.addEventListener('click', e => {
      const tile = e.target.closest('.ca-tile');
      if (!tile) return;
      e.preventDefault(); e.stopPropagation();
      tile.classList.toggle('selected');
    });

    ovl.querySelector('.ca-close').addEventListener('click', closeOverlay);
    ovl.addEventListener('click', e => { if (e.target === ovl) closeOverlay(); });

    ovl.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'cancel') return closeOverlay();
        if (act === 'all') { grid.querySelectorAll('.ca-tile').forEach(t => t.classList.add('selected')); return; }
        if (act === 'none') { grid.querySelectorAll('.ca-tile').forEach(t => t.classList.remove('selected')); return; }
        if (act === 'save') {
          msgEl.textContent = ''; msgEl.className = 'ca-msg';
          const ids = Array.from(grid.querySelectorAll('.ca-tile.selected'))
            .map(t => Number(t.dataset.userId)).filter(Number.isFinite);
          btn.disabled = true;
          const orig = btn.textContent;
          btn.textContent = 'Сохранение…';
          try {
            await saveDocAccess(docId, ids);
            msgEl.className = 'ca-msg ok';
            msgEl.textContent = 'Сохранено';
            setTimeout(closeOverlay, 600);
          } catch (err) {
            msgEl.className = 'ca-msg error';
            msgEl.textContent = err.message;
            btn.disabled = false; btn.textContent = orig;
          }
        }
      });
    });
  }

  // Поиск модалки документа и добавление кнопки "Поделиться"
  function enhanceDocModal() {
    document.querySelectorAll('#modal-root .sheet').forEach(sheet => {
      if (sheet.__docShareAdded) return;
      const printBtn = sheet.querySelector('#btn-print');
      if (!printBtn) return; // не модалка документа

      sheet.__docShareAdded = true;

      // Достаём docId и метаданные из уже отрисованного DOM
      // Заголовок модалки = d.title (не id, но нам нужен id). Берём из ссылки "Скачать"
      const dl = sheet.querySelector('a[href^="/api/documents/"]');
      if (!dl) return;
      const m = dl.getAttribute('href').match(/\/api\/documents\/(\d+)\/file/);
      if (!m) return;
      const docId = Number(m[1]);
      const docTitle = (sheet.querySelector('.sheet-title')?.textContent || '').trim();

      // Владелец — тот, чей id совпадает с state.user.id? Нет, в модалке показывается
      // владелец как d.ownerId, но мы не знаем, кто текущий. Просто покажем кнопку всем,
      // сервер сам проверит права (owner/admin) и вернёт 403 при попытке.
      // Чтобы не смущать, скрываем кнопку если пользователь не owner/admin:
      // определяем по наличию кнопки "Отправить на подписание" (только владелец) или
      // по state.user.isAdmin.

      const isAdmin = typeof state !== 'undefined' && state.user && state.user.isAdmin;
      const sendNow = sheet.querySelector('#send-now');
      const actionSec = sheet.querySelector('#action-sec');
      // Владелец черновика — есть кнопка #send-now; владелец отправленного — тоже owner,
      // но без явного маркера. Точнее всего: POST /access вернёт 403, если не владелец и не админ.
      // Поэтому просто показываем кнопку всем, а сервер решает.

      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.type = 'button';
      btn.id = 'btn-share';
      btn.textContent = '👥 Поделиться';
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        // ownerId неизвестен напрямую; отфильтруем по текущему пользователю
        // (нельзя поделиться с самим собой). ownerId в модалке = отправитель.
        // Возьмём его из data-атрибута, если пробрасывается — иначе передадим null.
        openDocAccessDialog(docId, docTitle, null);
      });

      // Вставляем после "Примечания"
      const annot = sheet.querySelector('#btn-annot');
      if (annot && annot.parentElement) annot.parentElement.insertBefore(btn, annot.nextSibling);
      else if (printBtn.parentElement) printBtn.parentElement.appendChild(btn);
    });
  }

  const root = document.getElementById('modal-root');
  if (root) {
    new MutationObserver(enhanceDocModal).observe(root, { childList: true, subtree: true });
    enhanceDocModal();
  }

  window.__openDocAccess = openDocAccessDialog;
})();
