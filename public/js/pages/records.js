/* Medical records, prescriptions, medication schedule and health trends */
(function () {
  'use strict';
  const { $, esc } = TC;
  const S = { user: null, meds: null, records: [], orders: [], consults: [], appts: [], vitals: [], tab: 'all', pharmacy: null };
  const SLOTS = [
    { key: 'morning', label: 'เช้า (หลังอาหาร 08:00 น.)', icon: 'wb_sunny', color: 'text-tertiary' },
    { key: 'noon', label: 'กลางวัน (หลังอาหาร 12:30 น.)', icon: 'light_mode', color: 'text-outline' },
    { key: 'evening', label: 'เย็น (หลังอาหาร 19:00 น.)', icon: 'dark_mode', color: 'text-secondary' },
    { key: 'bedtime', label: 'ก่อนนอน (21:30 น.)', icon: 'bedtime', color: 'text-secondary' },
  ];

  // ---------------------------------------------------------------- refill banner
  function renderRefill() {
    const list = S.meds.refill;
    if (!list.length) { $('#refill-banner').innerHTML = ''; return; }
    const m = list[0];
    const names = list.map((x) => x.name).join(', ');
    $('#refill-banner').innerHTML = `<section class="relative overflow-hidden rounded-xl bg-tertiary-fixed text-on-tertiary-fixed p-5 sm:p-6 shadow-sm animate-fade-in"><div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4"><div class="flex items-start gap-4">
<div class="p-2.5 bg-tertiary-container/60 text-on-tertiary-container rounded-xl shrink-0 flex items-center justify-center"><span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">notifications_active</span></div>
<div class="space-y-1"><div class="flex items-center gap-2"><span class="text-xs uppercase tracking-wider font-semibold text-tertiary">การแจ้งเตือนเภสัชกรรมต่อเนื่อง</span><span class="w-1.5 h-1.5 rounded-full bg-error"></span><span class="text-xs font-medium text-error">${m.daysLeft > 0 ? `เหลือ ${m.daysLeft} วันสุดท้าย` : 'ยาหมดแล้ว'}</span></div>
<h2 class="font-headline text-lg sm:text-xl font-bold tracking-tight text-on-surface">${esc(m.purpose === 'ควบคุมความดัน' ? 'ยาความดันโลหิตของคุณ' : 'ยาประจำตัวของคุณ')} (${esc(names)}) ใกล้หมดรอบนี้</h2>
<p class="text-xs sm:text-sm text-on-surface-variant max-w-2xl leading-relaxed">ต้องการให้เภสัชกรเครือข่ายโทรตรวจสอบอาการปัจจุบัน และประสานร้านยาใกล้บ้านเพื่อจัดส่งรอบใหม่โดยไม่ต้องรอคิวหรือไม่?</p></div></div>
<div class="flex items-center gap-3 shrink-0 self-end md:self-center"><button class="px-3.5 py-2 text-xs font-semibold text-on-tertiary-fixed-variant hover:text-on-surface transition-colors" id="refill-later" type="button">เตือนภายหลัง</button>
<button class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs sm:text-sm font-semibold shadow-sm hover:bg-primary/90 transition-all" id="refill-confirm-btn" type="button"><span class="material-symbols-outlined text-base">local_shipping</span><span>ยืนยันการจัดส่งรอบใหม่</span></button></div></div>
<div class="absolute -right-8 -bottom-8 w-44 h-44 bg-tertiary-container/20 rounded-full blur-2xl pointer-events-none"></div></section>`;
    $('#refill-later').onclick = async () => { await TC.post('/api/medications/snooze').catch(TC.handle); $('#refill-banner').innerHTML = ''; TC.toast('จะเตือนอีกครั้งในวันพรุ่งนี้', 'info'); };
    $('#refill-confirm-btn').onclick = () => refill(list);
  }

  async function refill(list) {
    const { medicines } = await TC.get('/api/medicines');
    const items = list.map((m) => medicines.find((x) => x.id === m.medId)).filter(Boolean);
    const subtotal = items.reduce((s, x) => s + x.price, 0);
    const member = S.user.isMember;
    const discount = member ? Math.round(subtotal * 0.15) : 0;
    const fee = member || subtotal >= 200 ? 0 : 30;
    const pharmacy = S.pharmacy;
    const order = await TC.checkout({
      title: 'ยืนยันการจัดส่งยารอบใหม่', amount: subtotal - discount + fee, allowCod: true, submitLabel: 'ยืนยันการจัดส่ง',
      lines: [...items.map((x) => ({ label: `${x.name} (${x.unit})`, value: TC.baht(x.price) })), ...(discount ? [{ label: 'ส่วนลดสมาชิก (15%)', value: `-${TC.baht(discount)}`, accent: true }] : []),
        { label: 'ค่าจัดส่ง', value: fee ? TC.baht(fee) : 'ฟรี', accent: !fee }, { label: 'ร้านยา', value: pharmacy ? pharmacy.name : 'ร้านยาใกล้บ้าน' }],
      submit: async (payment) => (await TC.post('/api/medications/refill', { payment, pharmacyId: pharmacy && pharmacy.id })).order,
    });
    if (order) { TC.toast(`ส่งคำขอสำเร็จ เภสัชกรกำลังตรวจสอบ • #${order.id}`, 'success'); load(); }
  }

  // ---------------------------------------------------------------- patient header
  function renderHeader() {
    const u = S.user;
    const age = u.age ? `${u.age.years} ปี ${u.age.months} เดือน` : 'ไม่ระบุ';
    const allergies = (u.allergies || []).map((a) => a.name).join(', ');
    $('#patient-header').innerHTML = `<header class="bg-surface-container-lowest rounded-xl p-6 sm:p-8 shadow-sm"><div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6"><div class="flex flex-col sm:flex-row sm:items-center gap-5">
<div class="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 shadow-sm"><img alt="${esc(u.name)}" class="w-full h-full object-cover" src="${esc(TC.avatar(u.avatar, u.name))}"/><span class="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-primary ring-2 ring-surface-container-lowest" title="ใช้งานล่าสุดในระบบ"></span></div>
<div class="space-y-2"><div class="flex flex-wrap items-center gap-2.5"><h1 class="font-headline text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">คุณ${esc(u.name)}</h1><span class="px-2.5 py-1 rounded-lg bg-surface-container text-xs font-mono font-medium text-on-surface-variant">HN: ${esc(u.hn || '-')}</span>
${u.insurance || u.isMember ? `<span class="px-2.5 py-1 rounded-lg bg-primary-fixed text-on-primary-fixed-variant text-xs font-medium flex items-center gap-1"><span class="material-symbols-outlined text-sm">verified_user</span> ${esc(u.isMember ? `${u.insurance ? u.insurance + ' • ' : ''}Terra Care+` : u.insurance)}</span>` : ''}</div>
<p class="text-xs text-on-surface-variant flex flex-wrap items-center gap-3"><span>อายุ: ${esc(age)}</span><span class="w-1 h-1 rounded-full bg-outline-variant"></span><span>เพศ: ${esc(u.gender || 'ไม่ระบุ')}</span><span class="w-1 h-1 rounded-full bg-outline-variant"></span><span>ปรับปรุงล่าสุด: ${esc(TC.when(u.updatedAt || u.createdAt))}</span></p>
<div class="flex flex-wrap items-center gap-2 pt-1"><span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container text-xs font-medium text-on-surface"><span class="material-symbols-outlined text-sm text-tertiary">bloodtype</span>กรุ๊ปเลือด ${esc(u.bloodType || 'ไม่ทราบ')}</span>
${allergies ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-error-container text-error text-xs font-bold shadow-[0_2px_8px_rgba(184,50,48,0.12)]"><span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">warning</span>แพ้ยา: ${esc(allergies)}</span>` : '<button class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container text-xs font-medium text-on-surface-variant hover:bg-surface-container-high" data-edit-profile type="button"><span class="material-symbols-outlined text-sm">add</span>เพิ่มประวัติแพ้ยา</button>'}
${(u.conditions || []).length ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container text-xs font-medium text-on-surface"><span class="material-symbols-outlined text-sm text-primary">favorite</span>โรคประจำตัว: ${esc(u.conditions.join(', '))}</span>` : ''}
<button class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-primary font-semibold hover:bg-surface-container" data-edit-profile type="button"><span class="material-symbols-outlined text-sm">edit</span>แก้ไข</button></div></div></div>
<div class="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 self-start lg:self-center"><button class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container text-on-surface text-xs sm:text-sm font-semibold hover:bg-surface-container-high transition-colors" id="btn-card" type="button"><span class="material-symbols-outlined text-lg text-primary">qr_code_2</span><span>บัตรประจำตัวผู้ป่วย</span></button>
<button class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs sm:text-sm font-semibold shadow-sm hover:bg-primary/90 transition-all" id="btn-upload" type="button"><span class="material-symbols-outlined text-lg">add_a_photo</span><span>+ อัปโหลดผลตรวจ/ใบสั่งยาเดิม</span></button></div></div></header>`;
    $('#btn-card').onclick = patientCard;
    $('#btn-upload').onclick = uploadModal;
  }

  function patientCard() {
    const u = S.user;
    const m = TC.modal({
      title: 'บัตรประจำตัวผู้ป่วย', icon: 'qr_code_2',
      body: `<div class="rounded-2xl bg-gradient-to-br from-primary to-primary-container text-on-primary p-5 space-y-3 shadow-md"><div class="flex items-center justify-between"><span class="font-headline font-bold">TeleCare Terra</span><span class="text-[11px] opacity-90">PATIENT ID</span></div>
        <div class="flex items-center gap-4"><div class="bg-white p-2 rounded-xl" data-qr></div><div class="space-y-1 text-xs"><div class="text-base font-bold">${esc(u.name)}</div><div>HN ${esc(u.hn || '-')}</div><div>กรุ๊ปเลือด ${esc(u.bloodType || '-')}</div>${(u.allergies || []).length ? `<div class="font-bold text-tertiary-fixed">แพ้ยา: ${esc(u.allergies.map((a) => a.name).join(', '))}</div>` : ''}</div></div></div>
        <p class="text-[11px] text-outline mt-3">แสดง QR นี้ที่ร้านยาหรือคลินิกเครือข่าย เพื่อให้เภสัชกรตรวจสอบประวัติแพ้ยาและรับยาตามใบสั่ง</p>`,
      actions: [{ label: 'พิมพ์บัตร', onClick: () => { window.print(); return false; } }, { label: 'ปิด', primary: true }],
    });
    TC.loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(() => {
      new window.QRCode(m.el.querySelector('[data-qr]'), { text: `TELECARE-TERRA|HN:${u.hn}|${u.name}|BLOOD:${u.bloodType || '-'}|ALLERGY:${(u.allergies || []).map((a) => a.name).join(';')}`, width: 104, height: 104, correctLevel: window.QRCode.CorrectLevel.M });
    }).catch(() => {});
  }

  function uploadModal() {
    let file = null;
    const m = TC.modal({
      title: 'อัปโหลดผลตรวจ / ใบสั่งยาเดิม', icon: 'add_a_photo',
      body: `<div class="space-y-3"><div class="space-y-1"><label class="${TC.labelCls}">ประเภทเอกสาร</label><select class="${TC.inputCls}" data-cat><option>ผลตรวจทางห้องปฏิบัติการ</option><option>ใบสั่งยาเดิม</option><option>ผลตรวจ ATK</option><option>ใบรับรองแพทย์</option><option>อื่นๆ</option></select></div>
        <div class="space-y-1"><label class="${TC.labelCls}">ชื่อเอกสาร</label><input class="${TC.inputCls}" data-title placeholder="เช่น ผลตรวจเลือดประจำปี 2567"/></div>
        <div class="p-6 rounded-xl bg-surface-container-low border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-surface-container transition-colors text-center" data-drop><span class="material-symbols-outlined text-3xl text-primary">cloud_upload</span><span class="text-xs font-semibold text-on-surface">แตะเพื่อถ่ายภาพ หรือเลือกไฟล์</span><span class="text-[10px] text-outline">รองรับ JPG, PNG, PDF สูงสุด 10MB</span></div>
        <textarea class="${TC.inputCls} min-h-[60px]" data-note placeholder="หมายเหตุ (ถ้ามี)"></textarea></div>`,
      actions: [{ label: 'ยกเลิก' }, {
        label: 'อัปโหลด', primary: true, busyText: 'กำลังอัปโหลด...', onClick: async (mm) => {
          if (!file) { TC.toast('กรุณาเลือกไฟล์', 'error'); return false; }
          const dataUrl = file.type.startsWith('image/') ? await TC.compressImage(file) : await TC.fileToDataUrl(file);
          await TC.post('/api/records/upload', { dataUrl, fileName: file.name, title: mm.el.querySelector('[data-title]').value || mm.el.querySelector('[data-cat]').value, category: mm.el.querySelector('[data-cat]').value, note: mm.el.querySelector('[data-note]').value });
          TC.toast('อัปโหลดเอกสารเข้าสู่เวชระเบียนแล้ว', 'success');
          load();
        },
      }],
    });
    const drop = m.el.querySelector('[data-drop]');
    drop.onclick = async () => {
      file = await TC.pickFile('image/*,application/pdf');
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { file = null; return TC.toast('ไฟล์ใหญ่เกิน 10MB', 'error'); }
      drop.innerHTML = file.type.startsWith('image/') ? `<img alt="" class="max-h-40 rounded-lg" src="${URL.createObjectURL(file)}"/><span class="text-[11px] text-outline">${esc(file.name)}</span>` : `<span class="material-symbols-outlined text-3xl text-primary">description</span><span class="text-xs">${esc(file.name)}</span>`;
      const t = m.el.querySelector('[data-title]');
      if (!t.value) t.value = file.name.replace(/\.[^.]+$/, '');
    };
  }

  // ---------------------------------------------------------------- bento
  function renderBento() {
    const meds = S.meds.medications.slice().sort((a, b) => a.time.localeCompare(b.time));
    const taken = meds.filter((m) => m.takenAt).length;
    const nowHm = TC.time(Date.now());
    const next = meds.find((m) => !m.takenAt && m.time >= nowHm) || meds.find((m) => !m.takenAt);
    const pill = (m) => `<label class="flex items-center justify-between p-3 rounded-xl bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors"><div class="flex items-center gap-3"><input ${m.takenAt ? 'checked' : ''} class="w-4 h-4 rounded text-primary focus:ring-primary accent-primary" data-intake="${m.id}" type="checkbox"/>
<div><div class="text-xs font-semibold ${m.takenAt ? 'line-through text-outline' : 'text-on-surface'}">${esc(m.name)} (${esc(m.dose)})</div><div class="text-[11px] ${m.takenAt ? 'text-outline' : 'text-on-surface-variant'}">${esc(SLOTS.find((s) => s.key === m.slot)?.label.split(' (')[0] || '')} (${esc(m.note || 'หลังอาหาร')} ${esc(m.time)} น.)${m.takenAt ? ` • รับประทานแล้วเมื่อ ${TC.time(m.takenAt)}` : m.chronic ? '' : ` • อีก ${m.daysLeft} วัน`}</div></div></div>
${m.takenAt ? '<span class="material-symbols-outlined text-primary text-sm">check_circle</span>' : '<span class="text-[11px] font-semibold text-tertiary bg-tertiary-fixed px-2 py-0.5 rounded">รอทาน</span>'}</label>`;
    const card1 = `<div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between"><div><div class="flex items-center justify-between mb-4"><div class="flex items-center gap-2"><span class="p-2 rounded-xl bg-primary-fixed text-primary flex items-center justify-center"><span class="material-symbols-outlined text-xl">medication</span></span>
<div><h3 class="font-headline text-base font-bold text-on-surface">ยาที่ต้องทานวันนี้</h3><span class="text-xs text-on-surface-variant">ประจำวันที่ ${esc(S.meds.dateLabel)}</span></div></div><span class="px-2.5 py-1 rounded-full bg-surface-container text-xs font-semibold text-primary" id="tracker-counter">${taken} จาก ${meds.length} ครบแล้ว</span></div>
<div class="space-y-3 pt-1" id="pill-checklist-widget">${meds.length ? meds.map(pill).join('') : '<div class="p-4 rounded-xl bg-surface-container-low text-xs text-outline text-center">ไม่มีรายการยาที่ต้องทานวันนี้</div>'}</div></div>
<div class="mt-4 pt-3 flex items-center justify-between text-xs text-on-surface-variant"><span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm text-primary">schedule</span>${next ? `รอบถัดไป: ${esc(next.time)} น.` : meds.length ? 'ทานยาครบทุกมื้อแล้ว' : '-'}</span><a class="text-primary font-semibold hover:underline" href="#med-schedule">ดูตารางเวลาทั้งหมด →</a></div></div>`;

    const c = S.consults[0];
    const card2 = c ? `<div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between"><div><div class="flex items-center justify-between mb-4"><div class="flex items-center gap-2"><span class="p-2 rounded-xl bg-secondary-container text-secondary flex items-center justify-center"><span class="material-symbols-outlined text-xl">support_agent</span></span>
<div><h3 class="font-headline text-base font-bold text-on-surface">การปรึกษาล่าสุด</h3><span class="text-xs text-on-surface-variant">${esc(TC.when(c.startedAt))}${c.endedAt ? ` (${Math.max(1, Math.round((c.endedAt - c.startedAt) / 60000))} นาที)` : ''}</span></div></div><span class="px-2.5 py-1 rounded-full ${c.status === 'active' ? 'bg-primary text-on-primary' : 'bg-primary-fixed text-on-primary-fixed-variant'} text-xs font-medium">${c.status === 'active' ? 'กำลังสนทนา' : 'ออนไลน์'}</span></div>
<div class="p-4 rounded-xl bg-surface-container-low space-y-3"><div class="flex items-center gap-3"><img alt="${esc(c.provider.name)}" class="w-11 h-11 rounded-full object-cover" src="${esc(TC.avatar(c.provider.photo, c.provider.name))}"/><div><h4 class="text-xs font-bold text-on-surface">${esc(c.provider.name)}</h4><p class="text-[11px] text-on-surface-variant">${esc(c.provider.title)} (${esc(c.provider.hospital)})</p></div></div>
<p class="text-xs text-on-surface-variant leading-relaxed bg-surface-container-lowest p-2.5 rounded-lg">"${esc(c.summary || c.complaint || 'ไม่มีบันทึกสรุป')}"</p></div></div>
<div class="mt-4 pt-3 flex items-center justify-between"><button class="text-xs text-primary font-semibold hover:underline flex items-center gap-1" data-followup type="button"><span class="material-symbols-outlined text-sm">chat</span> ${c.status === 'active' ? 'กลับไปที่ห้องสนทนา' : 'ส่งข้อความสอบถามเพิ่มเติม'}</button><a class="text-xs text-outline hover:text-on-surface transition-colors" href="/consult/${esc(c.id)}">สรุปการสนทนา</a></div></div>`
      : `<div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between"><div class="flex items-center gap-2 mb-4"><span class="p-2 rounded-xl bg-secondary-container text-secondary flex items-center justify-center"><span class="material-symbols-outlined text-xl">support_agent</span></span><h3 class="font-headline text-base font-bold text-on-surface">การปรึกษาล่าสุด</h3></div>
<p class="text-xs text-on-surface-variant leading-relaxed p-4 rounded-xl bg-surface-container-low">ยังไม่มีประวัติการปรึกษา เริ่มปรึกษาเภสัชกรฟรี หรือนัดพบแพทย์เฉพาะทางได้ทันที</p><div class="mt-4 grid grid-cols-2 gap-2"><a class="py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold text-center" href="/pharmacies">ปรึกษาเภสัชกร</a><a class="py-2 rounded-lg bg-surface-container text-xs font-semibold text-center" href="/doctors">พบแพทย์</a></div></div>`;

    const o = S.orders.find((x) => x.status.active);
    let card3;
    if (o) {
      const total = (o.status.etaAt - o.createdAt);
      const pct = Math.min(98, Math.max(4, Math.round(((Date.now() - o.createdAt) / total) * 100)));
      card3 = `<div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden"><div><div class="flex items-center justify-between mb-4"><div class="flex items-center gap-2"><span class="p-2 rounded-xl bg-primary text-on-primary flex items-center justify-center"><span class="material-symbols-outlined text-xl">two_wheeler</span></span>
<div><h3 class="font-headline text-base font-bold text-on-surface">ใบสั่งยาที่กำลังจัดส่ง</h3><span class="text-xs text-on-surface-variant">คำสั่งเลขที่ #${esc(o.id)}</span></div></div><span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-fixed text-primary text-xs font-bold animate-pulse"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span> ${o.status.stage === 'deliver' ? 'กำลังนำส่ง' : 'กำลังจัดยา'}</span></div>
<div class="space-y-3"><div class="flex items-baseline justify-between"><span class="text-xs text-on-surface-variant">เวลาคาดการณ์ส่งถึง:</span><span class="font-headline text-xl font-bold text-primary">อีก ~${o.status.remainingMins} นาที</span></div>
<div class="w-full bg-surface-container h-2 rounded-full overflow-hidden"><div class="bg-primary h-full rounded-full transition-all duration-700" style="width: ${pct}%;"></div></div>
<div class="p-3 rounded-xl bg-surface-container-low flex items-center justify-between text-xs"><div class="flex items-center gap-2.5"><span class="material-symbols-outlined text-base text-primary">storefront</span><div><div class="font-medium text-on-surface">${esc(o.pharmacy.name)}</div><div class="text-[11px] text-outline">ไรเดอร์: ${esc(o.rider ? `${o.rider.name} (${o.rider.plate.split(' ')[0]})` : 'กำลังจัดหา')}</div></div></div>
${o.rider ? `<a class="p-2 rounded-lg bg-surface-container hover:bg-surface text-primary" href="tel:${esc(o.rider.phone)}" title="โทรหาผู้จัดส่ง"><span class="material-symbols-outlined text-base">call</span></a>` : ''}</div></div></div>
<div class="mt-4 pt-3 flex items-center justify-between"><a class="w-full py-2 rounded-lg bg-primary-fixed text-on-primary-fixed font-semibold text-xs text-center hover:bg-primary-container transition-colors" href="/orders?id=${esc(o.id)}">ติดตามพิกัด GPS แบบสด</a></div></div>`;
    } else {
      const last = S.orders[0];
      card3 = `<div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between"><div><div class="flex items-center gap-2 mb-4"><span class="p-2 rounded-xl bg-surface-container text-primary flex items-center justify-center"><span class="material-symbols-outlined text-xl">two_wheeler</span></span><div><h3 class="font-headline text-base font-bold text-on-surface">การจัดส่งยา</h3><span class="text-xs text-on-surface-variant">ไม่มีรายการที่กำลังจัดส่ง</span></div></div>
${last ? `<div class="p-3 rounded-xl bg-surface-container-low text-xs"><div class="font-semibold">ล่าสุด #${esc(last.id)}</div><div class="text-[11px] text-outline">${esc(last.status.label)} • ${esc(TC.date(last.createdAt))}</div></div>` : '<p class="text-xs text-outline">ยังไม่มีประวัติคำสั่งซื้อ</p>'}</div>
<a class="mt-4 w-full py-2 rounded-lg bg-surface-container text-on-surface font-semibold text-xs text-center hover:bg-surface-container-high" href="/orders">ดูประวัติการจัดส่ง</a></div>`;
    }
    $('#bento').innerHTML = card1 + card2 + card3;
    const f = $('[data-followup]');
    if (f) f.onclick = () => {
      if (c.status === 'active') { location.href = `/consult/${c.id}`; return; }
      if (c.provider.kind === 'doctor') TC.bookAppointment(c.provider.id);
      else TC.startConsultation({ providerType: 'pharmacist', pharmacyId: c.provider.id, mode: 'chat', providerName: c.provider.name, complaint: `ติดตามผลจากการปรึกษา ${c.id}` });
    };
  }

  // ---------------------------------------------------------------- records list
  const tabOf = (r) => (r.kind === 'pharmacy' || (r.provider && r.provider.role === 'เภสัชกร') ? 'pharmacy' : r.kind === 'upload' ? 'upload' : 'doctor');
  function renderTabs() {
    const counts = { all: S.records.length, doctor: S.records.filter((r) => tabOf(r) === 'doctor').length, pharmacy: S.records.filter((r) => tabOf(r) === 'pharmacy').length, upload: S.records.filter((r) => tabOf(r) === 'upload').length };
    const tabs = [['all', `ทั้งหมด (${counts.all})`], ['doctor', 'ใบสั่งยาแพทย์'], ['pharmacy', 'บันทึกร้านยา'], ...(counts.upload ? [['upload', 'เอกสารอัปโหลด']] : [])];
    $('#record-tabs').innerHTML = tabs.map(([k, l]) => `<button class="px-3 py-1.5 rounded-lg ${S.tab === k ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}" data-tab="${k}" type="button">${l}</button>`).join('');
  }

  const medsGrid = (items) => (items && items.length ? `<div class="space-y-2.5 mb-5"><span class="text-xs font-semibold text-on-surface">รายการยาและเวชภัณฑ์ที่ได้รับ (${items.length} รายการ):</span><div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">${items.map((i, n) => `<div class="p-3 rounded-xl bg-surface-container text-xs space-y-1"><div class="font-semibold text-on-surface">${n + 1}. ${esc(i.name)}</div><div class="text-[11px] text-on-surface-variant">${esc(i.instructions || '')} (จำนวน ${esc(i.unit || '')})</div></div>`).join('')}</div></div>` : '');

  function recordCard(r) {
    const o = r.order;
    const date = `วันที่: ${TC.date(r.createdAt)} (${TC.time(r.createdAt)} น.)`;
    const providerLine = `${esc(date)} • ${esc(r.provider.role === 'เภสัชกร' ? 'เภสัชกร' : r.provider.role === 'แพทย์' ? 'แพทย์' : 'ผู้ดูแล')}: <span class="font-semibold text-on-surface">${esc(r.provider.name)}</span>${r.provider.license ? ` (${esc(r.provider.license)})` : ''}`;
    const chip = (text, strong) => `<span class="px-2.5 py-0.5 rounded-full ${strong ? 'bg-primary-fixed text-primary font-bold' : 'bg-surface-container text-on-surface-variant font-semibold'} text-[11px]">${esc(text)}</span>`;
    const head = (icon, iconCls, status) => `<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4"><div class="flex items-start gap-3.5"><div class="w-12 h-12 rounded-xl ${iconCls} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-2xl">${icon}</span></div>
<div><div class="flex flex-wrap items-center gap-2"><h3 class="font-headline text-lg font-bold text-on-surface">${esc(r.title)}</h3>${status}</div><p class="text-xs text-on-surface-variant mt-1">${providerLine}</p>${r.facility ? `<p class="text-xs text-outline mt-0.5">สถานพยาบาล / เครือข่าย: ${esc(r.facility)}</p>` : ''}</div></div><span class="text-xs font-mono text-outline shrink-0">#${esc(r.id)}</span></div>`;
    const orderStatus = o ? (o.status.active ? chip(`กำลังจัดส่ง - อีก ${o.status.remainingMins} นาที`, true) : o.status.stage === 'cancelled' ? chip('ยกเลิกคำสั่งซื้อ') : chip('ส่งถึงแล้ว • การรักษาเสร็จสมบูรณ์')) : chip('เสร็จสมบูรณ์');
    const certBtn = r.certificate ? `<a class="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors flex items-center gap-1.5" href="/print/certificate/${esc(r.id)}" target="_blank"><span class="material-symbols-outlined text-base">description</span><span>ดูใบรับรองแพทย์</span></a>` : '';
    const pdfBtn = (r.items || []).length ? `<a class="px-3.5 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm" href="/print/rx/${esc(r.id)}" target="_blank"><span class="material-symbols-outlined text-base">download</span><span>ดาวน์โหลด e-Prescription PDF</span></a>` : '';
    const refillBtn = (r.items || []).length && o ? `<button class="px-3.5 py-2 rounded-xl bg-primary-fixed text-on-primary-fixed-variant text-xs font-semibold hover:bg-primary-container transition-colors flex items-center gap-1.5" data-reorder="${esc(o.id)}" type="button"><span class="material-symbols-outlined text-base">autorenew</span><span>ขอเติมยาเดิม (Refill)</span></button>` : '';

    if (r.kind === 'upload') {
      return `<article class="bg-surface-container-lowest rounded-xl p-6 sm:p-7 shadow-sm transition-all hover:shadow-md">${head('description', 'bg-surface-container text-primary', chip(r.category || 'เอกสาร'))}
${r.summary ? `<p class="text-xs text-on-surface-variant mb-4 leading-relaxed">${esc(r.summary)}</p>` : ''}${r.fileMime && r.fileMime.startsWith('image/') ? `<a href="${esc(r.fileUrl)}" target="_blank"><img alt="${esc(r.title)}" class="max-h-48 rounded-xl mb-4" src="${esc(r.fileUrl)}"/></a>` : ''}
<div class="pt-2 flex justify-end"><a class="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold flex items-center gap-1.5" href="${esc(r.fileUrl)}" target="_blank"><span class="material-symbols-outlined text-base">open_in_new</span>เปิดไฟล์ ${esc(r.fileName || '')}</a></div></article>`;
    }
    if (r.kind === 'md') {
      const nextAppt = S.appts.find((a) => a.status === 'booked' && a.doctor && r.provider.name === a.doctor.name);
      return `<article class="bg-surface-container-lowest rounded-xl p-6 sm:p-7 shadow-sm transition-all hover:shadow-md">${head('stethoscope', 'bg-secondary-container text-secondary', orderStatus)}
<div class="my-4 p-4 rounded-xl bg-surface-container-low grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs"><div><span class="text-outline block mb-0.5">การวินิจฉัยหลัก (ICD-10):</span><span class="font-bold text-on-surface">${esc(r.diagnosis ? `${r.diagnosis}${r.icd ? ` (${r.icd})` : ''}` : r.complaint || '-')}</span></div>
<div><span class="text-outline block mb-0.5">${r.bp ? 'ความดันที่วัดได้ล่าสุด:' : 'ระยะเวลาปรึกษา:'}</span><span class="font-bold text-primary">${esc(r.bp || (r.durationMins ? `${r.durationMins} นาที` : '-'))}</span></div>
<div><span class="text-outline block mb-0.5">การนัดหมายครั้งต่อไป:</span><span class="font-bold text-on-surface">${nextAppt ? `${esc(nextAppt.dateLabel)} (${nextAppt.mode === 'video' ? 'นัดผ่านวิดีโอคอล' : 'แชท'})` : '<button class="text-primary hover:underline" data-book-doc="' + esc(r.provider.name) + '" type="button">นัดหมายติดตามผล</button>'}</span></div></div>
${r.summary ? `<p class="text-xs text-on-surface-variant mb-4 leading-relaxed">${esc(r.summary)}</p>` : ''}
${(r.items || []).length ? `<div class="p-3.5 rounded-xl bg-surface-container space-y-1.5 mb-5 text-xs">${r.items.map((i) => `<div class="flex items-center justify-between font-semibold text-on-surface"><span>ยา: ${esc(i.name)}</span><span class="text-primary font-mono">${esc(i.unit)}</span></div><p class="text-[11px] text-on-surface-variant">วิธีใช้: ${esc(i.instructions)}</p>`).join('')}</div>` : ''}
<div class="pt-4 flex flex-wrap items-center justify-between gap-3"><div class="flex items-center gap-1.5 text-xs text-outline"><span class="material-symbols-outlined text-sm text-primary">check_circle</span><span>${o && !o.status.active ? `จัดส่งสำเร็จเมื่อ ${esc(TC.date(o.status.deliveredAt || o.createdAt))} (รับยาเรียบร้อย)` : o ? 'กำลังจัดส่งยา' : 'บันทึกเข้าสู่เวชระเบียนแล้ว'}</span></div><div class="flex flex-wrap items-center gap-2">${certBtn}${refillBtn || pdfBtn}</div></div></article>`;
    }
    if (r.kind === 'pharmacy') {
      return `<article class="bg-surface-container-lowest rounded-xl p-6 sm:p-7 shadow-sm transition-all hover:shadow-md opacity-90 hover:opacity-100">${head('healing', 'bg-surface-container text-on-surface-variant', o && o.status.active ? orderStatus : chip('เสร็จสมบูรณ์'))}
<p class="text-xs text-on-surface-variant mb-4 leading-relaxed">${esc(r.summary || r.complaint || '-')}</p>
<div class="pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-outline"><span>สถานะ: ${esc(r.outcome || (o ? o.status.label : 'บันทึกการปรึกษาเรียบร้อย'))}</span><button class="text-primary hover:underline font-semibold flex items-center gap-1" data-detail="${esc(r.id)}" type="button"><span>ดูรายละเอียด</span><span class="material-symbols-outlined text-sm">chevron_right</span></button></div></article>`;
    }
    // rx
    return `<article class="bg-surface-container-lowest rounded-xl p-6 sm:p-7 shadow-sm transition-all hover:shadow-md">${head('prescriptions', 'bg-primary-fixed text-primary', orderStatus)}
${r.complaint ? `<div class="my-4 p-4 rounded-xl bg-surface-container-low space-y-2"><div class="flex items-center gap-2 text-xs font-semibold text-on-surface"><span class="material-symbols-outlined text-sm text-tertiary">clinical_notes</span><span>อาการเบื้องต้น &amp; ข้อมูลการซักประวัติ:</span></div><p class="text-xs text-on-surface-variant leading-relaxed">${esc(r.complaint)}</p></div>` : ''}
${medsGrid(r.items)}
<div class="pt-4 flex flex-wrap items-center justify-between gap-3"><div class="flex items-center gap-2 text-xs text-on-surface-variant"><span class="material-symbols-outlined text-sm text-primary">local_shipping</span><span>${o ? (o.status.active ? 'ส่งด่วนผ่าน Delivery Express โดยเภสัชกรควบคุมการจัดส่ง' : `จัดส่งสำเร็จ • ${esc(o.pharmacy.name)}`) : 'ยังไม่ได้สั่งจ่ายยา'}</span></div>
<div class="flex flex-wrap items-center gap-2">${o ? `<a class="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors flex items-center gap-1.5" href="/orders?id=${esc(o.id)}"><span class="material-symbols-outlined text-base">pin_drop</span><span>ดูรายละเอียดการจัดส่ง</span></a>` : ''}${certBtn}${pdfBtn}</div></div></article>`;
  }

  function renderRecords() {
    renderTabs();
    const list = S.records.filter((r) => S.tab === 'all' || tabOf(r) === S.tab);
    $('#record-list').innerHTML = list.length ? list.map(recordCard).join('') : '<div class="p-10 rounded-xl bg-surface-container-lowest text-center text-sm text-on-surface-variant">ยังไม่มีบันทึกในหมวดนี้</div>';
  }

  function detailModal(r) {
    TC.info(r.title, `<div class="space-y-3 text-xs"><div class="p-3 rounded-xl bg-surface-container-low">${esc(r.provider.name)} ${r.provider.license ? `(${esc(r.provider.license)})` : ''}<br><span class="text-outline">${esc(TC.when(r.createdAt))} • ${esc(r.facility || '')}</span></div>
      ${r.complaint ? `<div><b>อาการ:</b> ${esc(r.complaint)}</div>` : ''}${r.summary ? `<div><b>สรุป/คำแนะนำ:</b> ${esc(r.summary)}</div>` : ''}${r.outcome ? `<div><b>ผลการติดตาม:</b> ${esc(r.outcome)}</div>` : ''}
      ${(r.items || []).length ? `<div class="space-y-1.5">${r.items.map((i) => `<div class="p-2.5 rounded-lg bg-surface-container"><b>${esc(i.name)}</b><br><span class="text-on-surface-variant">${esc(i.instructions)}</span></div>`).join('')}</div><a class="inline-flex items-center gap-1 text-primary font-semibold" href="/print/rx/${esc(r.id)}" target="_blank"><span class="material-symbols-outlined text-sm">download</span>ดาวน์โหลดใบสั่งยา</a>` : ''}</div>`, 'clinical_notes');
  }

  // ---------------------------------------------------------------- schedule
  function renderSchedule() {
    const meds = S.meds.medications;
    const slot = (s) => {
      const list = meds.filter((m) => m.slot === s.key);
      if (!list.length) {
        if (s.key === 'bedtime') return '';
        return `<div class="p-4 rounded-xl bg-surface-container-low space-y-2 opacity-60"><div class="flex items-center justify-between"><span class="flex items-center gap-1.5 text-xs font-semibold text-on-surface"><span class="material-symbols-outlined text-base text-outline">${s.icon}</span>${s.label}</span><span class="text-[11px] text-outline">ไม่มีรายการยา</span></div><div class="text-xs text-outline italic text-center py-1">- ไม่มีมื้อยาในช่วงเวลานี้ -</div></div>`;
      }
      const all = list.every((m) => m.takenAt);
      return `<div class="p-4 rounded-xl bg-surface-container-low space-y-2"><div class="flex items-center justify-between"><span class="flex items-center gap-1.5 text-xs font-bold text-on-surface"><span class="material-symbols-outlined text-base ${s.color}">${s.icon}</span>${s.label}</span>
<span class="px-2 py-0.5 rounded text-[10px] font-bold ${all ? 'bg-primary text-on-primary' : 'bg-tertiary-fixed text-on-tertiary-fixed'}">${all ? 'ทานแล้ว' : 'รอทาน'}</span></div><div class="space-y-1.5">${list.map((m) => `<button class="w-full text-left p-2.5 rounded-lg bg-surface-container-lowest flex items-center justify-between text-xs" data-toggle="${m.id}" type="button"><div><div class="font-semibold text-on-surface">${esc(m.name)}</div><div class="text-[11px] ${m.takenAt ? 'text-outline' : 'text-on-surface-variant'}">${esc(m.purpose || '')} • ${esc(m.dose)}${m.note && m.note !== 'หลังอาหาร' ? ` (${esc(m.note)})` : ''}</div></div>
<span class="material-symbols-outlined ${m.takenAt ? 'text-primary' : 'text-outline'} text-lg">${m.takenAt ? 'check_circle' : 'radio_button_unchecked'}</span></button>`).join('')}</div></div>`;
    };
    $('#med-schedule').innerHTML = `<div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm space-y-5"><div class="flex items-center justify-between"><div><span class="text-[11px] font-semibold uppercase tracking-wider text-primary">Daily Routine</span><h3 class="font-headline text-lg font-bold text-on-surface">ตารางการทานยาประจำวัน</h3></div><div class="p-2 rounded-xl bg-surface-container text-primary"><span class="material-symbols-outlined text-xl">event_repeat</span></div></div>
<div class="space-y-4">${SLOTS.map(slot).join('')}</div>
<button class="w-full py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors flex items-center justify-center gap-1.5" id="btn-reminders" type="button"><span class="material-symbols-outlined text-base">alarm</span><span>ตั้งเวลาแจ้งเตือนเข้าสมาร์ตโฟน</span></button></div>`;
    $('#btn-reminders').onclick = remindersModal;
  }

  function remindersModal() {
    const supported = 'Notification' in window;
    TC.modal({
      title: 'ตั้งเวลาแจ้งเตือนการทานยา', icon: 'alarm',
      body: `<div class="space-y-3 text-xs"><a class="p-4 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-start gap-3" download href="/api/medications/reminders.ics"><span class="material-symbols-outlined text-primary text-2xl">calendar_add_on</span><span><b class="text-sm text-on-surface block">เพิ่มลงปฏิทินในสมาร์ตโฟน (แนะนำ)</b><span class="text-on-surface-variant">ดาวน์โหลดไฟล์ .ics แล้วเปิดด้วย Google Calendar / Apple Calendar ระบบจะแจ้งเตือนทุกวันตามเวลาทานยา แม้ไม่ได้เปิดเว็บไซต์</span></span></a>
        <button class="w-full text-left p-4 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-start gap-3" data-browser type="button"><span class="material-symbols-outlined text-primary text-2xl">notifications_active</span><span><b class="text-sm text-on-surface block">แจ้งเตือนผ่านเบราว์เซอร์</b><span class="text-on-surface-variant">${supported ? 'แสดงการแจ้งเตือนเมื่อถึงเวลาทานยา ขณะที่เปิดเว็บไซต์ไว้' : 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'}</span></span></button></div>`,
      actions: [{ label: 'ปิด', primary: true }],
    }).el.querySelector('[data-browser]').onclick = async () => {
      if (!supported) return;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return TC.toast('ไม่ได้รับอนุญาตให้แสดงการแจ้งเตือน', 'error');
      scheduleBrowserReminders(true);
    };
  }
  let reminderTimers = [];
  function scheduleBrowserReminders(announce) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !S.meds) return;
    reminderTimers.forEach(clearTimeout);
    reminderTimers = [];
    const nowHm = TC.time(Date.now());
    S.meds.medications.filter((m) => !m.takenAt && m.time > nowHm).forEach((m) => {
      const [h, mi] = m.time.split(':').map(Number);
      const [nh, nm] = nowHm.split(':').map(Number);
      const ms = ((h * 60 + mi) - (nh * 60 + nm)) * 60000;
      reminderTimers.push(setTimeout(() => new Notification('ถึงเวลาทานยา', { body: `${m.name} ${m.dose} • ${m.note || ''}`, icon: '/assets/logo.svg' }), ms));
    });
    if (announce) TC.toast(`ตั้งการแจ้งเตือนวันนี้แล้ว ${reminderTimers.length} รายการ`, 'success');
  }

  // ---------------------------------------------------------------- BP chart & pharmacy
  function renderBp() {
    const list = S.vitals.slice(-6);
    let chart = '<div class="h-28 flex items-center justify-center text-xs text-outline">ยังไม่มีข้อมูลความดัน กด "+ บันทึกค่า" เพื่อเริ่มติดตาม</div>';
    let avg = '-';
    let insight = 'บันทึกค่าความดันสม่ำเสมอเพื่อติดตามแนวโน้มสุขภาพ';
    if (list.length) {
      const sys = list.map((v) => v.systolic);
      const ys = (v) => 95 - ((Math.min(160, Math.max(100, v)) - 100) / 60) * 85; // 100..160 mmHg -> y 95..10
      const xs = (i) => (list.length === 1 ? 160 : 20 + (i * 280) / (list.length - 1));
      const pts = sys.map((v, i) => [xs(i), ys(v)]);
      const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} 95 L ${pts[0][0].toFixed(1)} 95 Z`;
      chart = `<svg aria-label="แผนภูมิแนวโน้มความดันโลหิต" class="w-full h-28 overflow-visible" viewBox="0 0 320 120">
<line class="text-outline-variant" stroke="currentColor" stroke-dasharray="3,3" stroke-width="1" x1="10" x2="310" y1="${ys(135)}" y2="${ys(135)}"></line><line class="text-outline-variant" stroke="currentColor" stroke-dasharray="3,3" stroke-width="1" x1="10" x2="310" y1="${ys(120)}" y2="${ys(120)}"></line>
<text class="text-[9px] text-outline" fill="currentColor" x="312" y="${ys(135) + 3}">135 max</text><text class="text-[9px] text-outline" fill="currentColor" x="312" y="${ys(120) + 3}">120 target</text>
<path class="text-primary/10" d="${area}" fill="currentColor"></path><path class="text-primary" d="${line}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"></path>
${pts.map((p, i) => `<circle class="${sys[i] > 135 ? 'text-error' : 'text-primary'}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" fill="currentColor" r="${i === pts.length - 1 ? 5 : 4}"><title>${list[i].systolic}/${list[i].diastolic} • ${TC.date(list[i].at)}</title></circle>`).join('')}
${pts.map((p, i) => `<text class="text-[10px] ${i === pts.length - 1 ? 'text-primary font-bold' : 'text-outline'}" fill="currentColor" text-anchor="middle" x="${p[0].toFixed(1)}" y="115">${esc(TC.date(list[i].at, { year: undefined }).replace(/ \d{4}$/, ''))} (${sys[i]})</text>`).join('')}</svg>`;
      const aS = Math.round(list.reduce((s, v) => s + v.systolic, 0) / list.length);
      const aD = Math.round(list.reduce((s, v) => s + v.diastolic, 0) / list.length);
      avg = `เฉลี่ย ${aS}/${aD}`;
      const last = list[list.length - 1];
      insight = last.systolic >= 140 || last.diastolic >= 90 ? 'ค่าล่าสุดสูงกว่าเกณฑ์ ควรวัดซ้ำและปรึกษาแพทย์หากยังสูงต่อเนื่อง' : last.systolic >= 130 ? 'ค่าความดันค่อนข้างสูง ควรลดเค็มและทานยาสม่ำเสมอ' : 'ระดับความดันอยู่ในเกณฑ์ปกติ ตอบสนองต่อการทานยาต่อเนื่องดีเยี่ยม';
    }
    $('#bp-box').innerHTML = `<div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm space-y-4"><div class="flex items-center justify-between gap-2"><div><span class="text-[11px] font-semibold uppercase tracking-wider text-primary">Biometric Insights</span><h3 class="font-headline text-base font-bold text-on-surface">แนวโน้มความดันโลหิต (${list.length || 0} ครั้งล่าสุด)</h3></div><div class="text-right"><span class="text-xs font-bold text-primary block">${avg}</span><button class="text-[11px] text-primary font-semibold hover:underline" id="add-bp" type="button">+ บันทึกค่า</button></div></div>
<div class="pt-2">${chart}</div><div class="p-3 rounded-xl bg-surface-container flex items-center gap-2.5 text-xs text-on-surface"><span class="material-symbols-outlined text-primary text-base">insights</span><span>${esc(insight)}</span></div></div>`;
    $('#add-bp').onclick = () => TC.modal({
      title: 'บันทึกค่าความดันโลหิต', icon: 'monitor_heart',
      body: `<div class="grid grid-cols-3 gap-2"><div class="space-y-1"><label class="text-[11px] text-outline">ตัวบน (SYS)</label><input class="${TC.inputCls}" data-s inputmode="numeric" placeholder="120"/></div><div class="space-y-1"><label class="text-[11px] text-outline">ตัวล่าง (DIA)</label><input class="${TC.inputCls}" data-d inputmode="numeric" placeholder="80"/></div><div class="space-y-1"><label class="text-[11px] text-outline">ชีพจร</label><input class="${TC.inputCls}" data-p inputmode="numeric" placeholder="72"/></div></div>`,
      actions: [{ label: 'ยกเลิก' }, { label: 'บันทึก', primary: true, onClick: async (m) => { await TC.post('/api/vitals', { systolic: m.el.querySelector('[data-s]').value, diastolic: m.el.querySelector('[data-d]').value, pulse: m.el.querySelector('[data-p]').value }); TC.toast('บันทึกค่าความดันแล้ว', 'success'); const v = await TC.get('/api/vitals?type=bp'); S.vitals = v.vitals; renderBp(); } }],
    });
  }

  function renderPharmacy() {
    const p = S.pharmacy;
    $('#pharmacy-box').innerHTML = `<div class="bg-surface-container-low rounded-xl p-6 space-y-4"><div class="flex items-center gap-3"><div class="p-2.5 rounded-xl bg-surface-container text-primary"><span class="material-symbols-outlined text-xl">home_health</span></div><div><h4 class="text-xs font-bold text-on-surface">ร้านยาประจำตัวของคุณ</h4><p class="text-[11px] text-on-surface-variant">${p ? `${esc(p.name)} (ห่าง ${p.distanceKm ?? '-'} กม.)` : 'ยังไม่ได้เลือกร้านยาประจำ'}</p></div></div>
<div class="text-xs text-on-surface-variant leading-relaxed">${p ? `มีบริการจัดส่งยาถึงบ้านภายใน ${p.deliveryMins} นาที และสามารถนำ e-Prescription ไปรับที่เคาน์เตอร์ได้ทันที` : 'เลือกร้านยาประจำเพื่อให้เภสัชกรติดตามประวัติการใช้ยาของคุณอย่างต่อเนื่อง'}</div>
<div class="flex items-center gap-2"><button class="w-full py-2 rounded-lg bg-surface-container hover:bg-surface text-on-surface text-xs font-semibold transition-colors" id="change-pharmacy" type="button">${p ? 'เปลี่ยนร้านยาประจำ' : 'เลือกร้านยาประจำ'}</button>${p ? `<a class="w-full py-2 rounded-lg bg-surface-container hover:bg-surface text-primary text-xs font-semibold transition-colors text-center" href="tel:${esc(p.phone)}">โทรหาร้านยา</a>` : ''}</div></div>`;
    $('#change-pharmacy').onclick = async () => {
      const np = await TC.pharmacyPicker({ title: 'เลือกร้านยาประจำตัว', current: p && p.id });
      if (!np) return;
      try { await TC.api('PUT', '/api/me/pharmacy', { pharmacyId: np.id }); S.pharmacy = np; renderPharmacy(); TC.toast(`ตั้ง ${np.name} เป็นร้านยาประจำแล้ว`, 'success'); } catch (e) { TC.handle(e); }
    };
  }

  // ---------------------------------------------------------------- events & load
  document.addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-intake]');
    if (!cb) return;
    try { await TC.post(`/api/medications/${cb.dataset.intake}/intake`, { taken: cb.checked }); await loadMeds(); } catch (err) { TC.handle(err); }
  });
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle],[data-tab],[data-reorder],[data-detail],[data-edit-profile],[data-book-doc]');
    if (!t) return;
    try {
      if (t.dataset.toggle) {
        const m = S.meds.medications.find((x) => x.id === t.dataset.toggle);
        await TC.post(`/api/medications/${m.id}/intake`, { taken: !m.takenAt });
        await loadMeds();
      } else if (t.dataset.tab) { S.tab = t.dataset.tab; renderRecords(); }
      else if (t.dataset.detail) detailModal(S.records.find((r) => r.id === t.dataset.detail));
      else if (t.dataset.editProfile != null) TC.profileModal();
      else if (t.dataset.bookDoc) { const { doctors } = await TC.get('/api/doctors'); const d = doctors.find((x) => x.name === t.dataset.bookDoc); if (d) TC.bookAppointment(d.id); else location.href = '/doctors'; }
      else if (t.dataset.reorder) {
        const o = S.orders.find((x) => x.id === t.dataset.reorder);
        const member = S.user.isMember;
        const sub = o.subtotal;
        const disc = member ? Math.round(sub * 0.15) : 0;
        const fee = member || sub >= 200 ? 0 : 30;
        const order = await TC.checkout({
          title: 'ขอเติมยาเดิม (Refill)', amount: sub - disc + fee, allowCod: true, submitLabel: 'ยืนยันสั่งซ้ำ',
          lines: [...o.items.map((i) => ({ label: i.name, value: TC.baht(i.price) })), ...(disc ? [{ label: 'ส่วนลดสมาชิก (15%)', value: `-${TC.baht(disc)}`, accent: true }] : []), { label: 'ค่าจัดส่ง', value: fee ? TC.baht(fee) : 'ฟรี', accent: !fee }],
          submit: async (payment) => (await TC.post(`/api/orders/${o.id}/reorder`, { payment })).order,
        });
        if (order) { TC.toast(`ส่งคำขอเติมยาแล้ว #${order.id}`, 'success'); load(); }
      }
    } catch (err) { TC.handle(err); }
  });
  TC.on('order', () => load());
  TC.on('user-updated', (u) => { S.user = u; renderHeader(); });

  async function loadMeds() {
    S.meds = await TC.get('/api/medications/today');
    renderBento();
    renderSchedule();
    scheduleBrowserReminders(false);
  }

  async function load() {
    const [meds, rec, ord, con, ap, vit] = await Promise.all([
      TC.get('/api/medications/today'), TC.get('/api/records'), TC.get('/api/orders'), TC.get('/api/consultations'), TC.get('/api/appointments'), TC.get('/api/vitals?type=bp'),
    ]);
    S.meds = meds; S.records = rec.records; S.orders = ord.orders; S.consults = con.consultations; S.appts = ap.appointments; S.vitals = vit.vitals;
    if (S.user.preferredPharmacyId && (!S.pharmacy || S.pharmacy.id !== S.user.preferredPharmacyId)) S.pharmacy = (await TC.get(`/api/pharmacies/${S.user.preferredPharmacyId}`).catch(() => ({}))).pharmacy || null;
    renderRefill(); renderHeader(); renderBento(); renderRecords(); renderSchedule(); renderBp(); renderPharmacy();
    scheduleBrowserReminders(false);
  }

  (async () => {
    S.user = await TC.ready;
    if (!S.user) { location.href = '/login?next=/records'; return; }
    if (S.user.role !== 'patient') { location.href = '/provider'; return; }
    await load();
    if (location.hash === '#med-schedule') $('#med-schedule').scrollIntoView();
    setInterval(() => { if (S.orders.some((o) => o.status.active)) TC.get('/api/orders').then((d) => { S.orders = d.orders; renderBento(); }); }, 30000);
  })().catch(TC.handle);
})();
