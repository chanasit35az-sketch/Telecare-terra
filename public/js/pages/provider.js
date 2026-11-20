/* Provider console for doctors and pharmacists: live queue, appointments, pharmacy orders */
(function () {
  'use strict';
  const { $, esc } = TC;

  function metric(icon, label, value, accent) {
    return `<div class="flex items-center gap-3 px-4 py-2 ${accent ? 'bg-primary/10' : 'bg-surface-container-lowest shadow-sm'} rounded-xl"><div class="w-8 h-8 rounded-lg ${accent ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary'} flex items-center justify-center"><span class="material-symbols-outlined text-lg">${icon}</span></div><div><span class="text-[11px] ${accent ? 'text-primary' : 'text-outline'} block font-medium">${label}</span><span class="text-base font-bold ${accent ? 'text-primary' : 'text-on-surface'} leading-none">${value}</span></div></div>`;
  }

  function queueCard(c) {
    const active = c.status === 'active';
    const p = c.patient;
    const allergies = (p.allergies || []).map((a) => a.name).join(', ');
    return `<div class="p-5 rounded-2xl bg-surface-container-lowest ${active ? 'shadow-md ring-2 ring-primary/40' : 'shadow-sm opacity-80'} space-y-3">
<div class="flex items-start justify-between gap-3"><div class="flex items-center gap-3"><img alt="${esc(p.name)}" class="w-12 h-12 rounded-xl object-cover" src="${esc(TC.avatar(p.avatar, p.name))}"/><div><div class="flex items-center gap-2"><h3 class="text-sm font-bold text-on-surface">${esc(p.name)}</h3>${c.unread ? `<span class="px-1.5 py-0.5 rounded-full bg-error text-on-error text-[10px] font-bold">${c.unread} ใหม่</span>` : ''}</div>
<p class="text-[11px] text-outline">HN ${esc(p.hn || '-')} • ${p.age ? `${p.age.years} ปี` : '-'} • ${esc(c.id)}</p></div></div>
<span class="px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${active ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}">${active ? `${c.mode === 'video' ? 'วิดีโอคอล' : 'แชท'} • ${c.remainingSeconds == null ? 'ไม่จำกัดเวลา' : `เหลือ ${TC.mmss(c.remainingSeconds)}`}` : 'สิ้นสุดแล้ว'}</span></div>
${allergies ? `<div class="p-2 rounded-lg bg-error-container text-error text-[11px] font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-sm">warning</span>แพ้ยา: ${esc(allergies)}</div>` : ''}
<p class="text-xs text-on-surface-variant p-3 rounded-xl bg-surface-container-low"><b class="text-on-surface">อาการ:</b> ${esc(c.complaint || '-')}</p>
<div class="flex flex-wrap items-center justify-between gap-2 text-xs"><span class="text-outline">เริ่ม ${esc(TC.when(c.startedAt))}${c.hasRx ? ' • ออกใบสั่งยาแล้ว' : ''}</span>
<div class="flex gap-2"><a class="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high font-semibold flex items-center gap-1.5" href="/consult/${esc(c.id)}"><span class="material-symbols-outlined text-base text-primary">chat</span>แชท</a>${active ? `<a class="px-3.5 py-2 rounded-xl bg-primary text-on-primary font-semibold flex items-center gap-1.5" href="/video/${esc(c.id)}"><span class="material-symbols-outlined text-base">videocam</span>เข้าห้องวิดีโอ</a>` : ''}</div></div></div>`;
  }

  function apptCard(a) {
    return `<div class="p-4 rounded-2xl bg-surface-container-lowest shadow-sm flex items-center justify-between gap-3"><div><div class="text-sm font-bold text-on-surface">${esc(a.patient || '-')}</div><div class="text-[11px] text-on-surface-variant">${esc(a.dateLabel)} • ${esc(a.time)} น. • ${a.mode === 'video' ? 'วิดีโอคอล' : 'แชท'}</div>${a.complaint ? `<div class="text-[11px] text-outline mt-0.5">${esc(a.complaint)}</div>` : ''}</div><span class="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary-fixed text-on-primary-fixed shrink-0">${esc(a.id)}</span></div>`;
  }

  function orderCard(o) {
    return `<div class="p-4 rounded-2xl bg-surface-container-lowest shadow-sm space-y-2"><div class="flex items-center justify-between gap-2"><span class="font-headline font-bold text-sm">#${esc(o.id)}</span><span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${o.status.active ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}">${esc(o.status.label)}</span></div>
<div class="text-xs text-on-surface-variant">${esc(o.patient || '-')} • ${esc(TC.when(o.createdAt))}</div><div class="text-[11px] text-outline truncate">${esc(o.items.map((i) => i.name).join(', '))}</div><div class="text-xs font-bold text-primary">${TC.baht(o.total)} • ${o.payment.method === 'cod' ? 'เก็บเงินปลายทาง' : 'ชำระแล้ว'}</div></div>`;
  }

  async function load() {
    const user = TC.state.user;
    const d = await TC.get('/api/provider/queue');
    const active = d.consultations.filter((c) => c.status === 'active');
    $('#pv-title').textContent = `สวัสดี ${user.name}`;
    $('#pv-sub').textContent = user.role === 'doctor' ? `${user.provider ? user.provider.specialtyLabel + ' • ' + user.provider.hospital : 'แพทย์'} — ผู้ป่วยจะเห็นว่าคุณออนไลน์ขณะเปิดหน้านี้` : `${user.provider ? user.provider.name : 'เภสัชกร'} — ผู้ป่วยจะเห็นว่าคุณออนไลน์ขณะเปิดหน้านี้`;
    $('#pv-metrics').innerHTML = metric('support_agent', 'กำลังปรึกษา', `${active.length} ราย`, true)
      + metric(user.role === 'doctor' ? 'event' : 'inventory_2', user.role === 'doctor' ? 'นัดหมาย' : 'คำสั่งซื้อวันนี้', user.role === 'doctor' ? `${d.appointments.length} นัด` : `${d.orders.filter((o) => TC.isToday(o.createdAt)).length} รายการ`);
    $('#pv-queue').innerHTML = d.consultations.length ? d.consultations.map(queueCard).join('') : '<div class="p-10 rounded-2xl bg-surface-container-lowest text-center text-sm text-on-surface-variant">ยังไม่มีผู้ป่วยในคิว ระบบจะแจ้งเตือนทันทีเมื่อมีผู้ป่วยเริ่มปรึกษา</div>';
    $('#pv-side-title').textContent = user.role === 'doctor' ? 'นัดหมายที่กำลังจะถึง' : 'คำสั่งซื้อของร้าน';
    const side = user.role === 'doctor' ? d.appointments.map(apptCard) : d.orders.map(orderCard);
    $('#pv-side').innerHTML = side.length ? side.join('') : `<div class="p-6 rounded-2xl bg-surface-container-lowest text-center text-xs text-outline">${user.role === 'doctor' ? 'ยังไม่มีนัดหมาย' : 'ยังไม่มีคำสั่งซื้อ'}</div>`;
  }

  (async () => {
    const user = await TC.ready;
    if (!user) { location.href = '/login?next=/provider'; return; }
    if (user.role === 'patient') {
      $('#pv-queue').innerHTML = '<div class="p-10 rounded-2xl bg-surface-container-lowest text-center text-sm text-on-surface-variant space-y-2"><p>หน้านี้สำหรับแพทย์และเภสัชกรในเครือข่าย TeleCare Terra</p><p class="text-xs text-outline">หากต้องการเข้าร่วมเป็นผู้ให้บริการ กรุณาติดต่อทีมงาน</p><button class="mt-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold" data-action="partner" type="button">สมัครเป็นพันธมิตร</button></div>';
      $('#pv-side').innerHTML = '';
      return;
    }
    await load();
    $('#pv-refresh').onclick = () => load().catch(TC.handle);
    TC.on('notification', () => load().catch(() => {}));
    TC.on('message', () => load().catch(() => {}));
    setInterval(() => load().catch(() => {}), 15000);
  })().catch(TC.handle);
})();
