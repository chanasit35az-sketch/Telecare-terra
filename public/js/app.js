/* TeleCare Terra — shared front-end runtime (API client, header, modals, checkout, realtime). */
(function () {
  'use strict';

  const TC = (window.TC = {});
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  TC.$ = $; TC.$$ = $$;

  // ------------------------------------------------------------------ utils
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  TC.esc = esc;
  TC.baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH');
  const TZ = { timeZone: 'Asia/Bangkok' };
  TC.date = (ts, opts = {}) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', ...TZ, ...opts }).format(new Date(ts));
  TC.longDate = (ts) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric', ...TZ }).format(new Date(ts));
  TC.time = (ts) => new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, ...TZ }).format(new Date(ts));
  TC.dayKey = (ts) => new Intl.DateTimeFormat('en-CA', TZ).format(new Date(ts));
  TC.isToday = (ts) => TC.dayKey(ts) === TC.dayKey(Date.now());
  TC.isYesterday = (ts) => TC.dayKey(ts) === TC.dayKey(Date.now() - 864e5);
  TC.when = (ts) => {
    if (TC.isToday(ts)) return `วันนี้ ${TC.time(ts)} น.`;
    if (TC.isYesterday(ts)) return `เมื่อวานนี้ ${TC.time(ts)} น.`;
    return `${TC.date(ts)} (${TC.time(ts)} น.)`;
  };
  TC.ago = (ts) => {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'เมื่อสักครู่';
    if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
    if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
    return TC.date(ts);
  };
  TC.mmss = (sec) => `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, '0')}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;
  TC.qs = (k) => new URLSearchParams(location.search).get(k);
  TC.pathId = () => decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
  TC.fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    r.readAsDataURL(file);
  });
  // Downscale large photos before upload.
  TC.compressImage = (file, max = 1600) => new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return TC.fileToDataUrl(file).then(resolve);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => TC.fileToDataUrl(file).then(resolve);
    img.src = URL.createObjectURL(file);
  });
  TC.pickFile = (accept = 'image/*', capture) => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
  TC.loadScript = (src) => new Promise((resolve, reject) => {
    if ($(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load failed: ' + src));
    document.head.appendChild(s);
  });

  // ------------------------------------------------------------------ avatars & image fallback
  const PALETTE = ['#4a7c59', '#705c30', '#6b6358', '#2a6038', '#554020'];
  TC.initialsAvatar = (name = '?') => {
    const clean = String(name).replace(/^(นพ\.|พญ\.|ภก\.|ภญ\.|นาย|นาง|นางสาว|คุณ)\s*/, '').trim();
    const ch = clean.charAt(0) || '?';
    const color = PALETTE[[...clean].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#c8e8d0"/><text x="48" y="61" font-family="Prompt,Nunito Sans,sans-serif" font-size="40" font-weight="600" text-anchor="middle" fill="${color}">${esc(ch)}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };
  TC.avatar = (url, name) => url || TC.initialsAvatar(name);
  const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#f0ece4"/><path d="M160 70v60M130 100h60" stroke="#78a886" stroke-width="10" stroke-linecap="round"/></svg>');
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.fallback) return;
    img.dataset.fallback = '1';
    const small = img.classList.contains('rounded-full') || /\bw-(8|9|10|11|12|16|20)\b/.test(img.className);
    img.src = small ? TC.initialsAvatar(img.alt || '?') : PLACEHOLDER;
  }, true);

  // ------------------------------------------------------------------ API client
  TC.api = async (method, url, body) => {
    const opts = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(url, opts); } catch (e) { throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต'); }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : {};
    if (!res.ok) {
      const err = new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  };
  TC.get = (url) => TC.api('GET', url);
  TC.post = (url, body = {}) => TC.api('POST', url, body);

  // ------------------------------------------------------------------ toasts
  TC.toast = (message, type = 'info') => {
    let box = $('#tct-toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tct-toasts';
      box.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-md pointer-events-none';
      document.body.appendChild(box);
    }
    const icon = { success: 'check_circle', error: 'error', info: 'info' }[type] || 'info';
    const color = { success: 'text-primary-fixed-dim', error: 'text-error-container', info: 'text-tertiary-fixed' }[type];
    const el = document.createElement('div');
    el.className = 'animate-fade-in pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl bg-inverse-surface text-inverse-on-surface text-xs shadow-lg leading-relaxed';
    el.innerHTML = `<span class="material-symbols-outlined text-base ${color}">${icon}</span><span class="flex-1">${esc(message)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, type === 'error' ? 5000 : 3200);
  };
  TC.handle = (err) => { console.error(err); TC.toast(err.message || 'เกิดข้อผิดพลาด', 'error'); };

  // ------------------------------------------------------------------ modals
  TC.inputCls = 'w-full px-4 py-3 bg-surface-container-low text-on-surface placeholder:text-outline text-sm rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary transition-all';
  TC.labelCls = 'text-xs font-semibold text-on-surface tracking-wide';
  TC.btnPrimary = 'px-4 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed';
  TC.btnSecondary = 'px-4 py-2.5 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors';

  TC.modal = ({ title, icon = 'info', body = '', actions = [], size = 'max-w-md', onClose, dismissible = true } = {}) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[70] bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4';
    wrap.innerHTML = `<div class="tct-modal-card bg-surface rounded-2xl ${size} w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true">
      <div class="flex items-center justify-between gap-3"><h3 class="font-headline font-semibold text-base text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-primary">${esc(icon)}</span><span data-title>${esc(title)}</span></h3>
      <button class="text-outline hover:text-on-surface" data-close type="button" aria-label="ปิด"><span class="material-symbols-outlined">close</span></button></div>
      <div data-body>${body}</div>
      ${actions.length ? '<div class="flex flex-wrap items-center justify-end gap-2 pt-2" data-actions></div>' : ''}</div>`;
    const card = wrap.firstElementChild;
    const api = {
      el: card, wrap,
      close() { wrap.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); },
      body: card.querySelector('[data-body]'),
      setBusy(btn, busy, text) {
        if (!btn) return;
        if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-sm animate-spin">progress_activity</span>${esc(text || 'กำลังดำเนินการ...')}</span>`; }
        else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
      },
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) api.close(); };
    document.addEventListener('keydown', onKey);
    card.querySelector('[data-close]').onclick = () => api.close();
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && dismissible) api.close(); });
    const bar = card.querySelector('[data-actions]');
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? TC.btnPrimary : a.danger ? 'px-4 py-2.5 rounded-xl bg-error text-on-error text-xs font-semibold hover:bg-error/90' : TC.btnSecondary;
      b.innerHTML = a.label;
      b.onclick = async () => {
        if (!a.onClick) return api.close();
        try {
          if (a.busy !== false) api.setBusy(b, true, a.busyText);
          const r = await a.onClick(api, b);
          if (r !== false) api.close();
        } catch (err) { TC.handle(err); } finally { if (document.body.contains(b)) api.setBusy(b, false); }
      };
      bar.appendChild(b);
    });
    document.body.appendChild(wrap);
    const first = card.querySelector('input,textarea,select');
    if (first) setTimeout(() => first.focus(), 50);
    return api;
  };

  TC.confirm = (message, { title = 'ยืนยันการดำเนินการ', icon = 'help', ok = 'ยืนยัน', danger = false } = {}) => new Promise((resolve) => {
    let done = false;
    TC.modal({
      title, icon, body: `<p class="text-sm text-on-surface-variant leading-relaxed">${esc(message)}</p>`,
      onClose: () => { if (!done) resolve(false); },
      actions: [{ label: 'ยกเลิก' }, { label: ok, primary: !danger, danger, busy: false, onClick: () => { done = true; resolve(true); } }],
    });
  });

  TC.info = (title, html, icon = 'info') => TC.modal({ title, icon, body: html, actions: [{ label: 'ปิด', primary: true }], size: 'max-w-lg' });

  // ------------------------------------------------------------------ session
  TC.state = { user: null, config: { demoMode: true, oauth: {} } };
  TC.ready = TC.get('/api/auth/me').then((d) => { TC.state.user = d.user; TC.state.config = d.config; return d.user; }).catch(() => null);
  TC.requireLogin = (message = 'กรุณาเข้าสู่ระบบก่อนใช้งาน') => {
    if (TC.state.user) return true;
    TC.toast(message, 'info');
    setTimeout(() => { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; }, 700);
    return false;
  };
  TC.logout = async () => { await TC.post('/api/auth/logout').catch(() => {}); location.href = '/login'; };

  // ------------------------------------------------------------------ realtime (SSE)
  const listeners = {};
  TC.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  const emit = (evt, data) => (listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
  TC.emit = emit;
  // Serverless hosting (e.g. Vercel) cannot keep a stream open, so poll for events instead.
  function pollEvents() {
    let cursor = 0;
    let opened = false;
    const seen = new Set();
    const fast = /^\/(consult|video)\//.test(location.pathname);
    const loop = async () => {
      try {
        const d = await TC.get(`/api/events?since=${cursor}`);
        if (!opened) { opened = true; emit('stream-open'); }
        d.events.forEach((e) => { if (!seen.has(e.id)) { seen.add(e.id); emit(e.event, e.data); } });
        cursor = d.cursor || cursor;
      } catch (e) { /* retry on next tick */ }
      setTimeout(loop, document.hidden ? 10000 : fast ? 1500 : 4000);
    };
    loop();
  }

  function connectStream() {
    if (TC.state.config.realtime === 'poll') return pollEvents();
    const es = new EventSource('/api/stream');
    ['message', 'typing', 'read', 'consultation', 'note', 'rtc', 'order', 'notification'].forEach((evt) => {
      es.addEventListener(evt, (e) => emit(evt, JSON.parse(e.data)));
    });
    es.onopen = () => emit('stream-open');
    TC.stream = es;
  }

  // ------------------------------------------------------------------ header: profile, notifications, search, mobile nav
  function renderProfile(user) {
    const slot = $('#profile-slot');
    if (!slot || !user) return;
    const member = user.isMember ? '<span class="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-[10px] font-bold">Terra Care+</span>' : '';
    const providerLink = user.role !== 'patient' ? '<a class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container text-xs" href="/provider"><span class="material-symbols-outlined text-base text-primary">stethoscope</span>คอนโซลผู้ให้บริการ</a>' : '';
    slot.innerHTML = `<img alt="${esc(user.name)}" class="w-9 h-9 rounded-full object-cover ring-2 ring-primary/20 hover:ring-primary transition-all cursor-pointer" id="profile-avatar" src="${esc(TC.avatar(user.avatar, user.name))}"/>
      <div class="hidden absolute right-0 top-full mt-2 w-64 bg-surface-container-lowest rounded-xl shadow-xl p-2 z-50" id="profile-menu">
        <div class="px-3 py-2.5 mb-1 rounded-lg bg-surface-container-low"><div class="text-sm font-semibold text-on-surface truncate">${esc(user.name)}</div><div class="text-[11px] text-outline truncate">${esc(user.email || user.phone || '')}</div><div class="mt-1 flex items-center gap-1.5">${member}${user.hn ? `<span class="text-[10px] font-mono text-outline">HN ${esc(user.hn)}</span>` : ''}</div></div>
        ${providerLink}
        <button class="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container text-xs" data-menu="profile" type="button"><span class="material-symbols-outlined text-base text-primary">badge</span>ข้อมูลส่วนตัวและสุขภาพ</button>
        ${user.role === 'patient' ? `<button class="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container text-xs" data-menu="appointments" type="button"><span class="material-symbols-outlined text-base text-primary">event</span>นัดหมายของฉัน</button>
        <button class="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container text-xs" data-menu="consults" type="button"><span class="material-symbols-outlined text-base text-primary">forum</span>ประวัติการสนทนา</button>
        <a class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container text-xs" href="/care-plus"><span class="material-symbols-outlined text-base text-tertiary">workspace_premium</span>${user.isMember ? 'จัดการสมาชิก Terra Care+' : 'สมัคร Terra Care+'}</a>
        <div class="px-3 py-2 text-[11px] text-outline flex items-center gap-1.5"><span class="material-symbols-outlined text-sm text-tertiary">stars</span>Terra Points: <b class="text-on-surface">${Number(user.points || 0).toLocaleString()}</b> แต้ม</div>` : ''}
        <button class="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-error-container text-error text-xs" data-menu="logout" type="button"><span class="material-symbols-outlined text-base">logout</span>ออกจากระบบ</button>
      </div>`;
    const menu = $('#profile-menu');
    $('#profile-avatar').onclick = (e) => { e.stopPropagation(); closePanels(menu); menu.classList.toggle('hidden'); };
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-menu]');
      if (!b) return;
      menu.classList.add('hidden');
      ({ profile: TC.profileModal, appointments: TC.appointmentsModal, consults: TC.consultationsModal, logout: TC.logout })[b.dataset.menu]();
    });
  }

  function closePanels(except) {
    ['#profile-menu', '#notif-panel', '#global-search-results'].forEach((s) => { const el = $(s); if (el && el !== except) el.classList.add('hidden'); });
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#profile-slot, #notif-wrap, #global-search-wrap')) closePanels();
  });

  let notifications = [];
  async function loadNotifications() {
    try {
      const d = await TC.get('/api/notifications');
      notifications = d.notifications;
      updateNotifDot();
    } catch (e) { /* ignore */ }
  }
  function updateNotifDot() {
    const dot = $('#notif-dot');
    if (dot) dot.classList.toggle('hidden', !notifications.some((n) => !n.read));
  }
  function renderNotifPanel() {
    const panel = $('#notif-panel');
    const items = notifications.length ? notifications.map((n) => `<a class="flex items-start gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors ${n.read ? '' : 'bg-primary-fixed/20'}" href="${esc(n.link || '#')}">
        <span class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0"><span class="material-symbols-outlined text-base">${esc(n.icon || 'notifications')}</span></span>
        <span class="min-w-0"><span class="block text-xs font-semibold text-on-surface">${esc(n.title)}</span><span class="block text-[11px] text-on-surface-variant leading-snug">${esc(n.body)}</span><span class="block text-[10px] text-outline mt-0.5">${esc(TC.ago(n.at))}</span></span></a>`).join('')
      : '<div class="px-4 py-8 text-center text-xs text-outline">ยังไม่มีการแจ้งเตือน</div>';
    panel.innerHTML = `<div class="flex items-center justify-between px-4 py-3 bg-surface-container-low"><span class="text-xs font-bold text-on-surface">การแจ้งเตือน</span><button class="text-[11px] text-primary font-semibold hover:underline" data-readall type="button">อ่านทั้งหมด</button></div><div class="max-h-96 overflow-y-auto">${items}</div>`;
    panel.querySelector('[data-readall]').onclick = async () => {
      await TC.post('/api/notifications/read-all').catch(TC.handle);
      notifications.forEach((n) => { n.read = true; });
      updateNotifDot(); renderNotifPanel();
    };
  }
  function bindNotifications() {
    const btn = $('#notif-btn');
    if (!btn) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      if (!TC.state.user) return TC.requireLogin('เข้าสู่ระบบเพื่อดูการแจ้งเตือน');
      const panel = $('#notif-panel');
      closePanels(panel);
      renderNotifPanel();
      panel.classList.toggle('hidden');
    };
    TC.on('notification', (n) => {
      notifications.unshift(n);
      updateNotifDot();
      if (!$('#notif-panel').classList.contains('hidden')) renderNotifPanel();
      if (!(TC.silenceNotification && TC.silenceNotification(n))) TC.toast(n.title + (n.body ? ` — ${n.body}` : ''), 'info');
    });
  }

  function bindSearch() {
    const input = $('#global-search');
    const box = $('#global-search-results');
    if (!input) return;
    let timer;
    const run = async () => {
      const q = input.value.trim();
      if (!q) { box.classList.add('hidden'); return; }
      try {
        const d = await TC.get(`/api/search?q=${encodeURIComponent(q)}`);
        const sec = (title, rows) => (rows ? `<div class="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-outline">${title}</div>${rows}` : '');
        const row = (href, icon, a, b) => `<a class="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-container-low" href="${esc(href)}"><span class="material-symbols-outlined text-base text-primary">${icon}</span><span class="min-w-0"><span class="block text-xs font-semibold text-on-surface truncate">${esc(a)}</span><span class="block text-[11px] text-outline truncate">${esc(b)}</span></span></a>`;
        const html = sec('อาการ / แผนก', d.specialties.map((s) => row(`/doctors?category=${s.id}`, 'clinical_notes', s.label, 'ดูแพทย์ในแผนกนี้')).join(''))
          + sec('แพทย์', d.doctors.map((x) => row(`/doctors?doctor=${x.id}`, 'stethoscope', x.name, x.subtitle)).join(''))
          + sec('ร้านยาและคลินิก', d.pharmacies.map((x) => row(`/pharmacies?id=${x.id}`, 'local_pharmacy', x.name, `${x.distanceKm ?? '-'} กม. • ${x.hoursLabel}`)).join(''))
          + sec('ยาและเวชภัณฑ์', d.medicines.map((m) => row(`/pharmacies?med=${encodeURIComponent(m.id)}`, 'medication', m.name, `${m.thai} • ${TC.baht(m.price)}${m.controlled || m.chronic ? ' • ต้องมีใบสั่งยา' : ''}`)).join(''));
        box.innerHTML = html || `<div class="px-3 py-6 text-center text-xs text-outline">ไม่พบผลลัพธ์สำหรับ "${esc(q)}"<br><a class="text-primary font-semibold" href="/pharmacies">ปรึกษาเภสัชกรเกี่ยวกับอาการนี้</a></div>`;
        box.classList.remove('hidden');
      } catch (e) { /* ignore */ }
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
    input.addEventListener('focus', () => { if (input.value.trim()) run(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = box.querySelector('a'); if (first) location.href = first.href; }
      if (e.key === 'Escape') box.classList.add('hidden');
    });
    const m = $('#mobile-search');
    if (m) m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && m.value.trim()) location.href = `/doctors?q=${encodeURIComponent(m.value.trim())}`; });
  }

  function bindMobileNav() {
    const btn = $('#mobile-menu-btn');
    const nav = $('#mobile-nav');
    if (!btn || !nav) return;
    btn.onclick = () => {
      nav.classList.toggle('open');
      nav.classList.toggle('hidden', !nav.classList.contains('open'));
      btn.querySelector('span').textContent = nav.classList.contains('open') ? 'close' : 'menu';
    };
  }

  // ------------------------------------------------------------------ footer / static info modals
  const PRIVACY = `<div class="space-y-3 text-xs text-on-surface-variant leading-relaxed">
    <p>TeleCare Terra เก็บรวบรวมข้อมูลสุขภาพเท่าที่จำเป็นต่อการให้บริการ ได้แก่ ข้อมูลระบุตัวตน ประวัติแพ้ยา โรคประจำตัว บันทึกการปรึกษา และใบสั่งยา ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>
    <p><b class="text-on-surface">การใช้ข้อมูล:</b> ใช้เพื่อการวินิจฉัย จ่ายยา จัดส่ง และติดตามการรักษาเท่านั้น ข้อมูลจะถูกเปิดเผยเฉพาะแพทย์ เภสัชกร และร้านยาที่ดูแลคุณ</p>
    <p><b class="text-on-surface">ความปลอดภัย:</b> รหัสผ่านถูกเข้ารหัสแบบทางเดียว (scrypt) เซสชันใช้คุกกี้ HttpOnly และไฟล์แนบเข้าถึงได้เฉพาะเจ้าของและผู้ให้บริการที่เกี่ยวข้อง</p>
    <p><b class="text-on-surface">สิทธิของคุณ:</b> ขอเข้าถึง แก้ไข หรือลบข้อมูลได้ที่เมนู "ข้อมูลส่วนตัวและสุขภาพ" หรือติดต่อ privacy@telecare.terra</p></div>`;
  const TERMS = `<div class="space-y-3 text-xs text-on-surface-variant leading-relaxed">
    <p>บริการการแพทย์ทางไกลเป็นการให้คำปรึกษาเบื้องต้นโดยผู้ประกอบวิชาชีพที่มีใบอนุญาต ไม่ใช่การทดแทนการตรวจร่างกายในกรณีฉุกเฉิน</p>
    <p><b class="text-error">กรณีฉุกเฉิน</b> เช่น แน่นหน้าอก หายใจไม่ออก แขนขาอ่อนแรง หรือหมดสติ ให้โทร 1669 ทันที</p>
    <p>ยาควบคุมและยาอันตรายจะจ่ายตามใบสั่งยาของแพทย์และการตรวจสอบของเภสัชกรเท่านั้น ผู้ใช้ต้องให้ข้อมูลประวัติแพ้ยาและโรคประจำตัวตามความจริง</p>
    <p>ค่าบริการปรึกษาแพทย์ชำระก่อนเริ่มการปรึกษา สามารถยกเลิกนัดหมายและขอคืนเงินได้ก่อนเวลานัดอย่างน้อย 1 ชั่วโมง</p></div>`;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'privacy') { e.preventDefault(); TC.info('นโยบายความเป็นส่วนตัวของข้อมูลสุขภาพ', PRIVACY, 'shield_lock'); }
    if (act === 'terms') { e.preventDefault(); TC.info('ข้อกำหนดการใช้งานระบบการแพทย์ทางไกล', TERMS, 'gavel'); }
    if (act === 'partner') { e.preventDefault(); TC.supportModal({ topic: 'สมัครเป็นพันธมิตรร้านยา', title: 'ร่วมเป็นพันธมิตรร้านยากับเทเลแคร์', placeholder: 'ชื่อร้านยา เลขที่ใบอนุญาต ข.ย. ที่ตั้ง และชื่อเภสัชกรผู้มีหน้าที่ปฏิบัติการ' }); }
    if (act === 'help') { e.preventDefault(); TC.supportModal({}); }
  });

  // ------------------------------------------------------------------ support / contact
  TC.supportModal = ({ topic = 'ติดต่อศูนย์ช่วยเหลือ', title = 'ติดต่อศูนย์ช่วยเหลือ', placeholder = 'อธิบายปัญหาหรือคำถามของคุณ', orderId } = {}) => {
    const loggedIn = Boolean(TC.state.user);
    TC.modal({
      title, icon: 'support_agent',
      body: `<div class="space-y-3"><div class="p-3 rounded-xl bg-surface-container-low text-xs text-on-surface-variant flex items-center justify-between gap-2"><span>สายด่วนเภสัชกรเทเลแคร์ (24 ชม.)</span><a class="font-bold text-primary" href="tel:021234567">02-123-4567</a></div>
        ${orderId ? '' : `<div class="space-y-1.5"><label class="${TC.labelCls}">หัวข้อ</label><select class="${TC.inputCls}" name="topic"><option>${esc(topic)}</option><option>ปัญหาการใช้งานระบบ</option><option>การชำระเงินและการคืนเงิน</option><option>สอบถามเรื่องยา</option></select></div>`}
        ${orderId ? `<div class="space-y-1.5"><label class="${TC.labelCls}">ประเภทปัญหา</label><select class="${TC.inputCls}" name="topic"><option>จัดส่งล่าช้า</option><option>ได้รับยาไม่ครบ / ไม่ถูกต้อง</option><option>บรรจุภัณฑ์เสียหาย</option><option>ต้องการยกเลิก / เปลี่ยนที่อยู่</option><option>อื่นๆ</option></select></div>` : ''}
        <div class="space-y-1.5"><label class="${TC.labelCls}">รายละเอียด</label><textarea class="${TC.inputCls} min-h-[110px]" name="message" placeholder="${esc(placeholder)}"></textarea></div>
        ${loggedIn ? '' : `<div class="space-y-1.5"><label class="${TC.labelCls}">ช่องทางติดต่อกลับ</label><input class="${TC.inputCls}" name="contact" placeholder="เบอร์โทรหรืออีเมล"/></div>`}</div>`,
      actions: [{ label: 'ยกเลิก' }, {
        label: 'ส่งเรื่อง', primary: true, onClick: async (m) => {
          const v = (n) => (m.el.querySelector(`[name=${n}]`) || {}).value;
          const d = orderId
            ? await TC.post(`/api/orders/${encodeURIComponent(orderId)}/report`, { topic: v('topic'), message: v('message') })
            : await TC.post('/api/support', { topic: v('topic'), message: v('message'), contact: v('contact') });
          TC.toast(`รับเรื่องแล้ว เลขที่ ${d.ticket.id} เจ้าหน้าที่จะติดต่อกลับโดยเร็ว`, 'success');
        },
      }],
    });
  };

  // ------------------------------------------------------------------ profile modal
  TC.profileModal = () => {
    const u = TC.state.user;
    if (!u) return TC.requireLogin();
    const opt = (list, val) => list.map((x) => `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const a = u.address || {};
    TC.modal({
      title: 'ข้อมูลส่วนตัวและสุขภาพ', icon: 'badge', size: 'max-w-2xl',
      body: `<form class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left" data-form>
        <div class="sm:col-span-2 flex items-center gap-4 p-3 rounded-xl bg-surface-container-low"><img alt="${esc(u.name)}" class="w-16 h-16 rounded-xl object-cover" data-avatar src="${esc(TC.avatar(u.avatar, u.name))}"/><div><div class="text-sm font-semibold">${esc(u.name)}</div><div class="text-[11px] text-outline">HN ${esc(u.hn || '-')}</div><button class="mt-1 text-xs font-semibold text-primary hover:underline" data-upload-avatar type="button">เปลี่ยนรูปโปรไฟล์</button></div></div>
        <div class="space-y-1"><label class="${TC.labelCls}">คำนำหน้า</label><select class="${TC.inputCls}" name="title"><option value="">-</option>${opt(['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'], u.title)}</select></div>
        <div class="space-y-1"><label class="${TC.labelCls}">ชื่อ-นามสกุล</label><input class="${TC.inputCls}" name="name" required value="${esc(u.name)}"/></div>
        <div class="space-y-1"><label class="${TC.labelCls}">อีเมล</label><input class="${TC.inputCls}" name="email" type="email" value="${esc(u.email || '')}"/></div>
        <div class="space-y-1"><label class="${TC.labelCls}">เบอร์โทรศัพท์</label><input class="${TC.inputCls}" name="phone" inputmode="tel" value="${esc(u.phone || '')}"/></div>
        <div class="space-y-1"><label class="${TC.labelCls}">วันเกิด</label><input class="${TC.inputCls}" name="dob" type="date" value="${esc(u.dob || '')}"/></div>
        <div class="space-y-1"><label class="${TC.labelCls}">เพศ</label><select class="${TC.inputCls}" name="gender"><option value="">ไม่ระบุ</option>${opt(['ชาย', 'หญิง', 'อื่นๆ'], u.gender)}</select></div>
        <div class="space-y-1"><label class="${TC.labelCls}">หมู่เลือด</label><select class="${TC.inputCls}" name="bloodType"><option value="">ไม่ทราบ</option>${opt(['A Rh+', 'A Rh-', 'B Rh+', 'B Rh-', 'O Rh+', 'O Rh-', 'AB Rh+', 'AB Rh-'], u.bloodType)}</select></div>
        <div class="space-y-1"><label class="${TC.labelCls}">สิทธิการรักษา</label><input class="${TC.inputCls}" name="insurance" placeholder="เช่น บัตรทอง / ประกันสังคม / ประกันเอกชน" value="${esc(u.insurance || '')}"/></div>
        <div class="space-y-1 sm:col-span-2"><label class="${TC.labelCls} text-error">ประวัติแพ้ยา (บรรทัดละ 1 รายการ: ชื่อยา - อาการ)</label><textarea class="${TC.inputCls} min-h-[70px]" name="allergies" placeholder="Penicillin - ผื่นคัน">${esc((u.allergies || []).map((x) => x.name + (x.reaction ? ' - ' + x.reaction : '')).join('\n'))}</textarea></div>
        <div class="space-y-1 sm:col-span-2"><label class="${TC.labelCls}">โรคประจำตัว (บรรทัดละ 1 รายการ)</label><textarea class="${TC.inputCls} min-h-[60px]" name="conditions">${esc((u.conditions || []).join('\n'))}</textarea></div>
        <div class="sm:col-span-2 pt-2 text-xs font-bold text-on-surface flex items-center gap-1.5"><span class="material-symbols-outlined text-base text-primary">location_on</span>ที่อยู่จัดส่งยา</div>
        <div class="space-y-1"><label class="${TC.labelCls}">ชื่อสถานที่</label><input class="${TC.inputCls}" name="addrLabel" placeholder="เช่น คอนโด / บ้าน" value="${esc(a.label || '')}"/></div>
        <div class="space-y-1"><label class="${TC.labelCls}">หมายเหตุถึงไรเดอร์</label><input class="${TC.inputCls}" name="addrNote" value="${esc(a.note || '')}"/></div>
        <div class="space-y-1 sm:col-span-2"><label class="${TC.labelCls}">รายละเอียดที่อยู่</label><input class="${TC.inputCls}" name="addrDetail" placeholder="เลขที่ ชั้น ถนน แขวง เขต รหัสไปรษณีย์" value="${esc(a.detail || '')}"/></div>
        <details class="sm:col-span-2 rounded-xl bg-surface-container-low p-3"><summary class="text-xs font-semibold cursor-pointer">เปลี่ยนรหัสผ่าน</summary><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <input class="${TC.inputCls}" name="currentPassword" placeholder="รหัสผ่านปัจจุบัน" type="password" autocomplete="current-password"/><input class="${TC.inputCls}" name="newPassword" placeholder="รหัสผ่านใหม่ (8 ตัวขึ้นไป)" type="password" autocomplete="new-password"/></div></details>
      </form>`,
      actions: [{ label: 'ยกเลิก' }, {
        label: 'บันทึกข้อมูล', primary: true, onClick: async (m) => {
          const f = Object.fromEntries(new FormData(m.el.querySelector('[data-form]')));
          const body = {
            title: f.title, name: f.name, email: f.email, phone: f.phone, dob: f.dob, gender: f.gender, bloodType: f.bloodType, insurance: f.insurance,
            allergies: f.allergies.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, ...r] = l.split(/\s+-\s+/); return { name: name.trim(), reaction: r.join(' - ').trim() }; }),
            conditions: f.conditions.split('\n').map((l) => l.trim()).filter(Boolean),
          };
          if (f.addrLabel || f.addrDetail) body.address = { label: f.addrLabel, detail: f.addrDetail, note: f.addrNote, lat: (u.address || u.location || {}).lat, lng: (u.address || u.location || {}).lng };
          if (f.newPassword) { body.currentPassword = f.currentPassword; body.newPassword = f.newPassword; }
          const d = await TC.api('PATCH', '/api/me', body);
          TC.state.user = d.user;
          renderProfile(d.user);
          TC.toast('บันทึกข้อมูลเรียบร้อย', 'success');
          emit('user-updated', d.user);
        },
      }],
    }).el.querySelector('[data-upload-avatar]').onclick = async function () {
      const file = await TC.pickFile('image/*');
      if (!file) return;
      try {
        const dataUrl = await TC.compressImage(file, 512);
        const d = await TC.post('/api/me/avatar', { dataUrl });
        TC.state.user = d.user; renderProfile(d.user);
        this.closest('[role=dialog]').querySelector('[data-avatar]').src = d.user.avatar;
        TC.toast('อัปเดตรูปโปรไฟล์แล้ว', 'success');
        emit('user-updated', d.user);
      } catch (e) { TC.handle(e); }
    };
  };

  // ------------------------------------------------------------------ appointments / consultations lists
  TC.appointmentsModal = async () => {
    if (!TC.requireLogin()) return;
    const m = TC.modal({ title: 'นัดหมายของฉัน', icon: 'event', size: 'max-w-lg', body: '<div class="tct-skeleton h-24"></div>' });
    const render = async () => {
      const { appointments } = await TC.get('/api/appointments');
      const upcoming = appointments.filter((a) => a.status === 'booked');
      const past = appointments.filter((a) => a.status !== 'booked').reverse();
      const statusLabel = { booked: 'รอพบแพทย์', cancelled: 'ยกเลิกแล้ว', completed: 'เข้าพบแล้ว' };
      const card = (a) => `<div class="p-3.5 rounded-xl bg-surface-container-low flex items-center gap-3">
          <img alt="${esc(a.doctor.name)}" class="w-11 h-11 rounded-xl object-cover" src="${esc(TC.avatar(a.doctor.photo, a.doctor.name))}"/>
          <div class="flex-1 min-w-0"><div class="text-xs font-bold text-on-surface truncate">${esc(a.doctor.name)}</div><div class="text-[11px] text-on-surface-variant">${esc(a.dateLabel)} • ${esc(a.time)} น. • ${a.mode === 'video' ? 'วิดีโอคอล' : 'แชท'}</div>${a.complaint ? `<div class="text-[11px] text-outline truncate">${esc(a.complaint)}</div>` : ''}</div>
          <div class="flex flex-col items-end gap-1.5 shrink-0"><span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.status === 'booked' ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-high text-on-surface-variant'}">${statusLabel[a.status]}</span>
          ${a.status === 'booked' ? `<div class="flex gap-1.5">${a.joinable ? `<button class="px-2.5 py-1 rounded-lg bg-primary text-on-primary text-[11px] font-semibold" data-join="${a.id}" type="button">เข้าห้องตรวจ</button>` : ''}<button class="px-2.5 py-1 rounded-lg bg-surface-container text-[11px] font-semibold text-error" data-cancel="${a.id}" type="button">ยกเลิก</button></div>` : ''}
          ${a.consultationId ? `<a class="text-[11px] text-primary font-semibold" href="/${a.mode === 'video' ? 'video' : 'consult'}/${a.consultationId}">ดูบันทึก</a>` : ''}</div></div>`;
      m.body.innerHTML = `<div class="space-y-2">${upcoming.length ? upcoming.map(card).join('') : '<div class="p-6 text-center text-xs text-outline rounded-xl bg-surface-container-low">ยังไม่มีนัดหมายที่กำลังจะถึง<br><a class="text-primary font-semibold" href="/doctors">นัดหมายแพทย์เฉพาะทาง</a></div>'}</div>
        ${past.length ? `<div class="pt-3 text-[11px] font-bold uppercase tracking-wider text-outline">ประวัติ</div><div class="space-y-2 mt-2">${past.map(card).join('')}</div>` : ''}
        <p class="text-[11px] text-outline pt-2">เข้าห้องตรวจได้ก่อนเวลานัด 10 นาที • ยกเลิกและขอคืนเงินได้ก่อนเวลานัด 1 ชั่วโมง</p>`;
      m.body.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = async () => {
        if (!(await TC.confirm('ต้องการยกเลิกนัดหมายนี้ใช่หรือไม่? ค่าบริการที่ชำระแล้วจะได้รับคืนภายใน 3-7 วันทำการ', { danger: true, ok: 'ยกเลิกนัดหมาย' }))) return;
        try { await TC.post(`/api/appointments/${b.dataset.cancel}/cancel`); TC.toast('ยกเลิกนัดหมายแล้ว', 'success'); render(); } catch (e) { TC.handle(e); }
      });
      m.body.querySelectorAll('[data-join]').forEach((b) => b.onclick = async () => {
        try { const d = await TC.post(`/api/appointments/${b.dataset.join}/start`); location.href = `/${d.consultation.mode === 'video' ? 'video' : 'consult'}/${d.consultation.id}`; } catch (e) { TC.handle(e); }
      });
    };
    render().catch(TC.handle);
  };

  TC.consultationsModal = async () => {
    if (!TC.requireLogin()) return;
    const m = TC.modal({ title: 'ประวัติการสนทนา', icon: 'forum', size: 'max-w-lg', body: '<div class="tct-skeleton h-24"></div>' });
    try {
      const { consultations } = await TC.get('/api/consultations');
      m.body.innerHTML = consultations.length ? `<div class="space-y-2">${consultations.map((c) => `<a class="p-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center gap-3" href="/${c.mode === 'video' && c.status === 'active' ? 'video' : 'consult'}/${c.id}">
          <img alt="${esc(c.provider.name)}" class="w-10 h-10 rounded-full object-cover" src="${esc(TC.avatar(c.provider.photo, c.provider.name))}"/>
          <div class="flex-1 min-w-0"><div class="text-xs font-bold text-on-surface truncate">${esc(c.provider.name)}</div><div class="text-[11px] text-on-surface-variant truncate">${esc(c.lastMessage || c.complaint || '')}</div><div class="text-[10px] text-outline">${esc(TC.when(c.startedAt))} • ${c.id}</div></div>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.status === 'active' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}">${c.status === 'active' ? 'กำลังสนทนา' : 'สิ้นสุดแล้ว'}</span>${c.unread ? `<span class="w-5 h-5 rounded-full bg-error text-on-error text-[10px] flex items-center justify-center">${c.unread}</span>` : ''}</a>`).join('')}</div>`
        : '<div class="p-6 text-center text-xs text-outline rounded-xl bg-surface-container-low">ยังไม่มีประวัติการปรึกษา</div>';
    } catch (e) { TC.handle(e); }
  };

  // ------------------------------------------------------------------ location
  const AREAS = [
    { label: 'ซอยอารีย์ 1, พญาไท, กรุงเทพฯ', lat: 13.7797, lng: 100.5446 },
    { label: 'สะพานควาย, พญาไท, กรุงเทพฯ', lat: 13.7937, lng: 100.5498 },
    { label: 'อนุสาวรีย์ชัยสมรภูมิ, ราชเทวี, กรุงเทพฯ', lat: 13.7649, lng: 100.5383 },
    { label: 'สาทร, กรุงเทพฯ', lat: 13.7210, lng: 100.5290 },
    { label: 'ลาดพร้าว, จตุจักร, กรุงเทพฯ', lat: 13.8160, lng: 100.5620 },
  ];
  TC.locationModal = () => new Promise((resolve) => {
    if (!TC.requireLogin('เข้าสู่ระบบเพื่อบันทึกพิกัดของคุณ')) return resolve(null);
    let result = null;
    const m = TC.modal({
      title: 'เปลี่ยนพิกัดปัจจุบัน', icon: 'my_location', onClose: () => resolve(result),
      body: `<div class="space-y-3"><button class="w-full py-3 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center justify-center gap-2" data-gps type="button"><span class="material-symbols-outlined text-lg">my_location</span>ใช้ตำแหน่งปัจจุบันจาก GPS</button>
        <div class="text-[11px] text-outline text-center">หรือเลือกพื้นที่</div><div class="space-y-1.5">${AREAS.map((a, i) => `<button class="w-full text-left px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs flex items-center gap-2" data-area="${i}" type="button"><span class="material-symbols-outlined text-base text-primary">location_on</span>${esc(a.label)}</button>`).join('')}</div></div>`,
    });
    const save = async (loc) => {
      try {
        const d = await TC.api('PUT', '/api/me/location', loc);
        TC.state.user = d.user; result = d.user.location;
        TC.toast('อัปเดตพิกัดแล้ว ระบบคำนวณระยะทางร้านยาใหม่ให้', 'success');
        emit('location-changed', d.user.location);
        m.close();
      } catch (e) { TC.handle(e); }
    };
    m.el.querySelectorAll('[data-area]').forEach((b) => b.onclick = () => save(AREAS[b.dataset.area]));
    m.el.querySelector('[data-gps]').onclick = (e) => {
      if (!navigator.geolocation) return TC.toast('อุปกรณ์นี้ไม่รองรับ GPS', 'error');
      m.setBusy(e.currentTarget, true, 'กำลังหาตำแหน่ง...');
      navigator.geolocation.getCurrentPosition(
        (pos) => save({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: `ตำแหน่งปัจจุบัน (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})` }),
        (err) => { m.setBusy(e.target.closest('button'), false); TC.toast(err.code === 1 ? 'กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์' : 'ไม่สามารถระบุตำแหน่งได้', 'error'); },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    };
  });

  // ------------------------------------------------------------------ pharmacy picker
  TC.pharmacyPicker = ({ title = 'เลือกร้านยา', current } = {}) => new Promise((resolve) => {
    let picked = null;
    const m = TC.modal({ title, icon: 'local_pharmacy', size: 'max-w-lg', onClose: () => resolve(picked), body: '<div class="tct-skeleton h-40"></div>' });
    TC.get('/api/pharmacies').then(({ pharmacies }) => {
      m.body.innerHTML = `<div class="space-y-2">${pharmacies.map((p) => `<button class="w-full text-left p-3 rounded-xl ${p.id === current ? 'bg-primary-fixed/40 ring-2 ring-primary/40' : 'bg-surface-container-low hover:bg-surface-container'} flex items-center gap-3 ${p.openNow ? '' : 'opacity-60'}" data-id="${p.id}" type="button">
        <span class="material-symbols-outlined text-primary">${p.type === 'clinic' ? 'local_hospital' : 'local_pharmacy'}</span><span class="flex-1 min-w-0"><span class="block text-xs font-bold text-on-surface truncate">${esc(p.name)}</span><span class="block text-[11px] text-outline">${esc(p.hoursLabel)} • ส่งเฉลี่ย ${p.deliveryMins} นาที</span></span><span class="text-xs font-bold text-primary font-mono">${p.distanceKm ?? '-'} กม.</span></button>`).join('')}</div>`;
      m.body.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { picked = pharmacies.find((p) => p.id === b.dataset.id); m.close(); });
    }).catch(TC.handle);
  });

  // ------------------------------------------------------------------ checkout
  TC.checkout = ({ title = 'ชำระเงิน', amount, lines = [], allowCod = false, submitLabel = 'ยืนยันการชำระเงิน', submit }) => new Promise((resolve) => {
    let result = null;
    const free = !amount;
    const linesHtml = lines.map((l) => `<div class="flex justify-between gap-3 ${l.strong ? 'text-sm font-bold text-on-surface pt-2' : 'text-on-surface-variant'}"><span>${esc(l.label)}</span><span class="${l.accent ? 'text-primary font-medium' : 'font-mono text-on-surface'} text-right">${esc(l.value)}</span></div>`).join('');
    const methods = free ? '' : `<div class="space-y-2"><div class="${TC.labelCls}">วิธีชำระเงิน</div><div class="grid ${allowCod ? 'grid-cols-3' : 'grid-cols-2'} gap-2" data-methods>
        <button class="pay-m p-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 bg-primary-fixed/50 ring-2 ring-primary" data-m="promptpay" type="button"><span class="material-symbols-outlined text-primary">qr_code_2</span>PromptPay</button>
        <button class="pay-m p-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 bg-surface-container-low" data-m="card" type="button"><span class="material-symbols-outlined text-primary">credit_card</span>บัตรเครดิต/เดบิต</button>
        ${allowCod ? '<button class="pay-m p-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 bg-surface-container-low" data-m="cod" type="button"><span class="material-symbols-outlined text-primary">payments</span>ปลายทาง</button>' : ''}</div>
        <div data-pane="promptpay" class="p-4 rounded-xl bg-surface-container-low flex flex-col items-center gap-2 text-center"><div class="bg-white p-2 rounded-lg" data-qr><div class="tct-skeleton w-40 h-40"></div></div><div class="text-[11px] text-on-surface-variant" data-qr-info>สแกนด้วยแอปธนาคารเพื่อชำระ ${TC.baht(amount)}</div><label class="flex items-center gap-2 text-xs"><input class="accent-primary" data-paid type="checkbox"/>ฉันโอนเงินเรียบร้อยแล้ว</label></div>
        <div data-pane="card" class="hidden grid grid-cols-2 gap-2"><input autocomplete="cc-number" class="${TC.inputCls} col-span-2" data-card="number" inputmode="numeric" placeholder="หมายเลขบัตร 16 หลัก"/><input autocomplete="cc-exp" class="${TC.inputCls}" data-card="expiry" placeholder="MM/YY"/><input autocomplete="cc-csc" class="${TC.inputCls}" data-card="cvc" inputmode="numeric" placeholder="CVC"/><p class="col-span-2 text-[10px] text-outline flex items-center gap-1"><span class="material-symbols-outlined text-xs">lock</span>ระบบไม่จัดเก็บเลขบัตรเต็ม เก็บเฉพาะ 4 หลักท้าย</p></div>
        ${allowCod ? '<div data-pane="cod" class="hidden p-3 rounded-xl bg-surface-container-low text-xs text-on-surface-variant">ชำระเงินสดหรือโอนกับไรเดอร์เมื่อได้รับยา</div>' : ''}</div>`;
    const m = TC.modal({
      title, icon: 'payments', onClose: () => resolve(result),
      body: `<div class="space-y-4"><div class="p-4 rounded-xl bg-surface-container-low space-y-1.5 text-xs">${linesHtml}<div class="flex justify-between text-sm font-bold text-on-surface pt-2 border-t border-surface-container-high"><span>ยอดชำระสุทธิ</span><span class="text-primary text-base">${free ? 'ไม่มีค่าใช้จ่าย' : TC.baht(amount)}</span></div></div>${methods}</div>`,
      actions: [{ label: 'ยกเลิก' }, {
        label: submitLabel, primary: true, busyText: 'กำลังดำเนินการ...', onClick: async (mm) => {
          let payment = { method: 'free' };
          if (!free) {
            const method = mm.el.querySelector('.pay-m.ring-2').dataset.m;
            payment = { method };
            if (method === 'promptpay' && !mm.el.querySelector('[data-paid]').checked) { TC.toast('กรุณาสแกนชำระเงิน แล้วติ๊ก "ฉันโอนเงินเรียบร้อยแล้ว"', 'error'); return false; }
            if (method === 'card') ['number', 'expiry', 'cvc'].forEach((k) => { payment[k] = mm.el.querySelector(`[data-card=${k}]`).value; });
          }
          result = await submit(payment);
          return true;
        },
      }],
    });
    if (free) return;
    m.el.querySelectorAll('.pay-m').forEach((b) => b.onclick = () => {
      m.el.querySelectorAll('.pay-m').forEach((x) => { x.classList.remove('ring-2', 'ring-primary', 'bg-primary-fixed/50'); x.classList.add('bg-surface-container-low'); });
      b.classList.add('ring-2', 'ring-primary', 'bg-primary-fixed/50'); b.classList.remove('bg-surface-container-low');
      m.el.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.m));
    });
    const exp = m.el.querySelector('[data-card=expiry]');
    exp.addEventListener('input', () => { const v = exp.value.replace(/\D/g, '').slice(0, 4); exp.value = v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v; });
    const num = m.el.querySelector('[data-card=number]');
    num.addEventListener('input', () => { num.value = num.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '); });
    Promise.all([TC.get(`/api/payments/promptpay?amount=${amount}`), TC.loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js')])
      .then(([d]) => {
        const box = m.el.querySelector('[data-qr]');
        box.innerHTML = '';
        new window.QRCode(box, { text: d.payload, width: 160, height: 160, colorDark: '#2e3230', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
        m.el.querySelector('[data-qr-info]').innerHTML = `${esc(d.merchant)} • พร้อมเพย์ ${esc(d.account)}<br>ยอด <b class="text-primary">${TC.baht(amount)}</b>`;
      }).catch(() => { m.el.querySelector('[data-qr]').innerHTML = '<div class="text-[11px] text-error p-4">สร้าง QR ไม่สำเร็จ</div>'; });
  });

  // ------------------------------------------------------------------ consultations & booking
  TC.intakeModal = ({ title = 'ข้อมูลอาการเบื้องต้น', providerName = '', complaint = '' } = {}) => new Promise((resolve) => {
    let out = null;
    TC.modal({
      title, icon: 'clinical_notes', onClose: () => resolve(out),
      body: `<div class="space-y-3 text-left">${providerName ? `<p class="text-xs text-on-surface-variant">ข้อมูลนี้จะส่งให้ <b class="text-on-surface">${esc(providerName)}</b> ก่อนเริ่มการสนทนา</p>` : ''}
        <div class="space-y-1"><label class="${TC.labelCls}">อาการสำคัญ (Chief Complaint) *</label><textarea class="${TC.inputCls} min-h-[90px]" data-f="complaint" placeholder="เช่น มีไข้ 2 วัน ไอมีเสมหะ ปวดเมื่อยตัว">${esc(complaint)}</textarea></div>
        <div class="grid grid-cols-3 gap-2"><div class="space-y-1"><label class="text-[11px] text-outline">อุณหภูมิ (°C)</label><input class="${TC.inputCls}" data-f="temp" inputmode="decimal" placeholder="37.0"/></div><div class="space-y-1"><label class="text-[11px] text-outline">ความดัน</label><input class="${TC.inputCls}" data-f="bp" placeholder="120/80"/></div><div class="space-y-1"><label class="text-[11px] text-outline">ชีพจร</label><input class="${TC.inputCls}" data-f="pulse" inputmode="numeric" placeholder="72"/></div></div>
        <p class="text-[11px] text-error flex items-start gap-1"><span class="material-symbols-outlined text-sm">emergency</span>หากมีอาการแน่นหน้าอก หายใจไม่ออก หรือหมดสติ โปรดโทร 1669 ทันที</p></div>`,
      actions: [{ label: 'ยกเลิก' }, {
        label: 'ถัดไป', primary: true, busy: false, onClick: (m) => {
          const v = (k) => m.el.querySelector(`[data-f=${k}]`).value.trim();
          if (v('complaint').length < 3) { TC.toast('กรุณาระบุอาการเบื้องต้น', 'error'); return false; }
          out = { complaint: v('complaint'), vitals: { temp: v('temp'), bp: v('bp'), pulse: v('pulse') } };
          return true;
        },
      }],
    });
  });

  TC.startConsultation = async ({ providerType, doctorId, pharmacyId, mode = 'chat', providerName = '', fee = 0, complaint = '' }) => {
    await TC.ready;
    if (!TC.requireLogin('เข้าสู่ระบบเพื่อเริ่มปรึกษา')) return;
    if (TC.state.user.role !== 'patient') return TC.toast('บัญชีผู้ให้บริการไม่สามารถเปิดการปรึกษาในฐานะผู้ป่วยได้', 'error');
    const intake = await TC.intakeModal({ providerName, complaint });
    if (!intake) return;
    const member = TC.state.user.isMember;
    const amount = providerType === 'doctor' && !member ? fee : 0;
    const go = async (payment) => {
      const d = await TC.post('/api/consultations', { providerType, doctorId, pharmacyId, mode, payment, ...intake });
      return d.consultation;
    };
    const c = await TC.checkout({
      title: providerType === 'doctor' ? 'ชำระค่าปรึกษาแพทย์' : 'เริ่มปรึกษาเภสัชกร', amount, submitLabel: amount ? 'ชำระเงินและเริ่มปรึกษา' : 'เริ่มปรึกษาทันที',
      lines: [{ label: providerType === 'doctor' ? `ค่าปรึกษา ${providerName}` : `ปรึกษาเภสัชกร (${providerName})`, value: amount ? TC.baht(amount) : member && providerType === 'doctor' ? 'ฟรี (สิทธิ์ Terra Care+)' : 'ฟรี', accent: !amount },
        { label: 'รูปแบบ', value: mode === 'video' ? 'วิดีโอคอล' : 'แชท' }],
      submit: go,
    });
    if (c) location.href = `/${mode === 'video' ? 'video' : 'consult'}/${c.id}`;
  };

  TC.bookAppointment = async (doctorId) => {
    await TC.ready;
    if (!TC.requireLogin('เข้าสู่ระบบเพื่อจองนัดหมาย')) return;
    const m = TC.modal({ title: 'จองเวลานัดหมาย', icon: 'event_available', size: 'max-w-xl', body: '<div class="tct-skeleton h-48"></div>' });
    let data;
    try { data = await TC.get(`/api/doctors/${encodeURIComponent(doctorId)}`); } catch (e) { m.close(); return TC.handle(e); }
    const d = data.doctor;
    const days = data.days.filter((x) => x.slots.length);
    let day = days.find((x) => x.slots.some((s) => s.available)) || days[0];
    let time = null;
    const DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const draw = () => {
      m.body.innerHTML = `<div class="space-y-4 text-left"><div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low"><img alt="${esc(d.name)}" class="w-12 h-12 rounded-xl object-cover" src="${esc(TC.avatar(d.photo, d.name))}"/><div class="min-w-0"><div class="text-sm font-bold">${esc(d.name)}</div><div class="text-[11px] text-on-surface-variant">${esc(d.subtitle)} • ${TC.baht(d.fee)} / ${d.duration} นาที</div></div></div>
        ${days.length ? `<div class="space-y-1.5"><div class="${TC.labelCls}">เลือกวัน</div><div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">${days.map((x) => `<button class="shrink-0 px-3 py-2 rounded-xl text-xs text-center ${x.date === day.date ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-surface-container-high'}" data-day="${x.date}" type="button"><span class="block font-semibold">${DOW[x.dow]}</span>${esc(x.label.replace(/ \d{4}$/, ''))}</button>`).join('')}</div></div>
        <div class="space-y-1.5"><div class="${TC.labelCls}">เลือกเวลา</div><div class="grid grid-cols-4 sm:grid-cols-6 gap-2">${day.slots.map((s) => `<button ${s.available ? '' : 'disabled'} class="py-2 rounded-lg text-xs font-medium ${!s.available ? 'bg-surface-container text-outline line-through cursor-not-allowed' : s.time === time ? 'bg-primary text-on-primary' : 'bg-surface-container-low hover:bg-surface-container-high'}" data-time="${s.time}" type="button">${s.time}</button>`).join('')}</div></div>`
          : '<div class="p-4 rounded-xl bg-surface-container-low text-xs text-outline text-center">ไม่มีช่วงเวลาว่างใน 7 วันข้างหน้า</div>'}
        <div class="grid grid-cols-2 gap-2"><label class="p-3 rounded-xl bg-surface-container-low text-xs flex items-center gap-2"><input checked class="accent-primary" name="mode" type="radio" value="video"/>วิดีโอคอล</label><label class="p-3 rounded-xl bg-surface-container-low text-xs flex items-center gap-2"><input class="accent-primary" name="mode" type="radio" value="chat"/>แชท</label></div>
        <div class="space-y-1"><label class="${TC.labelCls}">อาการ / เรื่องที่ต้องการปรึกษา</label><textarea class="${TC.inputCls} min-h-[70px]" data-complaint placeholder="ระบุอาการเบื้องต้น เพื่อให้แพทย์เตรียมตัวก่อนพบ">${esc(m.complaint || '')}</textarea></div></div>`;
      m.body.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { m.complaint = m.body.querySelector('[data-complaint]').value; day = days.find((x) => x.date === b.dataset.day); time = null; draw(); });
      m.body.querySelectorAll('[data-time]').forEach((b) => b.onclick = () => { m.complaint = m.body.querySelector('[data-complaint]').value; time = b.dataset.time; draw(); });
    };
    draw();
    const bar = document.createElement('div');
    bar.className = 'flex items-center justify-end gap-2 pt-2';
    bar.innerHTML = `<button class="${TC.btnSecondary}" data-x type="button">ยกเลิก</button><button class="${TC.btnPrimary}" data-ok type="button">ยืนยันการจอง</button>`;
    m.el.appendChild(bar);
    bar.querySelector('[data-x]').onclick = () => m.close();
    bar.querySelector('[data-ok]').onclick = async () => {
      if (!time) return TC.toast('กรุณาเลือกเวลานัดหมาย', 'error');
      const complaint = m.body.querySelector('[data-complaint]').value;
      const mode = m.body.querySelector('[name=mode]:checked').value;
      const chosen = { date: day.date, time, label: day.label };
      m.close();
      const amount = TC.state.user.isMember ? 0 : d.fee;
      const appt = await TC.checkout({
        title: 'ยืนยันและชำระค่านัดหมาย', amount, submitLabel: amount ? 'ชำระเงินและยืนยันนัด' : 'ยืนยันนัดหมาย',
        lines: [{ label: d.name, value: amount ? TC.baht(amount) : 'ฟรี (สิทธิ์ Terra Care+)', accent: !amount }, { label: 'วันเวลา', value: `${chosen.label} ${chosen.time} น.` }, { label: 'รูปแบบ', value: mode === 'video' ? 'วิดีโอคอล' : 'แชท' }],
        submit: async (payment) => (await TC.post('/api/appointments', { doctorId: d.id, date: chosen.date, time: chosen.time, mode, complaint, payment })).appointment,
      });
      if (appt) {
        TC.modal({ title: 'จองนัดหมายสำเร็จ', icon: 'event_available', body: `<div class="text-center space-y-2 py-2"><span class="material-symbols-outlined text-5xl text-primary" style="font-variation-settings:'FILL' 1">check_circle</span><p class="text-sm font-semibold">${esc(d.name)}</p><p class="text-xs text-on-surface-variant">${esc(appt.dateLabel)} เวลา ${esc(appt.time)} น. • ${appt.mode === 'video' ? 'วิดีโอคอล' : 'แชท'}</p><p class="text-[11px] text-outline">เลขที่นัดหมาย ${esc(appt.id)} • ระบบจะแจ้งเตือนก่อนถึงเวลา และเข้าห้องตรวจได้จากเมนู "นัดหมายของฉัน"</p></div>`, actions: [{ label: 'ดูนัดหมายของฉัน', onClick: () => { setTimeout(TC.appointmentsModal, 50); } }, { label: 'ตกลง', primary: true }] });
        emit('appointment-booked', appt);
      }
    };
  };

  TC.doctorProfile = async (doctorId) => {
    const m = TC.modal({ title: 'ประวัติแพทย์', icon: 'stethoscope', size: 'max-w-lg', body: '<div class="tct-skeleton h-48"></div>' });
    try {
      const { doctor: d } = await TC.get(`/api/doctors/${encodeURIComponent(doctorId)}`);
      m.body.innerHTML = `<div class="space-y-4 text-left"><div class="flex items-start gap-4"><img alt="${esc(d.name)}" class="w-24 h-24 rounded-2xl object-cover" src="${esc(TC.avatar(d.photo, d.name))}"/><div class="space-y-1"><span class="px-2 py-0.5 rounded text-[11px] font-medium bg-primary-fixed text-on-primary-fixed">${esc(d.specialtyLabel)}</span><h4 class="font-headline text-lg font-bold">${esc(d.name)}</h4><p class="text-xs text-on-surface-variant">${esc(d.subtitle)}</p><p class="text-[11px] text-outline">${esc(d.hospital)} • ${esc(d.license)}</p><div class="flex items-center gap-1 text-tertiary text-xs font-bold"><span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">star</span>${d.rating} <span class="text-outline font-normal">(${d.reviews} รีวิว)</span></div></div></div>
        <p class="text-xs text-on-surface-variant leading-relaxed">${esc(d.bio)}</p>
        <div class="grid grid-cols-2 gap-2 text-xs"><div class="p-3 rounded-xl bg-surface-container-low"><span class="text-[11px] text-outline block">ประสบการณ์</span><b>${d.experienceYears} ปี</b></div><div class="p-3 rounded-xl bg-surface-container-low"><span class="text-[11px] text-outline block">ภาษา</span><b>${esc(d.languages)}</b></div><div class="p-3 rounded-xl bg-surface-container-low"><span class="text-[11px] text-outline block">ค่าปรึกษา</span><b class="text-primary">${TC.baht(d.fee)} / ${d.duration} นาที</b></div><div class="p-3 rounded-xl bg-surface-container-low"><span class="text-[11px] text-outline block">เวลาเปิดรับสายวันนี้</span><b>${esc(d.todayHours)}</b></div></div>
        <div class="flex flex-wrap gap-2">${(d.expertise || []).map((x) => `<span class="px-3 py-1.5 rounded-lg bg-surface-container text-xs">${esc(x)}</span>`).join('')}</div></div>`;
      const bar = document.createElement('div');
      bar.className = 'flex items-center justify-end gap-2 pt-2';
      bar.innerHTML = `<button class="${TC.btnSecondary}" data-book type="button">จองเวลานัดหมาย</button>${d.availableNow ? `<button class="${TC.btnPrimary}" data-now type="button">วิดีโอคอลปรึกษาทันที</button>` : ''}`;
      m.el.appendChild(bar);
      bar.querySelector('[data-book]').onclick = () => { m.close(); TC.bookAppointment(d.id); };
      if (d.availableNow) bar.querySelector('[data-now]').onclick = () => { m.close(); TC.startConsultation({ providerType: 'doctor', doctorId: d.id, mode: 'video', providerName: d.name, fee: d.fee }); };
    } catch (e) { m.close(); TC.handle(e); }
  };

  TC.share = async (title, url) => {
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      TC.toast('คัดลอกลิงก์แล้ว', 'success');
    } catch (e) { if (e.name !== 'AbortError') TC.toast('คัดลอกลิงก์ไม่สำเร็จ', 'error'); }
  };

  // ------------------------------------------------------------------ boot
  bindMobileNav();
  bindSearch();
  bindNotifications();
  TC.ready.then((user) => {
    if (!user) { const w = $('#notif-wrap'); if (w) w.classList.add('hidden', 'sm:block'); return; }
    renderProfile(user);
    loadNotifications();
    connectStream();
  });
})();
