/* Pharmacies & clinics near home: search, filters, pharmacy profile, Rx/OTC ordering, live delivery card */
(function () {
  'use strict';
  const { $, $$, esc } = TC;
  const S = { q: TC.qs('q') || '', filters: new Set((TC.qs('filters') || '').split(',').filter(Boolean)), list: [], all: [], selected: null, orders: [], showAll: false, meds: [] };
  const dist = (km) => (km == null ? '-' : `${km} กม.`);

  // ---------------------------------------------------------------- templates
  function mainTpl(p) {
    const ph = p.pharmacist;
    return `<div class="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 animate-fade-in">
<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4"><div class="space-y-1.5">
<div class="flex flex-wrap items-center gap-2"><span class="px-2.5 py-0.5 rounded-full bg-primary-container/40 text-on-primary-fixed-variant text-[11px] font-semibold">${p.type === 'clinic' ? 'คลินิกและร้านยา GPP' : 'ร้านยาคุณภาพ GPP'}</span><span class="text-xs text-outline font-mono">ID: ${esc(p.code)}</span>
<span class="text-[11px] font-semibold ${p.openNow ? 'text-primary' : 'text-error'}">• ${esc(p.hoursLabel)}</span></div>
<h2 class="text-xl sm:text-2xl font-headline font-bold text-on-surface">${esc(p.name)}</h2>
<p class="text-xs text-on-surface-variant flex items-center gap-1.5"><span class="material-symbols-outlined text-tertiary text-sm">verified</span><span>ได้รับใบอนุญาต ข.ย.๕ เลขที่ <strong>${esc(p.license)}</strong> (กรุงเทพมหานคร)</span></p>
<p class="text-xs text-outline flex items-center gap-1.5"><span class="material-symbols-outlined text-sm">location_on</span>${esc(p.address)} • <a class="text-primary font-semibold hover:underline" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" rel="noopener" target="_blank">นำทาง</a> • <a class="text-primary font-semibold hover:underline" href="tel:${esc(p.phone)}">โทร ${esc(p.phone.replace(/(\d{2})(\d{3})(\d+)/, '$1-$2-$3'))}</a></p></div>
<div class="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 bg-surface-container-low sm:bg-transparent p-3 sm:p-0 rounded-xl">
<div class="flex items-center gap-1 text-tertiary font-bold text-sm"><span class="material-symbols-outlined text-base" style="font-variation-settings: 'FILL' 1;">star</span><span>${p.rating}</span><span class="text-outline font-normal text-xs">(${p.reviews} รีวิว)</span></div>
<span class="text-xs text-primary font-medium flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span> ห่างจากคุณ ${dist(p.distanceKm)}</span></div></div>
<div class="p-4 rounded-xl bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div class="flex items-center gap-3.5"><div class="relative shrink-0">
<img alt="${esc(ph.name)}" class="w-12 h-12 rounded-full object-cover" src="${esc(TC.avatar(ph.photo, ph.name))}"><span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ${p.openNow ? 'bg-primary' : 'bg-outline'} ring-2 ring-surface"></span></div>
<div><div class="flex flex-wrap items-center gap-2"><h3 class="text-sm font-semibold text-on-surface">${esc(ph.name)}</h3><span class="text-[10px] px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant font-mono">${esc(ph.school)}</span></div>
<p class="text-xs ${p.openNow ? 'text-primary' : 'text-outline'} font-medium flex items-center gap-1 mt-0.5"><span class="material-symbols-outlined text-xs">videocam</span>${p.openNow ? 'พร้อมให้คำปรึกษาผ่านวิดีโอคอลทันที' : 'นอกเวลาทำการ'}</p></div></div>
<div class="text-xs text-on-surface-variant sm:text-right shrink-0"><span class="text-[11px] text-outline block">เวลาปฏิบัติงานวันนี้</span><span class="font-medium text-on-surface">${esc(ph.hours)}</span></div></div>
<div class="space-y-3"><p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">ปรึกษาอาการและรับคำแนะนำการใช้ยา</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
<button ${p.openNow ? '' : 'disabled'} class="px-5 py-3.5 bg-primary text-on-primary rounded-xl font-semibold text-sm hover:bg-primary/95 transition-all shadow-sm flex items-center justify-center gap-2.5 text-center group disabled:opacity-50" data-consult="video" type="button"><span class="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">video_call</span><span class="text-left leading-tight"><span class="block">วิดีโอคอลปรึกษาทันที</span><span class="text-[11px] font-normal text-on-primary-container">ไม่มีค่าธรรมเนียมเบื้องต้น</span></span></button>
<button ${p.openNow ? '' : 'disabled'} class="px-5 py-3.5 bg-surface-container-high text-on-surface hover:bg-surface-variant rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2.5 text-center disabled:opacity-50" data-consult="chat" type="button"><span class="material-symbols-outlined text-xl text-primary">chat</span><span class="text-left leading-tight"><span class="block">แชทสอบถามอาการ</span><span class="text-[11px] font-normal text-on-surface-variant">ตอบกลับเฉลี่ย &lt; 2 นาที</span></span></button></div></div></div>`;
  }

  function itemRow(i) {
    return `<div class="p-3.5 rounded-xl bg-surface-container-low flex items-start justify-between gap-4"><div class="flex items-start gap-3"><div class="p-2 rounded-lg bg-surface-container-highest text-primary shrink-0"><span class="material-symbols-outlined text-base">${esc(i.icon || 'medication')}</span></div>
<div><div class="flex flex-wrap items-center gap-2"><h4 class="text-sm font-semibold text-on-surface">${esc(i.thai ? `${i.name}` : i.name)}</h4>${i.controlled ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-tertiary-container/30 text-on-tertiary-container font-medium">ยาควบคุม</span>' : ''}</div>
<p class="text-xs text-on-surface-variant mt-0.5">${esc(i.instructions || '')}</p><span class="inline-block mt-1 text-[11px] text-outline font-mono">จำนวน: ${esc(i.unit || '')}${i.qty > 1 ? ` × ${i.qty}` : ''}</span></div></div>
<span class="font-semibold text-sm text-on-surface shrink-0 font-mono">${TC.baht(i.price)}</span></div>`;
  }

  function rxTpl(o, p) {
    const head = `<div class="flex items-center justify-between pb-4 border-b border-surface-container"><div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><span class="material-symbols-outlined text-lg">receipt_long</span></div>
<div><h3 class="font-headline font-bold text-base text-on-surface">ใบสั่งจ่ายยาและเวชภัณฑ์ (Rx)</h3><span class="text-[11px] text-outline font-mono">${o ? `อ้างอิง: #${esc(o.id)}${o.consultationId ? ` • เทเลคอนซัลต์ #${esc(o.consultationId)}` : ''}` : `${esc(p.shortName || p.name)}`}</span></div></div>
${o ? `<span class="px-3 py-1 rounded-full bg-surface-container ${o.status.active ? 'text-primary' : 'text-tertiary'} font-semibold text-xs flex items-center gap-1"><span class="material-symbols-outlined text-xs">${o.status.stage === 'cancelled' ? 'cancel' : o.status.active ? 'local_shipping' : 'check_circle'}</span>${o.status.stage === 'verify' ? 'รอเภสัชกรตรวจ' : o.status.stage === 'pack' ? 'กำลังจัดยา' : o.status.stage === 'deliver' ? 'จัดเสร็จแล้ว • กำลังส่ง' : o.status.stage === 'cancelled' ? 'ยกเลิก' : 'ส่งมอบแล้ว'}</span>` : ''}</div>`;
    const otcBtn = `<button class="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface flex items-center gap-1.5" data-otc type="button"><span class="material-symbols-outlined text-base text-primary">add_shopping_cart</span>สั่งยาสามัญประจำบ้าน</button>`;
    if (!o) {
      return `<div class="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">${head}
<div class="p-6 rounded-xl bg-surface-container-low text-center space-y-2"><span class="material-symbols-outlined text-4xl text-primary-container">prescriptions</span><p class="text-sm font-semibold text-on-surface">ยังไม่มีใบสั่งยาจากร้านนี้</p><p class="text-xs text-on-surface-variant">ปรึกษาเภสัชกรเพื่อรับคำแนะนำและใบสั่งจ่ายยา หรือสั่งยาสามัญประจำบ้านจัดส่งถึงบ้านได้ทันที</p></div>
<div class="flex flex-wrap justify-end gap-2">${otcBtn}</div></div>`;
    }
    return `<div class="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 animate-fade-in">${head}
<div class="space-y-3.5">${o.items.map(itemRow).join('')}</div>
<div class="pt-4 border-t border-surface-container space-y-4"><div class="space-y-1.5 text-xs text-on-surface-variant">
<div class="flex justify-between"><span>ราคารวมรายการยา</span><span class="font-mono text-on-surface">${TC.baht(o.subtotal)}</span></div>
<div class="flex justify-between"><span>ค่าบริการให้คำปรึกษาทางเภสัชกรรม (Tele-pharmacy)</span><span class="text-primary font-medium">ฟรี (สนับสนุนโดย สปสช./ระบบร่วม)</span></div>
${o.discount ? `<div class="flex justify-between"><span>ส่วนลดสมาชิก Terra Care+ (15%)</span><span class="font-mono text-primary">-${TC.baht(o.discount)}</span></div>` : ''}
<div class="flex justify-between"><span>ค่าจัดส่งด่วนพิเศษ</span><span class="font-mono ${o.deliveryFee ? 'text-on-surface' : 'text-primary'}">${o.deliveryFee ? TC.baht(o.deliveryFee) : esc(o.deliveryNote || 'ฟรี')}</span></div>
<div class="flex justify-between text-sm font-bold text-on-surface pt-2"><span>ยอดชำระสุทธิ</span><span class="text-base text-primary font-mono">${TC.baht(o.total)}</span></div></div>
<div class="p-3.5 rounded-xl bg-surface-container flex items-center justify-between gap-3"><div class="flex items-center gap-2 text-xs text-on-surface-variant"><span class="material-symbols-outlined text-primary text-lg">verified</span><span>ยืนยันการจ่ายยาโดยเภสัชกรใบประกอบวิชาชีพ (${esc(p.pharmacist.license)})</span></div>
<a class="text-xs text-primary font-semibold hover:underline shrink-0 flex items-center gap-0.5" href="/print/receipt/${esc(o.id)}" target="_blank"><span>ดูเอกสารกำกับ</span><span class="material-symbols-outlined text-sm">open_in_new</span></a></div>
<div class="flex flex-wrap justify-end gap-2">${otcBtn}<a class="px-4 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-primary/90" href="/orders?id=${esc(o.id)}"><span class="material-symbols-outlined text-base">pin_drop</span>ติดตามคำสั่งซื้อ</a></div></div></div>`;
  }

  function deliveryTpl(o) {
    const img = TC.state.config.images ? TC.state.config.images.mapPharmacy : '';
    const map = (overlay) => `<div class="w-full h-44 rounded-xl bg-surface-container bg-cover bg-center relative overflow-hidden flex flex-col justify-end p-3.5 shadow-inner" style="background-image: url('${esc(img)}')"><div class="absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-transparent to-transparent pointer-events-none"></div>${overlay}</div>`;
    if (!o) {
      return `<div class="bg-surface-container-lowest rounded-2xl p-6 sm:p-7 shadow-md space-y-6"><div class="flex items-center justify-between"><div class="flex items-center gap-2"><span class="inline-block w-2.5 h-2.5 rounded-full bg-outline"></span><h3 class="font-headline font-bold text-lg text-on-surface">ติดตามการส่งยาด่วน</h3></div><span class="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">จัดส่งด่วน &lt; 1 ชม.</span></div>
${map('<div class="relative z-10 text-inverse-on-surface text-xs font-medium">ยังไม่มีรายการที่กำลังจัดส่ง</div>')}
<p class="text-xs text-on-surface-variant leading-relaxed">เมื่อยืนยันใบสั่งยาหรือสั่งซื้อยา ระบบจะแสดงสถานะการจัดยา ตำแหน่งไรเดอร์ และเวลาที่คาดว่าจะถึงที่นี่แบบเรียลไทม์</p>
<a class="block text-center py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface" href="/orders">ดูประวัติคำสั่งซื้อทั้งหมด</a>
<div class="p-3.5 rounded-xl bg-surface-container-low flex items-start gap-2.5"><span class="material-symbols-outlined text-tertiary text-lg shrink-0 mt-0.5">ac_unit</span><div class="space-y-0.5 text-xs"><span class="font-semibold text-on-surface">มาตรฐานการควบคุมคุณภาพยา (GPP)</span><p class="text-on-surface-variant leading-relaxed text-[11px]">ยาถูกบรรจุในกระเป๋าควบคุมอุณหภูมิ 20-25°C มิดชิด ป้องกันแสงแดดและความชื้นตลอดการเดินทาง</p></div></div></div>`;
    }
    const st = o.status;
    const stg = st.stage;
    const s1done = stg === 'deliver' || stg === 'done';
    const s2done = stg === 'done';
    const r = o.rider || {};
    const step = (done, active, icon, title, time, desc, last) => `<div class="flex gap-3 ${last ? '' : 'pb-6'} relative"><div class="flex flex-col items-center">
<div class="w-7 h-7 rounded-full ${done ? 'bg-primary text-on-primary' : active ? 'bg-primary-container text-on-primary-fixed-variant animate-pulse' : 'bg-surface-variant text-outline'} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-sm ${done ? 'font-bold' : ''}">${done ? 'check' : icon}</span></div>
${last ? '' : `<div class="w-0.5 h-full ${done ? 'bg-primary' : 'bg-surface-variant'} mt-1"></div>`}</div>
<div class="space-y-0.5"><div class="flex items-center gap-2"><h4 class="text-xs font-bold ${active ? 'text-primary' : done ? 'text-on-surface' : 'text-on-surface-variant'}">${title}</h4>${time ? `<span class="text-[10px] ${active ? 'px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold' : 'text-outline font-mono'}">${time}</span>` : ''}</div><p class="text-xs ${done || active ? 'text-on-surface-variant' : 'text-outline'}">${desc}</p></div></div>`;
    return `<div class="bg-surface-container-lowest rounded-2xl p-6 sm:p-7 shadow-md space-y-6 animate-fade-in">
<div class="flex items-center justify-between"><div class="flex items-center gap-2"><span class="inline-block w-2.5 h-2.5 rounded-full bg-primary ${st.active ? 'animate-ping' : ''}"></span><h3 class="font-headline font-bold text-lg text-on-surface">ติดตามการส่งยาด่วน</h3></div><span class="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">${st.active ? `จัดส่งด่วน &lt; ${o.etaMins + 5} นาที` : 'ส่งมอบแล้ว'}</span></div>
${map(`<div class="relative z-10 flex items-center justify-between text-inverse-on-surface text-xs gap-2"><div class="flex items-center gap-1.5 font-medium"><span class="material-symbols-outlined text-primary-fixed-dim text-sm">navigation</span><span>${stg === 'deliver' ? `ไรเดอร์กำลังมุ่งหน้า ${esc((o.address && o.address.label) || 'ปลายทาง')}` : stg === 'done' ? 'ส่งถึงปลายทางเรียบร้อย' : 'กำลังจัดเตรียมยาที่ร้าน'}</span></div><span class="font-mono text-tertiary-fixed font-bold shrink-0">${st.active ? `อีกประมาณ ${st.remainingMins} นาที` : TC.time(st.deliveredAt) + ' น.'}</span></div>`)}
<div class="space-y-0 relative">
${step(s1done, stg === 'verify' || stg === 'pack', 'medication', 'เภสัชกรตรวจเช็คและบรรจุยา', `${TC.time(o.createdAt)} น.`, 'ตรวจสอบประวัติแพ้ยา ปริมาณสารสำคัญ และปิดผนึกถุงยาสุญญากาศ')}
${step(s2done, stg === 'deliver', 'two_wheeler', 'ไรเดอร์เมดิคอลรับยาจากร้าน', stg === 'deliver' ? 'กำลังเดินทาง' : s2done ? `${TC.time(st.stages[2].at)} น.` : '', stg === 'deliver' || s2done ? 'ออกเดินทางแล้ว กำลังมุ่งหน้าตามเส้นทางพิเศษ' : 'รอรับยาจากร้าน')}
${step(s2done, false, 'home_pin', 'จัดส่งถึงจุดหมายปลายทาง', s2done ? `${TC.time(st.deliveredAt)} น.` : '', esc(o.address ? `${o.address.label || ''} ${o.address.detail ? `(${o.address.detail})` : ''}` : '-'), true)}</div>
${r.name ? `<div class="p-4 rounded-xl bg-surface-container space-y-3.5"><div class="flex items-center justify-between"><div class="flex items-center gap-3"><img alt="${esc(r.name)}" class="w-10 h-10 rounded-full object-cover shrink-0" src="${esc(TC.avatar(r.photo, r.name))}">
<div><h4 class="text-xs font-bold text-on-surface">${esc(r.name.replace(/^คุณ/, ''))}</h4><div class="flex items-center gap-1.5 text-[11px] text-on-surface-variant"><span class="font-mono font-medium">${esc(r.plate.split(' ')[0])}</span><span class="text-outline">•</span><span class="flex items-center text-tertiary"><span class="material-symbols-outlined text-xs" style="font-variation-settings: 'FILL' 1;">star</span> ${r.rating}</span></div></div></div>
<a class="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm" href="tel:${esc(r.phone)}" title="โทรหาไรเดอร์"><span class="material-symbols-outlined text-base">call</span></a></div>
<div class="pt-2 border-t border-surface-variant/60 grid grid-cols-2 gap-2 text-xs"><div class="space-y-0.5"><span class="text-[11px] text-outline">ระยะทางจัดส่ง</span><p class="font-semibold text-on-surface font-mono">${o.distanceKm} กม.</p></div><div class="space-y-0.5"><span class="text-[11px] text-outline">สถานะค่าส่ง</span><p class="font-semibold text-primary">${o.deliveryFee ? TC.baht(o.deliveryFee) : esc(o.deliveryNote || 'ฟรี')}</p></div></div></div>` : ''}
<div class="p-3.5 rounded-xl bg-surface-container-low flex items-start gap-2.5"><span class="material-symbols-outlined text-tertiary text-lg shrink-0 mt-0.5">ac_unit</span><div class="space-y-0.5 text-xs"><span class="font-semibold text-on-surface">มาตรฐานการควบคุมคุณภาพยา (GPP)</span><p class="text-on-surface-variant leading-relaxed text-[11px]">ยาถูกบรรจุในกระเป๋าควบคุมอุณหภูมิ 20-25°C มิดชิด ป้องกันแสงแดดและความชื้นตลอดการเดินทาง</p></div></div>
<a class="block text-center py-2.5 rounded-xl bg-primary-fixed text-on-primary-fixed font-semibold text-xs hover:bg-primary-container transition-colors" href="/orders?id=${esc(o.id)}">ดูรายละเอียดคำสั่งซื้อ #${esc(o.id)}</a></div>`;
  }

  function nearbyTpl(p) {
    const selected = S.selected && S.selected.id === p.id;
    return `<div class="bg-surface-container-lowest rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4 ${selected ? 'ring-2 ring-primary/50' : ''} ${p.openNow ? '' : 'opacity-75'}">
<div class="space-y-3"><div class="flex items-start justify-between gap-2"><div><span class="px-2 py-0.5 rounded bg-surface-container ${p.open24 ? 'text-tertiary' : p.openNow ? 'text-on-surface-variant' : 'text-error'} text-[10px] font-semibold">${p.open24 ? 'เปิด 24 ชม.' : p.openNow ? `ปิด ${esc(p.closeTime)} น.` : `ปิดอยู่ • เปิด ${esc(p.openTime)} น.`}</span>
<h3 class="font-headline font-semibold text-base text-on-surface mt-1.5">${esc(p.name)}</h3><p class="text-xs text-outline mt-0.5">${esc(p.address)}</p></div><span class="text-xs font-bold text-primary shrink-0 font-mono">${dist(p.distanceKm)}</span></div>
<div class="space-y-1.5 text-xs text-on-surface-variant"><div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-primary text-sm">${p.hasDoctor ? 'stethoscope' : 'person_check'}</span><span>${p.hasDoctor ? 'แพทย์เฉพาะทางอายุรกรรมประจำอยู่' : `${esc(p.pharmacist.name)} (พร้อมวิดีโอคอล)`}</span></div>
<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-outline text-sm">electric_moped</span><span>จัดส่งเฉลี่ย ${p.deliveryMins} นาที</span></div></div></div>
<div class="flex items-center gap-2 pt-2 border-t border-surface-container"><button class="flex-1 py-2 px-3 ${selected ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'} font-semibold text-xs rounded-xl transition-colors" data-select="${esc(p.id)}" type="button">${selected ? 'จุดบริการที่เลือกอยู่' : 'เลือกจุดบริการนี้'}</button>
<a class="p-2 rounded-xl bg-surface-container text-on-surface-variant hover:text-primary transition-colors" href="tel:${esc(p.phone)}" title="โทรด่วน"><span class="material-symbols-outlined text-base">call</span></a></div></div>`;
  }

  // ---------------------------------------------------------------- rendering
  function paintChips() {
    $$('.ph-chip').forEach((b) => {
      const on = S.filters.has(b.dataset.filter);
      b.classList.toggle('bg-primary', on); b.classList.toggle('text-on-primary', on); b.classList.toggle('shadow-sm', on);
      b.classList.toggle('bg-surface-container', !on); b.classList.toggle('text-on-surface', !on);
    });
  }

  function renderMain() {
    const p = S.selected;
    if (!p) { $('#ph-main').innerHTML = '<div class="p-10 rounded-2xl bg-surface-container-lowest text-center text-sm text-outline">ไม่พบร้านยา</div>'; return; }
    $('#ph-main').innerHTML = mainTpl(p);
    const orderHere = S.orders.find((o) => o.pharmacyId === p.id);
    $('#ph-rx').innerHTML = rxTpl(orderHere, p);
    const active = S.orders.find((o) => o.status.active && o.pharmacyId === p.id) || S.orders.find((o) => o.status.active);
    $('#ph-delivery').innerHTML = deliveryTpl(active || null);
  }

  function renderNearby() {
    const searching = S.q || S.filters.size;
    const list = searching ? S.list : S.list.filter((p) => !S.selected || p.id !== S.selected.id);
    $('#nearby-title').textContent = searching ? `ผลการค้นหาจุดบริการ (${S.list.length} แห่ง)` : 'ร้านยาและคลินิกใกล้เคียงสำรองในพื้นที่';
    const shown = S.showAll || searching ? list : list.slice(0, 3);
    $('#nearby-grid').innerHTML = shown.length ? shown.map(nearbyTpl).join('')
      : '<div class="md:col-span-3 p-8 rounded-2xl bg-surface-container-lowest text-center text-sm text-on-surface-variant">ไม่พบร้านยาที่ตรงกับเงื่อนไข <button class="text-primary font-semibold hover:underline" data-clear type="button">ล้างตัวกรอง</button></div>';
    $('#nearby-toggle').classList.toggle('hidden', Boolean(searching) || list.length <= 3);
    $('#nearby-toggle-text').textContent = S.showAll ? 'แสดงน้อยลง' : `ดูทั้งหมด ${list.length} ร้าน`;
  }

  async function loadList() {
    paintChips();
    const params = new URLSearchParams();
    if (S.q) params.set('q', S.q);
    if (S.filters.size) params.set('filters', [...S.filters].join(','));
    const d = await TC.get(`/api/pharmacies?${params}`);
    S.list = d.pharmacies;
    renderNearby();
  }

  async function loadOrders() {
    if (!TC.state.user) return;
    const d = await TC.get('/api/orders').catch(() => ({ orders: [] }));
    S.orders = d.orders;
  }

  async function select(id, { persist = false } = {}) {
    const d = await TC.get(`/api/pharmacies/${encodeURIComponent(id)}`);
    S.selected = d.pharmacy;
    renderMain();
    renderNearby();
    history.replaceState(null, '', `/pharmacies?id=${encodeURIComponent(id)}`);
    if (persist && TC.state.user) {
      await TC.api('PUT', '/api/me/pharmacy', { pharmacyId: id }).catch(TC.handle);
      TC.toast(`เปลี่ยนไปเชื่อมต่อกับ ${S.selected.name} สำเร็จ`, 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ---------------------------------------------------------------- OTC ordering
  function otcModal(preselect) {
    if (!TC.requireLogin('เข้าสู่ระบบเพื่อสั่งซื้อยา')) return;
    const p = S.selected;
    const otc = S.meds.filter((m) => !m.controlled && !m.chronic);
    const cart = {};
    if (preselect && otc.some((m) => m.id === preselect)) cart[preselect] = 1;
    const m = TC.modal({ title: `สั่งยาสามัญประจำบ้าน • ${p.shortName || p.name}`, icon: 'add_shopping_cart', size: 'max-w-xl', body: '' });
    const draw = () => {
      const items = otc.filter((x) => cart[x.id]);
      const subtotal = items.reduce((s, x) => s + x.price * cart[x.id], 0);
      m.body.innerHTML = `<div class="space-y-2">${otc.map((x) => `<div class="p-3 rounded-xl bg-surface-container-low flex items-center gap-3"><span class="material-symbols-outlined text-primary">${esc(x.icon)}</span><div class="flex-1 min-w-0"><div class="text-xs font-semibold text-on-surface">${esc(x.name)}</div><div class="text-[11px] text-outline truncate">${esc(x.thai)} • ${esc(x.unit)}</div></div><span class="text-xs font-mono font-semibold">${TC.baht(x.price)}</span>
        <div class="flex items-center gap-1"><button class="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high text-sm" data-dec="${x.id}" type="button">−</button><span class="w-6 text-center text-xs font-bold">${cart[x.id] || 0}</span><button class="w-7 h-7 rounded-lg bg-primary text-on-primary text-sm" data-inc="${x.id}" type="button">+</button></div></div>`).join('')}</div>
        <p class="text-[11px] text-outline mt-3 flex items-start gap-1"><span class="material-symbols-outlined text-sm">info</span>ยาควบคุมและยาที่ต้องใช้ใบสั่งแพทย์ ต้องผ่านการปรึกษาเภสัชกรหรือแพทย์ก่อน</p>
        <div class="mt-4 flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container"><span class="text-xs">รวม ${items.length} รายการ • <b class="text-primary">${TC.baht(subtotal)}</b></span><button ${items.length ? '' : 'disabled'} class="${TC.btnPrimary}" data-checkout type="button">ดำเนินการสั่งซื้อ</button></div>`;
      m.body.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { cart[b.dataset.inc] = Math.min(10, (cart[b.dataset.inc] || 0) + 1); draw(); });
      m.body.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => { cart[b.dataset.dec] = Math.max(0, (cart[b.dataset.dec] || 0) - 1); draw(); });
      const co = m.body.querySelector('[data-checkout]');
      if (co) co.onclick = async () => {
        m.close();
        const member = TC.state.user.isMember;
        const discount = member ? Math.round(subtotal * 0.15) : 0;
        const fee = 0; // free delivery for everyone
        const total = subtotal - discount + fee;
        const order = await TC.checkout({
          title: 'ยืนยันคำสั่งซื้อยา', amount: total, allowCod: true, submitLabel: 'ยืนยันสั่งซื้อ',
          lines: [...items.map((x) => ({ label: `${x.name} × ${cart[x.id]}`, value: TC.baht(x.price * cart[x.id]) })), ...(discount ? [{ label: 'ส่วนลดสมาชิก Terra Care+ (15%)', value: `-${TC.baht(discount)}`, accent: true }] : []),
            { label: 'ค่าจัดส่งด่วน', value: fee ? TC.baht(fee) : 'ฟรี', accent: !fee }, { label: 'จัดส่งไปที่', value: (TC.state.user.address || TC.state.user.location || {}).label || '-' }],
          submit: async (payment) => (await TC.post('/api/orders', { items: items.map((x) => ({ medId: x.id, qty: cart[x.id] })), pharmacyId: p.id, payment })).order,
        });
        if (order) { TC.toast(`สั่งซื้อสำเร็จ #${order.id}`, 'success'); location.href = `/orders?id=${order.id}`; }
      };
    };
    draw();
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-select],[data-consult],[data-otc],[data-clear]');
    if (!t || !t.closest('main')) return;
    if (t.dataset.select) return select(t.dataset.select, { persist: true }).catch(TC.handle);
    if (t.dataset.otc != null) return otcModal();
    if (t.dataset.clear != null) { S.q = ''; S.filters.clear(); $('#ph-search').value = ''; return loadList().catch(TC.handle); }
    const p = S.selected;
    TC.startConsultation({ providerType: 'pharmacist', pharmacyId: p.id, mode: t.dataset.consult, providerName: `${p.pharmacist.name} • ${p.shortName || p.name}` });
  });
  $$('.ph-chip').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.filter;
    if (S.filters.has(f)) S.filters.delete(f); else S.filters.add(f);
    loadList().catch(TC.handle);
  }));
  const doSearch = () => { S.q = $('#ph-search').value.trim(); loadList().then(() => { if (S.list[0] && S.q) select(S.list[0].id); }).catch(TC.handle); };
  $('#ph-search-btn').onclick = doSearch;
  $('#ph-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  $('#nearby-toggle').onclick = () => { S.showAll = !S.showAll; renderNearby(); };
  $('#loc-change').onclick = async () => {
    const loc = await TC.locationModal();
    if (!loc) return;
    $('#loc-label').textContent = loc.label;
    await loadList();
    if (S.selected) select(S.selected.id).catch(TC.handle);
  };
  TC.on('order', () => loadOrders().then(renderMain));

  // ---------------------------------------------------------------- boot
  (async () => {
    const user = await TC.ready;
    $('#loc-label').textContent = (user && user.location ? user.location.label : 'ซอยอารีย์ 1, พญาไท, กรุงเทพฯ');
    $('#ph-search').value = S.q;
    const [, , meds] = await Promise.all([loadList(), loadOrders(), TC.get('/api/medicines')]);
    S.meds = meds.medicines;
    const id = TC.qs('id') || (user && user.preferredPharmacyId) || (S.list.find((p) => p.openNow) || S.list[0] || {}).id;
    if (id) await select(id);
    const med = TC.qs('med');
    if (med) {
      const m = S.meds.find((x) => x.id === med);
      if (m && (m.controlled || m.chronic)) TC.info(m.name, `<p class="text-sm text-on-surface-variant">${esc(m.name)} (${esc(m.thai)}) ต้องใช้ใบสั่งยา กรุณาปรึกษาเภสัชกรหรือแพทย์ก่อน ระบบจะออกใบสั่งยาและจัดส่งให้หลังการปรึกษา</p>`, 'prescriptions');
      else setTimeout(() => otcModal(med), 300);
    }
    setInterval(() => { if (S.orders.some((o) => o.status.active)) loadOrders().then(renderMain); }, 30000);
  })().catch(TC.handle);
})();
