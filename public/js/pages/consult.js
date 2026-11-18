/* Live consultation chat (patient ⇄ doctor / pharmacist) */
(function () {
  'use strict';
  const { $, esc } = TC;
  const id = TC.pathId();
  let C = null; // consultation
  let me = 'patient';
  let timerSec = 0;
  let searchTerm = '';

  TC.silenceNotification = (n) => n.link && n.link.includes(id);

  // ---------------------------------------------------------------- helpers
  const other = () => (me === 'patient' ? C.provider : { name: C.patient.name, photo: C.patient.avatar });
  const allergyText = (p) => (p.allergies || []).map((a) => `${a.name}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ');
  const ageText = (p) => (p.age ? `อายุ ${p.age.years} ปี` : 'อายุ -');

  function rxCard(msg) {
    const rx = C.prescription;
    if (!rx) return '';
    const total = rx.items.reduce((s, i) => s + i.price, 0);
    const confirmed = rx.status === 'confirmed';
    const action = me === 'patient'
      ? (confirmed
        ? `<a class="w-full py-2.5 px-4 bg-surface-container text-primary rounded-xl text-xs font-semibold flex items-center justify-center gap-2" href="/orders?id=${esc(rx.orderId)}"><span class="material-symbols-outlined text-base">local_shipping</span><span>ยืนยันแล้ว • ติดตามการจัดส่ง #${esc(rx.orderId)}</span></a>`
        : `<button class="w-full py-2.5 px-4 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-sm" data-confirm-rx type="button"><span class="material-symbols-outlined text-base">check_circle</span><span>ยืนยันรับยาและส่งต่อร้านยาใกล้บ้าน</span></button>`)
      : `<div class="text-center text-[11px] text-outline">${confirmed ? `ผู้ป่วยยืนยันแล้ว • คำสั่งซื้อ #${esc(rx.orderId)}` : 'รอผู้ป่วยยืนยันรับยา'}</div>`;
    return `<div class="p-4 rounded-2xl bg-surface-container-low text-on-surface shadow-sm">
<div class="flex items-center justify-between pb-3 bg-surface-container/50 px-3 py-2 rounded-xl mb-3"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary text-xl">prescriptions</span><div><h4 class="font-headline font-bold text-xs text-on-surface">ใบสั่งยาอิเล็กทรอนิกส์ (e-Prescription)</h4><span class="text-[10px] text-outline">อนุมัติโดย ${esc(C.provider.name)} • ${esc(TC.when(rx.issuedAt))}</span></div></div>
<span class="px-2 py-0.5 rounded-full ${confirmed ? 'bg-primary text-on-primary' : 'bg-primary/20 text-primary'} text-[10px] font-bold">${confirmed ? 'ยืนยันแล้ว' : 'รอการยืนยัน'}</span></div>
<div class="space-y-2 mb-4">${rx.items.map((i, n) => `<div class="p-2.5 bg-surface rounded-xl flex items-center justify-between text-xs gap-2"><div class="flex items-center gap-2.5"><div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">Rx ${n + 1}</div>
<div><strong class="font-medium text-on-surface block">${esc(i.name)}</strong><span class="text-[11px] text-outline">${esc(i.instructions)} (${esc(i.unit)}${i.qty > 1 ? ` × ${i.qty}` : ''})</span></div></div><span class="font-semibold text-on-surface text-xs shrink-0">${TC.baht(i.price)}</span></div>`).join('')}</div>
<div class="p-2.5 rounded-xl bg-secondary-container/60 text-on-secondary-container flex items-center justify-between text-xs mb-3 gap-2"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-tertiary text-base">local_shipping</span><span class="text-[11px]">ร้านยาจัดส่ง: <strong>${esc(C.pharmacy ? C.pharmacy.shortName || C.pharmacy.name : '-')}</strong>${C.pharmacy ? ` (ส่งด่วน ${C.pharmacy.deliveryMins} นาที)` : ''}</span></div><span class="text-xs font-bold text-primary shrink-0">ยอดรวม ${TC.baht(total)}</span></div>
${action}</div>`;
  }

  function bubble(m, prev) {
    const mine = m.from === me;
    const time = `${TC.time(m.at)} น.`;
    if (m.from === 'system') {
      return `<div class="flex justify-center animate-fade-in"><div class="max-w-md px-3.5 py-1.5 rounded-xl bg-surface-container-low text-center text-[11px] text-on-surface-variant flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-primary text-xs">lock</span><span>${esc(m.text)}</span></div></div>`;
    }
    let content;
    if (m.type === 'rx') content = rxCard(m);
    else if (m.type === 'image') {
      content = `<div class="p-2 rounded-2xl ${mine ? 'rounded-br-sm bg-primary text-on-primary' : 'rounded-bl-sm bg-surface-container-lowest text-on-surface'} shadow-sm flex flex-col gap-2"><a class="relative rounded-xl overflow-hidden block" href="${esc(m.imageUrl)}" target="_blank"><img alt="ภาพประกอบอาการ" class="w-64 max-w-full h-44 object-cover rounded-xl" src="${esc(m.imageUrl)}"/>${m.caption ? `<div class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-inverse-surface/80 text-[10px] text-inverse-on-surface font-mono">${esc(m.caption)}</div>` : ''}</a>${m.text ? `<p class="text-xs px-1.5 pb-1 ${mine ? 'text-on-primary/95' : ''}">${esc(m.text)}</p>` : ''}</div>`;
    } else if (m.type === 'audio') {
      content = `<div class="p-2.5 rounded-2xl ${mine ? 'rounded-br-sm bg-primary' : 'rounded-bl-sm bg-surface-container-lowest'} shadow-sm"><audio class="max-w-[240px]" controls preload="none" src="${esc(m.fileUrl)}"></audio></div>`;
    } else if (m.type === 'file') {
      content = `<a class="p-3 rounded-2xl ${mine ? 'rounded-br-sm bg-primary text-on-primary' : 'rounded-bl-sm bg-surface-container-lowest text-on-surface'} shadow-sm text-xs flex items-center gap-2" href="${esc(m.fileUrl)}" target="_blank"><span class="material-symbols-outlined">description</span>${esc(m.fileName || 'ไฟล์แนบ')}</a>`;
    } else {
      const text = esc(m.text).replace(/\n/g, '<br>');
      const hl = searchTerm ? text.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (x) => `<mark class="bg-tertiary-fixed rounded px-0.5">${x}</mark>`) : text;
      content = `<div class="p-3.5 rounded-2xl ${mine ? 'rounded-br-sm bg-primary text-on-primary' : 'rounded-bl-sm bg-surface-container-lowest text-on-surface'} text-xs leading-relaxed shadow-sm whitespace-pre-line break-words">${hl}</div>`;
    }
    if (mine) {
      return `<div class="flex items-end justify-end gap-2 ${m.type === 'rx' ? 'max-w-[90%]' : 'max-w-[85%]'} ml-auto animate-fade-in" data-mid="${m.id}"><div class="flex flex-col items-end shrink-0 pb-1"><span class="text-[9px] text-primary font-medium" data-read>${m.read ? 'อ่านแล้ว' : 'ส่งแล้ว'}</span><span class="text-[10px] text-outline">${time}</span></div><div class="flex flex-col gap-1 ${m.type === 'rx' ? 'w-full' : 'items-end'}">${content}</div></div>`;
    }
    const o = other();
    const showName = !prev || prev.from !== m.from || m.at - prev.at > 5 * 60000;
    return `<div class="flex items-end gap-2.5 ${m.type === 'rx' ? 'max-w-[90%]' : 'max-w-[85%]'} animate-fade-in" data-mid="${m.id}"><img alt="${esc(o.name)}" class="w-8 h-8 rounded-full object-cover shrink-0 mb-1" src="${esc(TC.avatar(o.photo, o.name))}"/>
<div class="flex flex-col gap-1 ${m.type === 'rx' ? 'w-full' : 'items-start'}">${showName ? `<span class="text-[10px] text-outline ml-1">${esc(o.name)}</span>` : ''}${content}</div><div class="text-[10px] text-outline shrink-0 pb-1">${time}</div></div>`;
  }

  function renderMessages() {
    const box = $('#chat-messages');
    let html = '';
    let lastDay = null;
    let prev = null;
    const list = searchTerm ? C.messages.filter((m) => (m.text || '').toLowerCase().includes(searchTerm.toLowerCase())) : C.messages;
    list.forEach((m) => {
      const day = TC.dayKey(m.at);
      if (day !== lastDay) {
        html += `<div class="flex justify-center"><span class="px-3.5 py-1 rounded-full bg-surface-container text-[11px] font-medium text-outline">${TC.isToday(m.at) ? 'วันนี้, ' : ''}${esc(TC.longDate(m.at))}</span></div>`;
        lastDay = day;
      }
      html += bubble(m, prev);
      prev = m;
    });
    if (searchTerm && !list.length) html = `<div class="text-center text-xs text-outline py-10">ไม่พบข้อความที่มีคำว่า "${esc(searchTerm)}"</div>`;
    html += '<div class="hidden items-end gap-2.5" id="typing-row"><div class="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-container-lowest shadow-sm text-outline text-lg leading-none tct-typing"><span>•</span><span>•</span><span>•</span></div></div>';
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  // ---------------------------------------------------------------- side columns
  function leftCol() {
    const p = C.provider;
    const isP = me === 'patient';
    const v = C.vitals || {};
    const counterpart = isP
      ? `<div class="relative mb-3"><img alt="${esc(p.name)}" class="w-20 h-20 rounded-full object-cover shadow-sm ring-4 ring-surface" src="${esc(TC.avatar(p.photo, p.name))}"/><span class="absolute bottom-0 right-1 w-4 h-4 rounded-full ${C.status === 'active' ? 'bg-primary' : 'bg-outline'} border-2 border-surface" title="สถานะพร้อมสนทนา"></span></div>
<div class="flex items-center gap-1 text-primary text-xs font-semibold mb-0.5"><span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">verified</span><span>${C.providerType === 'doctor' ? 'แพทย์รับรอง' : 'เภสัชกรรับรอง'} ${esc(p.license)}</span></div>
<h2 class="font-headline font-bold text-base text-on-surface">${esc(p.name)}</h2><p class="text-xs text-on-surface-variant mt-1 leading-snug">${esc(p.title)}<br/><span class="text-outline">${esc(p.hospital)}</span></p>`
      : `<div class="relative mb-3"><img alt="${esc(C.patient.name)}" class="w-20 h-20 rounded-full object-cover shadow-sm ring-4 ring-surface" src="${esc(TC.avatar(C.patient.avatar, C.patient.name))}"/></div>
<div class="flex items-center gap-1 text-primary text-xs font-semibold mb-0.5"><span class="material-symbols-outlined text-sm">badge</span><span>HN ${esc(C.patient.hn || '-')}</span></div><h2 class="font-headline font-bold text-base text-on-surface">${esc(C.patient.name)}</h2><p class="text-xs text-on-surface-variant mt-1">${esc(ageText(C.patient))} • ${esc(C.patient.gender || '-')}</p>`;
    const providerTools = isP ? '' : `<div class="bg-surface-container-low rounded-2xl p-5 shadow-sm space-y-2"><div class="font-headline font-semibold text-xs tracking-wider text-outline uppercase mb-1">เครื่องมือผู้ให้บริการ</div>
<button ${C.status === 'active' ? '' : 'disabled'} class="w-full py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" data-tool="rx" type="button"><span class="material-symbols-outlined text-base">prescriptions</span>${C.prescription ? 'ออกใบสั่งยาใหม่' : 'ออกใบสั่งยา (e-Prescription)'}</button>
<button ${C.status === 'active' ? '' : 'disabled'} class="w-full py-2.5 rounded-xl bg-surface-container text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" data-tool="note" type="button"><span class="material-symbols-outlined text-base text-primary">edit_note</span>บันทึกการรักษา</button>
${C.providerType === 'doctor' ? `<button ${C.status === 'active' ? '' : 'disabled'} class="w-full py-2.5 rounded-xl bg-surface-container text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" data-tool="cert" type="button"><span class="material-symbols-outlined text-base text-primary">description</span>${C.certificate ? 'แก้ไขใบรับรองแพทย์' : 'ออกใบรับรองแพทย์'}</button>` : ''}</div>`;
    $('#left-col').innerHTML = `<div class="bg-surface-container-low rounded-2xl p-5 shadow-sm"><div class="relative flex flex-col items-center text-center">${counterpart}
<button ${C.status === 'active' ? '' : 'disabled'} class="w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50" data-video type="button"><span class="material-symbols-outlined text-base">videocam</span><span>สลับเป็นวิดีโอคอลทันที</span></button></div>
${isP ? `<div class="mt-4 pt-4 bg-surface-container/60 rounded-xl p-3 flex flex-col gap-2"><div class="flex items-center justify-between text-xs text-on-surface-variant"><span>คะแนนความพึงพอใจ</span><span class="font-semibold text-tertiary flex items-center gap-0.5"><span class="material-symbols-outlined text-xs" style="font-variation-settings: 'FILL' 1;">star</span> ${p.rating} (${p.reviews}+ รีวิว)</span></div>
<div class="flex items-center justify-between text-xs text-on-surface-variant"><span>ความเร็วเฉลี่ยตอบกลับ</span><span class="font-semibold text-on-surface">${esc(p.responseTime)}</span></div></div>` : ''}</div>
${providerTools}
<div class="bg-surface-container-low rounded-2xl p-5 shadow-sm"><div class="flex items-center justify-between mb-3"><span class="font-headline font-semibold text-xs tracking-wider text-outline uppercase">บันทึกคัดกรองเบื้องต้น</span>${isP && C.status === 'active' ? '<button class="material-symbols-outlined text-primary text-base" data-edit-intake title="แก้ไข" type="button">edit</button>' : '<span class="material-symbols-outlined text-primary text-base">clinical_notes</span>'}</div>
<div class="bg-surface rounded-xl p-3 mb-3"><span class="text-[11px] font-semibold text-primary block mb-1">อาการสำคัญ (Chief Complaint):</span><p class="text-xs text-on-surface leading-relaxed">${esc(C.complaint || '-')}</p></div>
<div class="grid grid-cols-2 gap-2 text-xs"><div class="bg-surface rounded-lg p-2.5"><span class="text-[10px] text-outline block">อุณหภูมิกาย</span><span class="font-bold ${parseFloat(v.temp) >= 37.5 ? 'text-error' : 'text-on-surface'} text-sm">${v.temp ? `${esc(v.temp)} °C` : '-'}</span></div><div class="bg-surface rounded-lg p-2.5"><span class="text-[10px] text-outline block">ความดัน (BP)</span><span class="font-bold text-on-surface text-sm">${esc(v.bp || '-')}</span></div></div>
${C.note ? `<div class="mt-3 bg-surface rounded-xl p-3"><span class="text-[11px] font-semibold text-tertiary block mb-1">บันทึกการรักษาโดย${C.providerType === 'doctor' ? 'แพทย์' : 'เภสัชกร'}:</span><p class="text-xs text-on-surface-variant leading-relaxed" id="note-text">${esc(C.note)}</p></div>` : ''}
<a class="w-full mt-3 py-2 px-3 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors flex items-center justify-center gap-1.5" href="${isP ? '/records' : '/provider'}"><span class="material-symbols-outlined text-sm">history_edu</span><span>${isP ? 'ดูประวัติการตรวจในอดีต' : 'กลับไปคิวผู้ป่วย'}</span></a></div>
<div class="p-3.5 rounded-xl bg-surface-container flex items-center gap-3"><span class="material-symbols-outlined text-primary text-xl shrink-0">shield_lock</span><div class="text-[11px] leading-tight text-on-surface-variant">การปรึกษาเป็นความลับมาตรฐาน <strong>PDPA &amp; HIPAA</strong> เข้ารหัสแบบจุดต่อจุด</div></div>`;
  }

  function rightCol() {
    const p = C.patient;
    const ph = C.pharmacy;
    const img = TC.state.config.images ? TC.state.config.images.mapChat : '';
    const allergies = allergyText(p);
    $('#right-col').innerHTML = `<div class="bg-surface-container-low rounded-2xl p-5 shadow-sm"><div class="flex items-center justify-between mb-4"><h4 class="font-headline font-semibold text-xs tracking-wider text-outline uppercase">ประวัติการแพทย์ผู้รับคำปรึกษา</h4><span class="material-symbols-outlined text-primary text-base">person</span></div>
<div class="flex items-center gap-3 pb-3 mb-3 bg-surface p-3 rounded-xl"><img alt="${esc(p.name)}" class="w-11 h-11 rounded-full object-cover ring-2 ring-primary/20" src="${esc(TC.avatar(p.avatar, p.name))}"/><div><h5 class="text-xs font-bold text-on-surface">${esc(`${p.title || ''}${p.name}`)}</h5><p class="text-[11px] text-outline">${esc(ageText(p))} • ${esc(p.gender || 'ไม่ระบุเพศ')}</p></div></div>
<div class="space-y-2 mb-4">${allergies ? `<div class="p-2.5 rounded-xl bg-error-container text-error flex items-start gap-2"><span class="material-symbols-outlined text-sm shrink-0 mt-0.5">warning</span><div class="text-[11px] leading-tight"><span class="font-bold block">ประวัติแพ้ยา (Allergy)</span>${esc(allergies)}</div></div>`
      : '<div class="p-2.5 rounded-xl bg-surface text-on-surface-variant flex items-start gap-2"><span class="material-symbols-outlined text-sm shrink-0 mt-0.5 text-primary">check_circle</span><div class="text-[11px] leading-tight"><span class="font-bold block text-on-surface">ประวัติแพ้ยา</span>ไม่มีประวัติแพ้ยาที่บันทึกไว้</div></div>'}
<div class="p-2.5 rounded-xl bg-surface text-on-surface flex items-start gap-2"><span class="material-symbols-outlined text-tertiary text-sm shrink-0 mt-0.5">medical_information</span><div class="text-[11px] leading-tight text-on-surface-variant"><span class="font-semibold text-on-surface block">โรคประจำตัว</span>${esc((p.conditions || []).join(', ') || 'ไม่มี')}</div></div>
<div class="grid grid-cols-2 gap-2 text-center text-xs"><div class="p-2 rounded-xl bg-surface"><span class="text-[10px] text-outline block">หมู่เลือด</span><span class="font-bold text-on-surface">${esc(p.bloodType || '-')}</span></div><div class="p-2 rounded-xl bg-surface"><span class="text-[10px] text-outline block">สิทธิการรักษา</span><span class="font-bold text-primary">${esc(p.coverage || 'ชำระเอง')}</span></div></div></div>
${me === 'patient' ? '<a class="text-xs font-semibold text-primary hover:underline flex items-center justify-between" href="/records"><span>ดูบันทึกเวชระเบียนแบบเต็ม</span><span class="material-symbols-outlined text-sm">chevron_right</span></a>' : (p.phone ? `<a class="text-xs font-semibold text-primary hover:underline flex items-center justify-between" href="tel:${esc(p.phone)}"><span>โทรหาผู้ป่วย ${esc(p.phone)}</span><span class="material-symbols-outlined text-sm">call</span></a>` : '')}</div>
${ph ? `<div class="bg-surface-container-low rounded-2xl p-5 shadow-sm"><div class="flex items-center justify-between mb-3"><h4 class="font-headline font-semibold text-xs tracking-wider text-outline uppercase">ร้านยาเครือข่ายส่งด่วน</h4>${me === 'patient' && C.status === 'active' && !(C.prescription && C.prescription.orderId) ? '<button class="material-symbols-outlined text-primary text-base" data-change-pharmacy title="เปลี่ยนร้านยา" type="button">swap_horiz</button>' : '<span class="material-symbols-outlined text-primary text-base">local_pharmacy</span>'}</div>
<a class="relative rounded-xl overflow-hidden mb-3 block" href="https://www.google.com/maps/dir/?api=1&destination=${ph.lat},${ph.lng}" rel="noopener" target="_blank"><div class="w-full h-28 bg-cover bg-center rounded-xl relative" style="background-image: url('${esc(img)}')"><div class="absolute inset-0 bg-gradient-to-t from-inverse-surface/70 via-transparent to-transparent"></div><div class="absolute bottom-2 left-2 text-inverse-on-surface text-[11px] font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-xs text-primary-fixed">pin_drop</span>ห่างจากจุดที่คุณอยู่ ${ph.distanceKm ?? '-'} กม.</div></div></a>
<h5 class="text-xs font-bold text-on-surface">${esc(ph.name)}</h5><p class="text-[11px] text-on-surface-variant mt-0.5 leading-tight">${ph.open24 ? 'มีเภสัชกรประจำตลอด 24 ชม.' : 'มีเภสัชกรประจำตลอดเวลาทำการ'} • ยาพร้อมส่งทันที</p>
<div class="mt-3 pt-3 bg-surface rounded-xl p-2.5 flex items-center justify-between text-xs"><span class="text-outline">ระยะเวลาจัดส่งโดยประมาณ</span><span class="font-bold text-primary flex items-center gap-1"><span class="material-symbols-outlined text-sm">moped</span> ~${Math.max(15, ph.deliveryMins - 5)}-${ph.deliveryMins + 5} นาที</span></div></div>` : ''}
<div class="bg-surface-container p-4 rounded-2xl"><div class="flex items-center gap-2 mb-2"><span class="material-symbols-outlined text-error text-lg">emergency</span><span class="text-xs font-bold text-on-surface">พบอาการวิกฤตเฉียบพลัน?</span></div><p class="text-[11px] text-on-surface-variant leading-relaxed mb-3">หากมีอาการหายใจขัด แน่นหน้าอกรุนแรง หรือหมดสติ กดเรียกรถพยาบาลฉุกเฉินทันที</p>
<a class="w-full py-2 px-3 rounded-xl bg-error-container text-error text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-error hover:text-on-error transition-colors" href="tel:1669"><span class="material-symbols-outlined text-sm">phone_in_talk</span><span>โทรสายด่วนฉุกเฉิน 1669</span></a></div>`;
  }

  function header() {
    const o = other();
    const active = C.status === 'active';
    $('#consult-code').textContent = C.id;
    $('#chat-title').textContent = `${o.name.replace(/\s\S+$/, '')} (${active ? 'กำลังสนทนา' : 'สิ้นสุดแล้ว'})`;
    $('#chat-status').textContent = active ? (me === 'patient' ? (C.demoResponder ? 'ตอบกลับโดยระบบอัตโนมัติ (โหมดสาธิต)' : C.provider.online ? 'ออนไลน์' : 'แจ้งเตือนผู้ให้บริการแล้ว กรุณารอสักครู่') : 'ผู้ป่วยรอรับคำปรึกษา') : `สิ้นสุดเมื่อ ${TC.when(C.endedAt)}`;
    $('#chat-dot').className = `w-2.5 h-2.5 rounded-full ${active ? 'bg-primary animate-ping' : 'bg-outline'}`;
    const chip = $('#status-chip');
    chip.innerHTML = active ? '<span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span> ห้องตรวจออนไลน์สด (Active Consultation)' : '<span class="w-2 h-2 rounded-full bg-outline"></span> สิ้นสุดการปรึกษาแล้ว';
    chip.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${active ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`;
    $('#end-btn').classList.toggle('hidden', !active);
    $('#composer').classList.toggle('opacity-50', !active);
    $('#composer').classList.toggle('pointer-events-none', !active);
    $('#message-input').placeholder = active ? (me === 'patient' ? `พิมพ์ข้อความสอบถาม${C.providerType === 'doctor' ? 'คุณหมอ' : 'เภสัชกร'}...` : 'พิมพ์ข้อความถึงผู้ป่วย...') : 'การปรึกษานี้สิ้นสุดแล้ว';
    if (!active) {
      $('#timer-label').textContent = 'ระยะเวลาปรึกษา';
      $('#session-timer').textContent = `${Math.max(1, Math.round(((C.endedAt || Date.now()) - C.startedAt) / 60000))} นาที`;
    }
  }

  function quickReplies() {
    const items = me === 'patient'
      ? ['อาการดีขึ้นแล้วครับ', C.providerType === 'doctor' ? 'ขอใบรับรองแพทย์อิเล็กทรอนิกส์' : 'มียาแก้แพ้แบบไม่ง่วงไหม', 'สอบถามวิธีทานยาก่อนนอน', 'ต้องตรวจซ้ำเมื่อไหร่ครับ?']
      : ['มีอาการเจ็บหน้าอกหรือหายใจลำบากร่วมด้วยไหม?', 'มีประวัติแพ้ยาเพิ่มเติมหรือไม่?', 'รบกวนส่งรูปบริเวณที่มีอาการค่ะ', 'หากอาการไม่ดีขึ้นใน 3 วัน แนะนำพบแพทย์ค่ะ'];
    $('#quick-replies').innerHTML = `<span class="text-[10px] text-outline font-semibold uppercase tracking-wider shrink-0">คำถามด่วน:</span>${items.map((t) => `<button class="px-3 py-1 bg-surface rounded-full text-xs text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors shrink-0" type="button">${esc(t)}</button>`).join('')}`;
  }

  function renderAll() { header(); leftCol(); rightCol(); renderMessages(); }

  // ---------------------------------------------------------------- timer
  setInterval(() => {
    if (!C || C.status !== 'active') return;
    timerSec = Math.max(0, timerSec - 1);
    $('#session-timer').textContent = TC.mmss(timerSec);
    $('#session-timer').classList.toggle('text-error', timerSec < 120);
    if (timerSec === 0) load();
  }, 1000);

  // ---------------------------------------------------------------- actions
  async function send(payload) {
    try {
      const d = await TC.post(`/api/consultations/${id}/messages`, payload);
      addMessage(d.message);
    } catch (e) { TC.handle(e); }
  }
  function addMessage(m) {
    if (C.messages.some((x) => x.id === m.id)) return;
    C.messages.push(m);
    renderMessages();
  }
  async function sendText(text) {
    const input = $('#message-input');
    const t = (text != null ? text : input.value).trim();
    if (!t) return;
    input.value = '';
    await send({ text: t });
  }
  async function sendFile(file, caption) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return TC.toast('ไฟล์ใหญ่เกิน 10MB', 'error');
    TC.toast('กำลังส่งไฟล์...', 'info');
    const dataUrl = file.type.startsWith('image/') ? await TC.compressImage(file) : await TC.fileToDataUrl(file);
    await send({ dataUrl, fileName: file.name, text: caption || '' });
  }

  async function cameraCapture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return sendFile(await TC.pickFile('image/*', 'environment'));
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); } catch (e) { return sendFile(await TC.pickFile('image/*', 'environment')); }
    const m = TC.modal({
      title: 'ถ่ายภาพอาการ', icon: 'photo_camera', onClose: () => stream.getTracks().forEach((t) => t.stop()),
      body: '<video autoplay class="w-full rounded-xl bg-inverse-surface aspect-[4/3] object-cover" muted playsinline></video><input class="mt-3 ' + TC.inputCls + '" data-caption placeholder="คำอธิบายภาพ (ถ้ามี)"/>',
      actions: [{ label: 'ยกเลิก' }, {
        label: '<span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-sm">photo_camera</span>ถ่ายและส่ง</span>', primary: true, onClick: async (mm) => {
          const v = mm.el.querySelector('video');
          const c = document.createElement('canvas');
          c.width = v.videoWidth; c.height = v.videoHeight;
          c.getContext('2d').drawImage(v, 0, 0);
          await send({ dataUrl: c.toDataURL('image/jpeg', 0.85), fileName: 'photo.jpg', text: mm.el.querySelector('[data-caption]').value });
        },
      }],
    });
    m.el.querySelector('video').srcObject = stream;
  }

  let recorder = null;
  async function toggleRecord() {
    const btn = $('#btn-mic');
    if (recorder) { recorder.stop(); return; }
    if (!window.MediaRecorder) return TC.toast('เบราว์เซอร์นี้ไม่รองรับการบันทึกเสียง', 'error');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return TC.toast('กรุณาอนุญาตการใช้ไมโครโฟน', 'error'); }
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      btn.classList.remove('text-error', 'animate-pulse');
      btn.querySelector('span').textContent = 'mic';
      const type = (recorder.mimeType || 'audio/webm').split(';')[0];
      recorder = null;
      const blob = new Blob(chunks, { type });
      if (blob.size < 1000) return;
      await send({ dataUrl: await TC.fileToDataUrl(blob), fileName: 'voice-message' });
    };
    recorder.start();
    btn.classList.add('text-error', 'animate-pulse');
    btn.querySelector('span').textContent = 'stop_circle';
    TC.toast('กำลังบันทึกเสียง... กดอีกครั้งเพื่อส่ง', 'info');
    setTimeout(() => { if (recorder) recorder.stop(); }, 120000);
  }

  async function confirmRx() {
    const rx = C.prescription;
    const subtotal = rx.items.reduce((s, i) => s + i.price, 0);
    const member = TC.state.user.isMember;
    const discount = member ? Math.round(subtotal * 0.15) : 0;
    const fee = member || subtotal >= 200 ? 0 : 30;
    const order = await TC.checkout({
      title: 'ยืนยันรับยาและชำระเงิน', amount: subtotal - discount + fee, allowCod: true, submitLabel: 'ยืนยันและส่งต่อร้านยา',
      lines: [...rx.items.map((i) => ({ label: i.name, value: TC.baht(i.price) })), ...(discount ? [{ label: 'ส่วนลดสมาชิก Terra Care+ (15%)', value: `-${TC.baht(discount)}`, accent: true }] : []),
        { label: 'ค่าจัดส่งด่วน', value: fee ? TC.baht(fee) : member ? 'ฟรี (สิทธิ์สมาชิก)' : 'ฟรี (ยอดเกิน ฿200)', accent: !fee }, { label: 'ร้านยา', value: C.pharmacy ? C.pharmacy.name : '-' },
        { label: 'จัดส่งไปที่', value: (TC.state.user.address || TC.state.user.location || {}).label || '-' }],
      submit: async (payment) => (await TC.post(`/api/consultations/${id}/confirm-rx`, { payment, pharmacyId: C.pharmacy && C.pharmacy.id })).order,
    });
    if (order) {
      TC.toast(`ส่งใบสั่งยาไปยัง ${order.pharmacy.name} แล้ว • #${order.id}`, 'success');
      await load();
    }
  }

  async function endConsultation() {
    if (!(await TC.confirm(me === 'patient' ? 'ต้องการสิ้นสุดการปรึกษาใช่หรือไม่? บันทึกการรักษาและใบสั่งยาจะถูกเก็บในประวัติของคุณ' : 'สิ้นสุดการปรึกษากับผู้ป่วยรายนี้?', { title: 'สิ้นสุดการปรึกษา', icon: 'call_end', ok: 'สิ้นสุดการปรึกษา', danger: true }))) return;
    try {
      const d = await TC.post(`/api/consultations/${id}/end`);
      C = d.consultation;
      renderAll();
      summaryModal();
    } catch (e) { TC.handle(e); }
  }

  function summaryModal() {
    if (me !== 'patient') return;
    const rx = C.prescription;
    TC.modal({
      title: 'สรุปการปรึกษา', icon: 'task_alt', size: 'max-w-lg',
      body: `<div class="space-y-3 text-xs"><div class="p-3 rounded-xl bg-surface-container-low"><b>${esc(C.provider.name)}</b><br><span class="text-outline">${esc(C.id)} • ${Math.max(1, Math.round((C.endedAt - C.startedAt) / 60000))} นาที</span></div>
        ${C.note ? `<div class="p-3 rounded-xl bg-surface-container-low"><b class="text-primary">คำแนะนำ:</b> ${esc(C.note)}</div>` : ''}
        ${rx ? `<div class="p-3 rounded-xl bg-surface-container-low"><b>ใบสั่งยา ${rx.items.length} รายการ</b> • ${rx.status === 'confirmed' ? `ยืนยันแล้ว (#${esc(rx.orderId)})` : '<span class="text-error">ยังไม่ยืนยันรับยา</span>'}</div>` : ''}
        ${C.certificate ? '<div class="p-3 rounded-xl bg-primary-fixed/40">ได้รับใบรับรองแพทย์อิเล็กทรอนิกส์ ดาวน์โหลดได้ที่หน้าประวัติการรักษา</div>' : ''}</div>`,
      actions: [{ label: 'ดูประวัติการรักษา', onClick: () => { location.href = '/records'; } }, ...(rx && rx.orderId ? [{ label: 'ติดตามการจัดส่ง', primary: true, onClick: () => { location.href = `/orders?id=${rx.orderId}`; } }] : [{ label: 'ตกลง', primary: true }])],
    });
  }

  // ---------------------------------------------------------------- provider tools
  async function rxComposer() {
    const { medicines } = await TC.get('/api/medicines');
    const allergy = allergyText(C.patient).toLowerCase();
    const conflict = (m) => (m.allergyGroup || []).some((g) => allergy.includes(g.toLowerCase()));
    const sel = {};
    (C.prescription ? C.prescription.items : []).forEach((i) => { sel[i.medId] = i.qty; });
    TC.modal({
      title: 'ออกใบสั่งยาอิเล็กทรอนิกส์', icon: 'prescriptions', size: 'max-w-xl',
      body: `${allergy ? `<p class="p-2.5 mb-3 rounded-xl bg-error-container text-error text-xs font-semibold">ผู้ป่วยแพ้ยา: ${esc(allergyText(C.patient))}</p>` : ''}<div class="space-y-2">${medicines.map((m) => `<label class="p-3 rounded-xl ${conflict(m) ? 'bg-error-container/40 opacity-60' : 'bg-surface-container-low'} flex items-center gap-3 text-xs"><input ${conflict(m) ? 'disabled' : ''} ${sel[m.id] ? 'checked' : ''} class="accent-primary" data-med="${m.id}" type="checkbox"/><span class="flex-1 min-w-0"><b>${esc(m.name)}</b> <span class="text-outline">${esc(m.unit)} • ${TC.baht(m.price)}</span>${m.controlled ? ' <span class="text-[10px] text-tertiary">ยาควบคุม</span>' : ''}<span class="block text-[11px] text-on-surface-variant truncate">${conflict(m) ? 'ขัดกับประวัติแพ้ยา — ไม่สามารถสั่งได้' : esc(m.instructions)}</span></span><input class="w-14 px-2 py-1 rounded-lg bg-surface text-center" data-qty="${m.id}" max="10" min="1" type="number" value="${sel[m.id] || 1}"/></label>`).join('')}</div>
        <textarea class="${TC.inputCls} mt-3 min-h-[70px]" data-note placeholder="บันทึกการรักษา / คำแนะนำ (แสดงให้ผู้ป่วยเห็น)">${esc(C.note || '')}</textarea>`,
      actions: [{ label: 'ยกเลิก' }, {
        label: 'ออกใบสั่งยา', primary: true, onClick: async (m) => {
          const items = [...m.el.querySelectorAll('[data-med]:checked')].map((c) => ({ medId: c.dataset.med, qty: m.el.querySelector(`[data-qty="${c.dataset.med}"]`).value }));
          const d = await TC.post(`/api/consultations/${id}/prescription`, { items, note: m.el.querySelector('[data-note]').value });
          C = d.consultation; renderAll();
          TC.toast('ส่งใบสั่งยาให้ผู้ป่วยแล้ว', 'success');
        },
      }],
    });
  }
  function noteEditor() {
    TC.modal({
      title: 'บันทึกการรักษา', icon: 'edit_note', body: `<textarea class="${TC.inputCls} min-h-[140px]" data-note>${esc(C.note || '')}</textarea>`,
      actions: [{ label: 'ยกเลิก' }, { label: 'บันทึก', primary: true, onClick: async (m) => { const d = await TC.post(`/api/consultations/${id}/note`, { note: m.el.querySelector('[data-note]').value }); C = d.consultation; renderAll(); } }],
    });
  }
  function certEditor() {
    const c = C.certificate || {};
    TC.modal({
      title: 'ออกใบรับรองแพทย์', icon: 'description',
      body: `<div class="space-y-3"><label class="${TC.labelCls}">ความเห็นแพทย์</label><textarea class="${TC.inputCls} min-h-[100px]" data-text>${esc(c.text || `ได้รับการตรวจรักษาทางไกล ด้วยอาการ ${C.complaint || ''}`)}</textarea><label class="${TC.labelCls}">ให้พักรักษาตัว (วัน)</label><input class="${TC.inputCls}" data-days max="30" min="0" type="number" value="${c.restDays || 0}"/></div>`,
      actions: [{ label: 'ยกเลิก' }, { label: 'ออกใบรับรอง', primary: true, onClick: async (m) => { const d = await TC.post(`/api/consultations/${id}/certificate`, { text: m.el.querySelector('[data-text]').value, restDays: m.el.querySelector('[data-days]').value }); C = d.consultation; renderAll(); } }],
    });
  }
  function intakeEditor() {
    const v = C.vitals || {};
    TC.modal({
      title: 'แก้ไขข้อมูลคัดกรอง', icon: 'clinical_notes',
      body: `<div class="space-y-3"><textarea class="${TC.inputCls} min-h-[80px]" data-c>${esc(C.complaint || '')}</textarea><div class="grid grid-cols-3 gap-2"><input class="${TC.inputCls}" data-t placeholder="°C" value="${esc(v.temp || '')}"/><input class="${TC.inputCls}" data-b placeholder="120/80" value="${esc(v.bp || '')}"/><input class="${TC.inputCls}" data-p placeholder="ชีพจร" value="${esc(v.pulse || '')}"/></div></div>`,
      actions: [{ label: 'ยกเลิก' }, { label: 'บันทึก', primary: true, onClick: async (m) => { const q = (s) => m.el.querySelector(s).value; const d = await TC.post(`/api/consultations/${id}/vitals`, { complaint: q('[data-c]'), temp: q('[data-t]'), bp: q('[data-b]'), pulse: q('[data-p]') }); C = d.consultation; renderAll(); } }],
    });
  }

  function moreMenu() {
    TC.modal({
      title: 'ตัวเลือกการสนทนา', icon: 'more_vert',
      body: `<div class="space-y-1.5"><button class="w-full text-left px-4 py-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs flex items-center gap-2" data-o="export" type="button"><span class="material-symbols-outlined text-base text-primary">download</span>ดาวน์โหลดบันทึกการสนทนา (.txt)</button>
        <button class="w-full text-left px-4 py-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs flex items-center gap-2" data-o="history" type="button"><span class="material-symbols-outlined text-base text-primary">forum</span>ประวัติการสนทนาทั้งหมด</button>
        <button class="w-full text-left px-4 py-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs flex items-center gap-2" data-o="report" type="button"><span class="material-symbols-outlined text-base text-primary">flag</span>แจ้งปัญหาการให้บริการ</button>
        ${C.status === 'active' ? '<button class="w-full text-left px-4 py-3 rounded-xl bg-error-container/60 hover:bg-error-container text-error text-xs flex items-center gap-2" data-o="end" type="button"><span class="material-symbols-outlined text-base">call_end</span>สิ้นสุดการปรึกษา</button>' : ''}</div>`,
    }).el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      b.closest('.fixed').remove();
      if (b.dataset.o === 'export') {
        const lines = C.messages.map((m) => `[${TC.date(m.at)} ${TC.time(m.at)}] ${m.from === 'patient' ? C.patient.name : m.from === 'provider' ? C.provider.name : 'ระบบ'}: ${m.type === 'rx' ? `ใบสั่งยา: ${C.prescription.items.map((i) => i.name).join(', ')}` : m.type === 'image' ? '[รูปภาพ] ' + (m.text || '') : m.text}`);
        const blob = new Blob([`TeleCare Terra • ${C.id}\n${C.provider.name} ⇄ ${C.patient.name}\n\n${lines.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${C.id}.txt`; a.click();
      }
      if (b.dataset.o === 'history') TC.consultationsModal();
      if (b.dataset.o === 'report') TC.supportModal({ topic: `ปัญหาการปรึกษา ${C.id}` });
      if (b.dataset.o === 'end') endConsultation();
    });
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-confirm-rx],[data-video],[data-tool],[data-edit-intake],[data-change-pharmacy]');
    if (!t) return;
    try {
      if (t.dataset.confirmRx != null) await confirmRx();
      else if (t.dataset.video != null) { await TC.post(`/api/consultations/${id}/mode`, { mode: 'video' }); location.href = `/video/${id}`; }
      else if (t.dataset.tool === 'rx') await rxComposer();
      else if (t.dataset.tool === 'note') noteEditor();
      else if (t.dataset.tool === 'cert') certEditor();
      else if (t.dataset.editIntake != null) intakeEditor();
      else if (t.dataset.changePharmacy != null) {
        const p = await TC.pharmacyPicker({ title: 'เลือกร้านยาที่จะจัดส่ง', current: C.pharmacy && C.pharmacy.id });
        if (p) { C.pharmacy = { ...C.pharmacy, id: p.id, name: p.name, shortName: p.shortName, distanceKm: p.distanceKm, deliveryMins: p.deliveryMins, open24: p.open24, lat: p.lat, lng: p.lng }; rightCol(); renderMessages(); TC.toast(`จะจัดส่งยาจาก ${p.name}`, 'success'); }
      }
    } catch (err) { TC.handle(err); }
  });
  $('#send-button').onclick = () => sendText();
  let typingSent = 0;
  $('#message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendText(); return; }
    if (Date.now() - typingSent > 3000) { typingSent = Date.now(); TC.post(`/api/consultations/${id}/typing`).catch(() => {}); }
  });
  $('#quick-replies').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { $('#message-input').value = b.textContent.trim(); $('#message-input').focus(); } });
  $('#btn-attach').onclick = async () => sendFile(await TC.pickFile('image/*,application/pdf'));
  $('#btn-camera').onclick = cameraCapture;
  $('#btn-mic').onclick = toggleRecord;
  $('#end-btn').onclick = endConsultation;
  $('#btn-more').onclick = moreMenu;
  $('#btn-call').onclick = async () => {
    if (C.status !== 'active') return TC.toast('การปรึกษานี้สิ้นสุดแล้ว', 'error');
    await TC.post(`/api/consultations/${id}/mode`, { mode: 'video' }).catch(() => {});
    location.href = `/video/${id}?audio=1`;
  };
  $('#btn-search').onclick = () => {
    const bar = $('#chat-search-bar');
    if (bar) { bar.remove(); searchTerm = ''; renderMessages(); return; }
    const el = document.createElement('div');
    el.id = 'chat-search-bar';
    el.className = 'px-4 py-2 bg-surface-container-low flex items-center gap-2';
    el.innerHTML = `<span class="material-symbols-outlined text-outline text-lg">search</span><input class="flex-1 bg-transparent text-xs focus:outline-none" placeholder="ค้นหาข้อความในแชท..." type="search"/><button class="text-xs text-primary font-semibold" type="button">ปิด</button>`;
    $('#chat-messages').before(el);
    const input = el.querySelector('input');
    input.focus();
    input.oninput = () => { searchTerm = input.value.trim(); renderMessages(); };
    el.querySelector('button').onclick = () => { el.remove(); searchTerm = ''; renderMessages(); };
  };

  let typingTimer;
  TC.on('message', (d) => {
    if (d.consultationId !== id) return;
    $('#typing-row') && $('#typing-row').classList.add('hidden');
    addMessage(d.message);
    if (d.message.type === 'rx') load();
    if (d.message.from !== me) TC.post(`/api/consultations/${id}/read`).catch(() => {});
  });
  TC.on('typing', (d) => {
    if (d.consultationId !== id) return;
    const row = $('#typing-row');
    if (!row) return;
    row.classList.remove('hidden'); row.classList.add('flex');
    $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { row.classList.add('hidden'); row.classList.remove('flex'); }, 6000);
  });
  TC.on('read', (d) => {
    if (d.consultationId !== id) return;
    C.messages.forEach((m) => { if (m.from === me) m.read = true; });
    document.querySelectorAll('[data-read]').forEach((s) => { s.textContent = 'อ่านแล้ว'; });
  });
  TC.on('consultation', (d) => { if (d.consultationId === id) load(); });
  TC.on('note', (d) => { if (d.consultationId === id) { C.note = d.note; leftCol(); } });
  TC.on('stream-open', () => { if (C) load(); });

  // ---------------------------------------------------------------- load
  async function load() {
    try {
      const d = await TC.get(`/api/consultations/${encodeURIComponent(id)}`);
      C = d.consultation;
      me = C.viewerRole;
      timerSec = C.remainingSeconds;
      $('#session-timer').textContent = TC.mmss(timerSec);
      renderAll();
      if (C.unread) TC.post(`/api/consultations/${id}/read`).catch(() => {});
    } catch (e) {
      $('#chat-messages').innerHTML = `<div class="text-center text-sm text-on-surface-variant py-16">${esc(e.message)}<br><a class="text-primary font-semibold" href="/">กลับหน้าแรก</a></div>`;
    }
  }

  (async () => {
    await TC.ready;
    if (!id) {
      const { consultations } = await TC.get('/api/consultations');
      const active = consultations.find((c) => c.status === 'active') || consultations[0];
      if (active) location.replace(`/consult/${active.id}`);
      else { $('#chat-messages').innerHTML = '<div class="text-center text-sm text-on-surface-variant py-16">ยังไม่มีการปรึกษา<br><a class="text-primary font-semibold" href="/pharmacies">เริ่มปรึกษาเภสัชกร</a> หรือ <a class="text-primary font-semibold" href="/doctors">พบแพทย์เฉพาะทาง</a></div>'; $('#left-col').innerHTML = ''; $('#right-col').innerHTML = ''; }
      return;
    }
    await load();
    quickReplies();
    document.title = `${C ? C.id : 'การปรึกษา'} • TeleCare Terra`;
  })();
})();
