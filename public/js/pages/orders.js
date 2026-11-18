/* Orders & live delivery tracking */
(function () {
  'use strict';
  const { $, esc } = TC;
  const S = { orders: [], tab: 'all', q: '', asc: false, selected: TC.qs('id') };
  const KIND = { telepharmacy: 'เทเลฟาร์มาซีด่วน', refill: 'ยาประจำ (Refill)', otc: 'ยาสามัญประจำบ้าน', reorder: 'สั่งซ้ำ' };

  // live status computed on the client between server refreshes
  function live(o) {
    const st = o.status;
    if (st.stage === 'cancelled') return st;
    const now = Date.now();
    const { verify: verifyEnd, pack: packAt } = st.times;
    let stage;
    if (now < verifyEnd) stage = 'verify';
    else if (now < packAt) stage = 'pack';
    else if (now < st.etaAt) stage = 'deliver';
    else stage = 'done';
    const progress = stage === 'deliver' ? (now - packAt) / (st.etaAt - packAt) : stage === 'done' ? 1 : 0;
    return { ...st, stage, active: stage !== 'done', progress: Math.min(1, Math.max(0, progress)), remainingMins: stage === 'done' ? 0 : Math.max(1, Math.ceil((st.etaAt - now) / 60000)), remainingKm: Math.round(o.distanceKm * (1 - Math.min(1, progress)) * 10) / 10 };
  }

  const tabMatch = (o) => S.tab === 'all' || (S.tab === 'active' && live(o).active && o.status.stage !== 'cancelled') || (S.tab === 'done' && !live(o).active) || (S.tab === 'refill' && o.refill);
  const textMatch = (o) => !S.q || [o.id, o.pharmacy && o.pharmacy.name, ...o.items.map((i) => i.name)].join(' ').toLowerCase().includes(S.q.toLowerCase());

  function renderMetrics() {
    const active = S.orders.filter((o) => live(o).active && o.status.stage !== 'cancelled').length;
    $('#m-total').textContent = `${S.orders.length} รายการ`;
    $('#m-active').textContent = `${active} รายการ`;
    $('#m-done').textContent = `${S.orders.filter((o) => o.status.stage !== 'cancelled' && !live(o).active).length} รายการ`;
    const counts = { all: S.orders.length, active, done: S.orders.filter((o) => !live(o).active).length };
    const tabs = [['all', `ทั้งหมด (${counts.all})`], ['active', `กำลังจัดส่ง (${counts.active})`], ['done', `จัดส่งสำเร็จแล้ว (${counts.done})`], ['refill', '<span class="material-symbols-outlined text-sm text-tertiary">autorenew</span> คำสั่งซื้อยาประจำ (Refill)']];
    $('#filterContainer').innerHTML = tabs.map(([k, l]) => `<button class="filter-tab px-4 py-2 text-xs rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${S.tab === k ? 'font-semibold bg-primary text-on-primary shadow-sm hover:opacity-90' : 'font-medium bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}" data-tab="${k}" type="button">${l}</button>`).join('');
  }

  function listCard(o) {
    const st = live(o);
    const sel = o.id === S.selected;
    const names = o.items.map((i) => i.name).join(', ');
    if (st.active && o.status.stage !== 'cancelled') {
      return `<div class="order-card relative p-5 rounded-2xl bg-surface-container-lowest shadow-md transition-all cursor-pointer ${sel ? 'ring-2 ring-primary/60 bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-primary-fixed/20' : 'hover:shadow-lg'}" data-order="${esc(o.id)}">
<div class="flex items-start justify-between gap-3 mb-3"><div><div class="flex items-center gap-2"><span class="font-headline font-bold text-base text-on-surface">#${esc(o.id)}</span>${sel ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-on-primary uppercase tracking-wide">กำลังดู</span>' : ''}</div><p class="text-xs text-outline mt-0.5">${TC.isToday(o.createdAt) ? 'วันนี้ • ' : ''}${esc(TC.date(o.createdAt))}, ${TC.time(o.createdAt)} น.</p></div>
<div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>${st.stage === 'deliver' ? `กำลังนำส่ง (~${st.remainingMins} นาที)` : st.stage === 'pack' ? 'กำลังจัดยา' : 'รอเภสัชกรตรวจ'}</div></div>
<div class="p-3 rounded-xl bg-surface-container-low mb-3 space-y-1.5"><div class="flex items-center gap-2 text-xs font-semibold text-on-surface"><span class="material-symbols-outlined text-sm text-primary">local_pharmacy</span><span>${esc(o.pharmacy.name)}</span></div>
<div class="text-[11px] text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-xs text-outline">clinical_notes</span><span>${esc(o.verifiedBy || o.pharmacy.pharmacist.name)} (${st.stage === 'verify' ? 'กำลังตรวจใบสั่งยา' : 'ตรวจใบสั่งยาเรียบร้อย'})</span></div></div>
<div class="text-xs text-on-surface-variant space-y-1 mb-4"><div class="text-outline text-[11px]">เวชภัณฑ์ในกล่อง (${o.items.length} รายการ):</div><p class="font-medium text-on-surface truncate">${esc(names)}</p></div>
<div class="flex items-center justify-between pt-3 border-t border-surface-container-high/60 text-xs"><div><span class="text-[11px] text-outline block">ยอดชำระสุทธิ</span><span class="font-bold text-sm text-on-surface">${TC.baht(o.total)}</span><span class="text-[10px] text-primary ml-1 font-medium">(${esc(payLabel(o.payment))})</span></div>
<div class="flex items-center gap-1 text-primary font-bold hover:underline"><span>ดูข้อมูล GPS</span><span class="material-symbols-outlined text-sm">arrow_forward</span></div></div></div>`;
    }
    const cancelled = o.status.stage === 'cancelled';
    return `<div class="order-card p-5 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all cursor-pointer ${sel ? 'ring-2 ring-primary/60' : 'opacity-90 hover:opacity-100'}" data-order="${esc(o.id)}">
<div class="flex items-start justify-between gap-3 mb-3"><div><span class="font-headline font-bold text-base text-on-surface">#${esc(o.id)}</span><p class="text-xs text-outline mt-0.5">${esc(TC.date(o.createdAt))} • ${TC.time(o.createdAt)} น.</p></div>
<div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high ${cancelled ? 'text-error' : 'text-on-surface-variant'} text-xs font-semibold shrink-0"><span class="material-symbols-outlined text-xs ${cancelled ? '' : 'text-primary'}" style="font-variation-settings: 'FILL' 1;">${cancelled ? 'cancel' : 'check_circle'}</span>${cancelled ? 'ยกเลิกแล้ว' : 'จัดส่งสำเร็จแล้ว'}</div></div>
<div class="p-3 rounded-xl bg-surface-container-low mb-3 space-y-1"><div class="flex items-center gap-2 text-xs font-semibold text-on-surface"><span class="material-symbols-outlined text-sm text-secondary">local_pharmacy</span><span>${esc(o.pharmacy.name)}</span></div>
${o.refill ? `<div class="text-[11px] text-tertiary flex items-center gap-1 font-medium"><span class="material-symbols-outlined text-xs">autorenew</span><span>${esc(o.note || 'คำสั่งซื้อยาโรคประจำตัว')}</span></div>` : ''}</div>
<p class="text-xs font-medium text-on-surface truncate mb-4">${esc(names)}</p>
<div class="flex items-center justify-between pt-3 border-t border-surface-container-high/60 text-xs"><div><span class="text-[11px] text-outline block">ยอดชำระสุทธิ</span><span class="font-bold text-sm text-on-surface">${TC.baht(o.total)}</span></div>
<div class="flex items-center gap-2"><a class="px-3 py-1.5 rounded-lg bg-surface-container text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-colors" href="/print/receipt/${esc(o.id)}" target="_blank">ใบเสร็จ</a>
<button class="px-3 py-1.5 rounded-lg bg-primary-container/40 text-on-primary-fixed-variant text-xs font-bold hover:bg-primary-container/60 transition-colors flex items-center gap-1" data-reorder="${esc(o.id)}" type="button"><span class="material-symbols-outlined text-xs">replay</span>สั่งซ้ำ</button></div></div></div>`;
  }

  const payLabel = (p) => (!p ? '-' : p.method === 'promptpay' ? 'พร้อมเพย์ ชำระแล้ว' : p.method === 'card' ? `บัตร •••• ${p.last4} ชำระแล้ว` : p.method === 'cod' ? 'เก็บเงินปลายทาง' : 'ไม่มีค่าใช้จ่าย');

  function renderList() {
    const list = S.orders.filter((o) => tabMatch(o) && textMatch(o)).sort((a, b) => (S.asc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt));
    $('#order-list').innerHTML = list.length ? list.map(listCard).join('') : `<div class="p-8 rounded-2xl bg-surface-container-lowest text-center text-sm text-on-surface-variant">${S.orders.length ? 'ไม่พบคำสั่งซื้อที่ตรงกับเงื่อนไข' : 'ยังไม่มีคำสั่งซื้อ<br><a class="text-primary font-semibold" href="/pharmacies">สั่งยาจากร้านยาใกล้บ้าน</a>'}</div>`;
  }

  // ---------------------------------------------------------------- detail
  const ROUTE = 'M 180,115 L 300,110 L 310,210 L 400,230 L 410,285 L 530,295 L 560,340';
  function detailTpl(o) {
    const st = live(o);
    const cancelled = o.status.stage === 'cancelled';
    const idx = ['verify', 'pack', 'deliver', 'done'].indexOf(st.stage);
    const stageTimes = [o.status.times.verify, o.status.times.pack, o.status.times.pack, o.status.etaAt];
    const step = (i, icon, label) => {
      const done = idx > i || st.stage === 'done';
      const cur = idx === i && st.stage !== 'done' && !cancelled;
      return `<div class="flex md:flex-col items-center md:text-center gap-3 md:gap-2 ${!done && !cur ? 'opacity-60' : ''}">
<div class="w-10 h-10 rounded-full ${done ? 'bg-primary text-on-primary shadow-sm' : cur ? 'bg-primary-container text-on-primary-container ring-4 ring-primary-fixed/40 shadow-md' : 'bg-surface-container text-outline'} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-lg" ${done ? 'style="font-variation-settings: \'FILL\' 1;"' : ''}>${done ? 'check' : icon}</span></div>
<div><h4 class="text-xs ${cur ? 'font-bold text-primary' : done ? 'font-bold text-on-surface' : 'font-medium text-on-surface'}">${label}</h4><p class="text-[11px] ${cur ? 'text-primary font-semibold' : 'text-outline'}">${done ? `${TC.time(stageTimes[i])} น. (เสร็จสิ้น)` : cur ? `${TC.time(Math.min(Date.now(), stageTimes[i]))} น. (ปัจจุบัน)` : `คาดการณ์ ${TC.time(stageTimes[i])} น.`}</p></div></div>`;
    };
    const fill = cancelled ? 0 : st.stage === 'done' ? 100 : [0, 33.3, 66.6][idx] + (st.stage === 'deliver' ? st.progress * 33.3 : 0);
    const r = o.rider || {};
    const ph = o.pharmacy;
    const addr = o.address || {};
    return `<div class="p-6 rounded-2xl bg-surface-container-lowest shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in"><div><div class="flex flex-wrap items-center gap-2"><span class="text-xs px-2.5 py-0.5 rounded-md bg-secondary-container text-on-secondary-container font-semibold">${esc(KIND[o.kind] || 'คำสั่งซื้อ')}</span><h2 class="text-xl sm:text-2xl font-headline font-bold text-on-surface">คำสั่งซื้อ #${esc(o.id)}</h2></div>
<p class="text-xs text-outline mt-1">ออกโดย ${esc(ph.name)}${o.consultationId ? ` • อ้างอิงการปรึกษา #${esc(o.consultationId)}` : ''} • ออกใบรับรองเวชกรรมเทเลแคร์</p></div>
<div class="flex items-center gap-2 self-stretch sm:self-auto"><button class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors" data-share type="button"><span class="material-symbols-outlined text-base">share</span><span>แชร์ลิงก์</span></button>
<a class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors" href="/print/receipt/${esc(o.id)}" target="_blank"><span class="material-symbols-outlined text-base">receipt_long</span><span>ใบเสร็จ / ใบสั่งยา</span></a></div></div>

<div class="p-6 rounded-2xl bg-surface-container-lowest shadow-md"><div class="flex items-center justify-between mb-6 gap-2"><div><h3 class="text-sm font-bold text-on-surface">ลำดับขั้นตอนการจัดส่งเวชภัณฑ์</h3><p class="text-xs text-outline">ระบบติดตามมาตรฐานระบบยาชุมชนปลอดภัย</p></div>
<span class="px-3 py-1 rounded-full text-xs font-bold shrink-0 ${cancelled ? 'bg-error-container text-error' : st.active ? 'bg-primary text-on-primary animate-pulse' : 'bg-surface-container-high text-on-surface-variant'}">${cancelled ? 'ยกเลิกคำสั่งซื้อแล้ว' : { verify: 'เภสัชกรกำลังตรวจ', pack: 'กำลังบรรจุยา', deliver: 'ไรเดอร์กำลังนำส่ง', done: 'ส่งมอบสำเร็จ' }[st.stage]}</span></div>
<div class="relative"><div class="absolute top-5 left-6 right-6 h-1 bg-surface-container -z-0 hidden md:block"></div><div class="absolute top-5 left-6 h-1 bg-primary -z-0 hidden md:block transition-all duration-700" style="width: calc((100% - 3rem) * ${(fill / 100).toFixed(3)})"></div>
<div class="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">${step(0, 'fact_check', 'ตรวจใบสั่งยา')}${step(1, 'inventory_2', 'บรรจุยาและติดฉลาก')}${step(2, 'moped', 'ไรเดอร์กำลังนำส่ง')}${step(3, 'home', 'ผู้ป่วยรับมอบยา')}</div></div></div>

<div class="relative rounded-2xl overflow-hidden shadow-md bg-surface-container" id="map-wrap"><div class="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
<div class="pointer-events-auto bg-surface/90 backdrop-blur-md px-3.5 py-2 rounded-xl shadow-md flex items-center gap-2 text-xs"><span class="w-2.5 h-2.5 rounded-full ${st.active && !cancelled ? 'bg-primary animate-ping' : 'bg-outline'}"></span><span class="font-bold text-on-surface" id="map-km">${cancelled ? 'ยกเลิกการจัดส่ง' : st.stage === 'done' ? 'ส่งถึงปลายทางแล้ว' : `ระยะทางคงเหลือ ${st.stage === 'deliver' ? st.remainingKm : o.distanceKm} กม.`}</span>${st.active && !cancelled ? `<span class="text-outline">•</span><span class="text-primary font-bold" id="map-min">อีกประมาณ ${st.remainingMins} นาที</span>` : ''}</div>
<div class="pointer-events-auto bg-surface/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md text-xs font-semibold text-on-surface flex items-center gap-1.5"><span class="material-symbols-outlined text-sm text-tertiary">thermostat</span><span>อุณหภูมิกระเป๋า ${o.bagTemp || 22.5}°C (ปกติ)</span></div></div>
<div class="relative w-full h-80 sm:h-96 bg-surface-container-high overflow-hidden" id="map-canvas"><svg class="w-full h-full object-cover" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="routeGradient" x1="0%" x2="100%" y1="0%" y2="100%"><stop offset="0%" stop-color="#4a7c59"></stop><stop offset="100%" stop-color="#78a886"></stop></linearGradient></defs>
<rect fill="#f0ece4" height="450" width="800"></rect><path d="M 600,40 Q 670,80 720,180 T 640,320 Z" fill="#c8e8d0" opacity="0.45"></path><path d="M 50,280 Q 120,300 160,400 T 50,450 Z" fill="#c8e8d0" opacity="0.4"></path>
<path d="M 0,120 L 800,100" fill="none" opacity="0.8" stroke="#ffffff" stroke-width="16"></path><path d="M 0,260 L 800,300" fill="none" opacity="0.8" stroke="#ffffff" stroke-width="20"></path><path d="M 180,0 L 220,450" fill="none" opacity="0.8" stroke="#ffffff" stroke-width="14"></path><path d="M 420,0 L 390,450" fill="none" opacity="0.8" stroke="#ffffff" stroke-width="18"></path><path d="M 640,0 L 610,450" fill="none" opacity="0.8" stroke="#ffffff" stroke-width="12"></path>
<path d="M 220,180 L 400,200 L 520,150" fill="none" stroke="#e4e0d8" stroke-width="8"></path><path d="M 390,320 L 500,340 L 620,290" fill="none" stroke="#e4e0d8" stroke-width="8"></path>
<path d="${ROUTE}" fill="none" id="deliveryPath" stroke="url(#routeGradient)" stroke-dasharray="8 6" stroke-linecap="round" stroke-linejoin="round" stroke-width="6"></path>
<g transform="translate(180, 115)"><circle fill="#4a7c59" opacity="0.2" r="18"></circle><circle fill="#4a7c59" r="12"></circle><text fill="#ffffff" font-family="'Nunito Sans', sans-serif" font-size="11" font-weight="bold" text-anchor="middle" x="0" y="4">+</text></g>
<g transform="translate(560, 340)"><circle fill="#c4a66a" opacity="0.25" r="16"></circle><circle fill="#705c30" r="11"></circle><circle fill="#ffffff" r="5"></circle></g>
${cancelled ? '' : `<g id="rider" transform="translate(180, 115)"><circle fill="#78a886" opacity="0.3" r="22"><animate attributeName="r" dur="2s" repeatCount="indefinite" values="16;26;16"></animate><animate attributeName="opacity" dur="2s" repeatCount="indefinite" values="0.4;0.05;0.4"></animate></circle><circle fill="#4a7c59" r="14" stroke="#ffffff" stroke-width="2"></circle><text fill="#ffffff" font-family="'Material Symbols Outlined'" font-size="16" text-anchor="middle" x="0" y="6">${st.stage === 'done' ? 'home' : st.stage === 'deliver' ? 'moped' : 'medication'}</text></g>`}</svg>
<div class="absolute bottom-4 left-4 right-4 bg-surface/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-outline-variant/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"><div class="space-y-1"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-primary shrink-0"></span><span class="font-bold text-on-surface">ต้นทาง: ${esc(ph.name)}</span></div>
<div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-tertiary shrink-0"></span><span class="text-on-surface-variant font-medium">ปลายทาง: ${esc(addr.label || '-')}</span></div></div>
<div class="flex items-center gap-2 w-full sm:w-auto"><a class="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-[11px] font-semibold hover:bg-surface-container-highest transition-colors flex items-center gap-1 justify-center flex-1 sm:flex-none" href="https://www.google.com/maps/dir/?api=1&origin=${ph.lat},${ph.lng}&destination=${addr.lat || ph.lat},${addr.lng || ph.lng}" rel="noopener" target="_blank"><span class="material-symbols-outlined text-xs">map</span><span>Google Maps</span></a>
<button class="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-[11px] font-semibold hover:bg-surface-container-highest transition-colors flex items-center gap-1 justify-center flex-1 sm:flex-none" data-fullscreen type="button"><span class="material-symbols-outlined text-xs">fullscreen</span><span>ขยายแผนที่</span></button></div></div></div></div>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div class="p-5 rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col justify-between"><div><div class="flex items-center justify-between mb-3"><span class="text-[11px] uppercase tracking-wider font-bold text-outline">ผู้จัดส่งเวชภัณฑ์ด่วน</span><span class="flex items-center gap-1 text-xs font-bold text-tertiary"><span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">star</span>${r.rating || '-'}</span></div>
<div class="flex items-center gap-3 mb-4"><div class="w-12 h-12 rounded-xl bg-surface-container overflow-hidden shrink-0"><img alt="${esc(r.name || 'ไรเดอร์')}" class="w-full h-full object-cover" src="${esc(TC.avatar(r.photo, r.name || 'R'))}"/></div><div><h4 class="text-sm font-bold text-on-surface">${esc(r.name || 'กำลังจัดหาไรเดอร์')}</h4><p class="text-xs text-on-surface-variant">${r.plate ? `มอเตอร์ไซค์ ทะเบียน ${esc(r.plate)}` : ''}</p><p class="text-[11px] text-primary font-medium">ผ่านการอบรมการจัดส่งยา GPP</p></div></div></div>
<div class="flex items-center gap-2 pt-3 border-t border-surface-container">${r.phone && st.active ? `<a class="flex-1 py-2 px-3 rounded-xl bg-primary text-on-primary text-xs font-bold text-center flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity" href="tel:${esc(r.phone)}"><span class="material-symbols-outlined text-sm">call</span>โทรหาไรเดอร์</a><a class="py-2 px-3 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors" href="sms:${esc(r.phone)}?body=${encodeURIComponent(`คำสั่งซื้อ #${o.id}: `)}"><span class="material-symbols-outlined text-sm">chat</span>ข้อความ</a>` : `<span class="text-xs text-outline">${cancelled ? 'คำสั่งซื้อถูกยกเลิก' : 'การจัดส่งเสร็จสิ้นแล้ว'}</span>`}</div></div>
<div class="p-5 rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col justify-between"><div><div class="flex items-center justify-between mb-3"><span class="text-[11px] uppercase tracking-wider font-bold text-outline">เภสัชกรผู้ตรวจสอบยา</span><span class="text-[11px] font-semibold text-primary px-2 py-0.5 rounded-full bg-primary/10">รับรองวิชาชีพ</span></div>
<div class="flex items-center gap-3 mb-4"><div class="w-12 h-12 rounded-xl bg-surface-container overflow-hidden shrink-0"><img alt="${esc(ph.pharmacist.name)}" class="w-full h-full object-cover" src="${esc(TC.avatar(ph.pharmacist.photo, ph.pharmacist.name))}"/></div><div><h4 class="text-sm font-bold text-on-surface">${esc(ph.pharmacist.name)}</h4><p class="text-xs text-on-surface-variant">ใบอนุญาตประกอบวิชาชีพ ${esc(ph.pharmacist.license)}</p><p class="text-[11px] text-outline">${esc(ph.shortName || ph.name)}</p></div></div></div>
<div class="flex items-center gap-2 pt-3 border-t border-surface-container"><button class="w-full py-2 px-3 rounded-xl bg-secondary-container text-on-secondary-container text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity" data-pharmacist-call type="button"><span class="material-symbols-outlined text-sm">video_call</span>วิดีโอคอลปรึกษาวิธีใช้ยากับเภสัชกร</button></div></div></div>

<div class="p-4 rounded-2xl bg-primary-fixed/30 flex items-start gap-3"><div class="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-lg">shield_with_heart</span></div><div><h4 class="text-xs font-bold text-on-primary-fixed">มาตรฐานความปลอดภัยการขนส่งเวชภัณฑ์ (GPP Delivery)</h4><p class="text-[11px] text-on-surface-variant leading-relaxed mt-0.5">ยาถูกบรรจุในกระเป๋าควบคุมอุณหภูมิคงที่ 20–25°C ซีลมิดชิด ป้องกันแสงแดดและความชื้น พร้อมบันทึกฉลากคำแนะนำวิธีใช้ยาภาษาไทยถูกต้องตามประกาศกระทรวงสาธารณสุข</p></div></div>

<div class="p-6 rounded-2xl bg-surface-container-lowest shadow-md"><div class="flex items-center justify-between mb-4"><h3 class="text-sm font-bold text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-primary text-base">medication</span>รายการยาและเวชภัณฑ์ในกล่องส่งมอบ</h3><span class="text-xs text-outline font-medium">${o.items.length} รายการ</span></div>
<div class="space-y-3">${o.items.map((i) => `<div class="p-3.5 rounded-xl bg-surface-container-low flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shrink-0"><span class="material-symbols-outlined text-xl">${esc(i.icon || 'pill')}</span></div><div><h4 class="text-xs font-bold text-on-surface">${esc(i.thai ? `${i.thai} (${i.name})` : i.name)}</h4><p class="text-[11px] text-on-surface-variant">${esc(i.instructions || '')}</p></div></div>
<div class="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-6 text-xs pl-13 sm:pl-0"><span class="text-outline">${esc(i.unit || '')}${i.qty > 1 ? ` × ${i.qty}` : ''}</span><span class="font-bold text-on-surface">${TC.baht(i.price)}</span></div></div>`).join('')}</div>
<div class="mt-4 pt-4 border-t border-surface-container-high space-y-2 text-xs"><div class="flex justify-between text-on-surface-variant"><span>รวมค่าเวชภัณฑ์</span><span>${TC.baht(o.subtotal)}</span></div>${o.discount ? `<div class="flex justify-between text-on-surface-variant"><span>ส่วนลดสมาชิก Terra Care+ (15%)</span><span class="text-primary">-${TC.baht(o.discount)}</span></div>` : ''}
<div class="flex justify-between text-on-surface-variant gap-3"><span>ค่าบริการจัดส่งยาควบคุมอุณหภูมิด่วน (Express Delivery)</span><span class="${o.deliveryFee ? '' : 'text-primary font-medium'} text-right">${o.deliveryFee ? TC.baht(o.deliveryFee) : esc(o.deliveryNote || 'ฟรี')}</span></div>
<div class="flex justify-between text-sm font-bold text-on-surface pt-2 border-t border-dashed border-surface-container-high"><span>ยอดรวมทั้งสิ้น</span><span class="text-primary">${TC.baht(o.total)}</span></div></div></div>

<div class="p-6 rounded-2xl bg-surface-container-lowest shadow-md grid grid-cols-1 md:grid-cols-2 gap-4"><div class="space-y-1.5"><span class="text-[11px] font-bold text-outline uppercase tracking-wider block">สถานที่ส่งมอบยา</span><div class="flex items-start gap-2 text-xs"><span class="material-symbols-outlined text-primary text-base mt-0.5">location_on</span><div><p class="font-bold text-on-surface">${esc(addr.label || '-')}</p><p class="text-on-surface-variant">${esc(addr.detail || '')}</p>${addr.note ? `<p class="text-outline text-[11px] mt-1">บันทึก: ${esc(addr.note)}</p>` : ''}</div></div></div>
<div class="space-y-1.5 md:border-l md:border-surface-container md:pl-4"><span class="text-[11px] font-bold text-outline uppercase tracking-wider block">ข้อมูลการชำระเงิน</span><div class="flex items-start gap-2 text-xs"><span class="material-symbols-outlined text-primary text-base mt-0.5">verified_user</span><div>
<p class="font-bold text-on-surface">${o.payment.method === 'promptpay' ? 'PromptPay QR Code (ชำระเสร็จสมบูรณ์)' : o.payment.method === 'card' ? `บัตร ${esc(o.payment.brand || '')} •••• ${esc(o.payment.last4 || '')} (ชำระเสร็จสมบูรณ์)` : o.payment.method === 'cod' ? 'เก็บเงินปลายทาง' : 'ไม่มีค่าใช้จ่าย'}</p>
<p class="text-on-surface-variant">เลขอ้างอิงสลิป: ${esc(o.payment.ref || '-')}</p>${o.payment.refund ? '<p class="text-error text-[11px] font-semibold mt-1">คืนเงินแล้ว (ภายใน 3-7 วันทำการ)</p>' : `<p class="text-primary text-[11px] font-semibold mt-1">ได้รับคะแนนสะสมสุขภาพ Terra Points +${o.pointsEarned || 0} แต้ม</p>`}</div></div></div></div>

<div class="p-4 rounded-2xl bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"><div class="flex items-center gap-2 text-on-surface-variant"><span class="material-symbols-outlined text-tertiary">support_agent</span><span>มีข้อสงสัยเกี่ยวกับยาหรือการจัดส่งล่าช้า?</span></div>
<div class="flex flex-wrap items-center justify-center gap-3"><a class="font-bold text-primary hover:underline flex items-center gap-1" href="tel:021234567"><span class="material-symbols-outlined text-sm">call</span>สายด่วนเทเลแคร์ 02-123-4567</a><span class="text-outline">|</span><button class="font-bold text-on-surface hover:text-primary transition-colors" data-report type="button">แจ้งปัญหาคำสั่งซื้อ</button>${['verify', 'pack'].includes(st.stage) && !cancelled ? '<span class="text-outline">|</span><button class="font-bold text-error hover:underline" data-cancel type="button">ยกเลิกคำสั่งซื้อ</button>' : ''}</div></div>`;
  }

  function placeRider(o) {
    const g = document.getElementById('rider');
    const path = document.getElementById('deliveryPath');
    if (!g || !path) return;
    const st = live(o);
    const t = st.stage === 'done' ? 1 : st.stage === 'deliver' ? st.progress : 0;
    const p = path.getPointAtLength(path.getTotalLength() * t);
    g.setAttribute('transform', `translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
    const km = $('#map-km');
    const min = $('#map-min');
    if (km && st.stage === 'deliver') km.textContent = `ระยะทางคงเหลือ ${st.remainingKm} กม.`;
    if (min) min.textContent = `อีกประมาณ ${st.remainingMins} นาที`;
  }

  let lastStage = null;
  function renderDetail() {
    const o = S.orders.find((x) => x.id === S.selected);
    if (!o) { $('#order-detail').innerHTML = '<div class="p-10 rounded-2xl bg-surface-container-lowest text-center text-sm text-on-surface-variant">เลือกคำสั่งซื้อทางซ้ายเพื่อดูรายละเอียด</div>'; return; }
    $('#order-detail').innerHTML = detailTpl(o);
    lastStage = live(o).stage;
    placeRider(o);
  }

  function select(id) {
    S.selected = id;
    history.replaceState(null, '', `/orders?id=${encodeURIComponent(id)}`);
    renderList();
    renderDetail();
    if (window.innerWidth < 1024) $('#order-detail').scrollIntoView({ behavior: 'smooth' });
  }

  async function reorder(o) {
    const member = TC.state.user.isMember;
    const disc = member ? Math.round(o.subtotal * 0.15) : 0;
    const fee = member || o.subtotal >= 200 ? 0 : 30;
    const order = await TC.checkout({
      title: `สั่งซ้ำ #${o.id}`, amount: o.subtotal - disc + fee, allowCod: true, submitLabel: 'ยืนยันสั่งซ้ำ',
      lines: [...o.items.map((i) => ({ label: i.name, value: TC.baht(i.price) })), ...(disc ? [{ label: 'ส่วนลดสมาชิก (15%)', value: `-${TC.baht(disc)}`, accent: true }] : []), { label: 'ค่าจัดส่ง', value: fee ? TC.baht(fee) : 'ฟรี', accent: !fee }, { label: 'ร้านยา', value: o.pharmacy.name }],
      submit: async (payment) => (await TC.post(`/api/orders/${o.id}/reorder`, { payment })).order,
    });
    if (order) { TC.toast(`สั่งซื้อสำเร็จ #${order.id}`, 'success'); await load(); select(order.id); }
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-order],[data-tab],[data-reorder],[data-share],[data-fullscreen],[data-report],[data-cancel],[data-pharmacist-call]');
    if (!t) return;
    if (t.closest('a') && !t.matches('[data-order]')) return;
    const o = S.orders.find((x) => x.id === S.selected);
    try {
      if (t.dataset.reorder) { e.stopPropagation(); return reorder(S.orders.find((x) => x.id === t.dataset.reorder)); }
      if (t.dataset.order) return select(t.dataset.order);
      if (t.dataset.tab) { S.tab = t.dataset.tab; renderMetrics(); renderList(); return; }
      if (t.dataset.share != null) return TC.share(`ติดตามคำสั่งซื้อ #${o.id}`, `${location.origin}/orders?id=${o.id}`);
      if (t.dataset.fullscreen != null) {
        const w = $('#map-wrap');
        if (document.fullscreenElement) return document.exitFullscreen();
        if (w.requestFullscreen) { await w.requestFullscreen(); $('#map-canvas').classList.add('h-screen'); } else TC.toast('อุปกรณ์นี้ไม่รองรับโหมดเต็มจอ', 'info');
        return;
      }
      if (t.dataset.report != null) return TC.supportModal({ title: `แจ้งปัญหาคำสั่งซื้อ #${o.id}`, orderId: o.id });
      if (t.dataset.pharmacistCall != null) return TC.startConsultation({ providerType: 'pharmacist', pharmacyId: o.pharmacy.id, mode: 'video', providerName: o.pharmacy.pharmacist.name, complaint: `สอบถามวิธีใช้ยาจากคำสั่งซื้อ #${o.id}` });
      if (t.dataset.cancel != null) {
        if (!(await TC.confirm(`ยกเลิกคำสั่งซื้อ #${o.id}? หากชำระเงินแล้วระบบจะคืนเงินภายใน 3-7 วันทำการ`, { danger: true, ok: 'ยกเลิกคำสั่งซื้อ', title: 'ยกเลิกคำสั่งซื้อ', icon: 'cancel' }))) return;
        await TC.post(`/api/orders/${o.id}/cancel`);
        TC.toast('ยกเลิกคำสั่งซื้อแล้ว', 'success');
        await load();
      }
    } catch (err) { TC.handle(err); }
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { const c = $('#map-canvas'); if (c) c.classList.remove('h-screen'); } });
  $('#order-search').addEventListener('input', (e) => { S.q = e.target.value.trim(); renderList(); });
  $('#sort-btn').onclick = () => { S.asc = !S.asc; $('#sort-btn').textContent = S.asc ? 'เรียงจากเก่าสุด' : 'เรียงตามล่าสุด'; renderList(); };
  TC.on('order', () => load());

  async function load() {
    const d = await TC.get('/api/orders');
    S.orders = d.orders;
    if (!S.selected || !S.orders.some((o) => o.id === S.selected)) S.selected = (S.orders.find((o) => o.status.active) || S.orders[0] || {}).id;
    renderMetrics(); renderList(); renderDetail();
  }

  // smooth live updates: move rider every second, refresh view when stage changes
  setInterval(() => {
    const o = S.orders.find((x) => x.id === S.selected);
    if (!o || o.status.stage === 'cancelled') return;
    if (live(o).stage !== lastStage) { renderMetrics(); renderList(); renderDetail(); return; }
    placeRider(o);
  }, 1000);

  (async () => {
    const user = await TC.ready;
    if (!user) { location.href = '/login?next=/orders'; return; }
    await load();
  })().catch(TC.handle);
})();
