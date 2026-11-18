/* Specialist doctors page: filters, featured doctor, list, booking, instant video calls */
(function () {
  'use strict';
  const { $, $$, esc } = TC;
  const state = { category: TC.qs('category') || 'all', sort: 'availability', q: TC.qs('q') || '', doctors: [], featuredId: TC.qs('doctor') };

  const star = '<span class="material-symbols-outlined text-xs leading-none" style="font-variation-settings: \'FILL\' 1;">star</span>';

  function featuredTpl(d) {
    return `<div class="relative rounded-2xl bg-surface-container p-6 lg:p-9 shadow-md overflow-hidden transition-all duration-300 animate-fade-in">
<div class="absolute top-0 right-0 px-4 py-1.5 bg-tertiary text-on-tertiary rounded-bl-xl text-xs font-semibold tracking-wide flex items-center gap-1.5 shadow-sm"><span class="material-symbols-outlined text-sm leading-none" style="font-variation-settings: 'FILL' 1;">local_fire_department</span>${state.featuredId ? 'แพทย์ที่คุณเลือก' : 'แพทย์ประจำวันแนะนำ (Featured Doctor)'}</div>
<div class="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start pt-2">
<div class="flex flex-col items-center lg:items-start shrink-0 w-full lg:w-64"><div class="relative"><img alt="${esc(d.name)}" class="w-40 h-40 lg:w-48 lg:h-48 rounded-2xl object-cover shadow-sm" src="${esc(TC.avatar(d.photo, d.name))}">
<div class="absolute -bottom-3 -right-2 bg-primary text-on-primary text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md"><span class="material-symbols-outlined text-xs leading-none" style="font-variation-settings: 'FILL' 1;">verified</span><span>${esc(d.license)}</span></div></div>
<div class="mt-5 w-full bg-surface-container-low p-3.5 rounded-xl space-y-2 text-xs">
<div class="flex items-center justify-between text-on-surface-variant"><span class="flex items-center gap-1 text-[11px]"><span class="material-symbols-outlined text-sm text-secondary">work_history</span> ประสบการณ์</span><span class="font-bold text-on-surface">${d.experienceYears} ปี</span></div>
<div class="flex items-center justify-between text-on-surface-variant"><span class="flex items-center gap-1 text-[11px]"><span class="material-symbols-outlined text-sm text-secondary">translate</span> ภาษา</span><span class="font-bold text-on-surface">${esc(d.languages)}</span></div>
<div class="flex items-center justify-between text-on-surface-variant"><span class="flex items-center gap-1 text-[11px]"><span class="material-symbols-outlined text-sm text-secondary">health_and_safety</span> ประกัน</span><span class="font-bold text-primary">${esc(d.insurance)}</span></div></div></div>
<div class="flex-1 space-y-5 w-full"><div>
<div class="flex flex-wrap items-center gap-2 mb-1.5"><span class="px-2.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">${esc(d.specialtyLabel)}</span><span class="px-2.5 py-0.5 rounded-md bg-secondary-container text-on-secondary-container text-xs font-medium">${esc(d.hospital)}</span></div>
<h2 class="font-headline text-2xl lg:text-3xl font-bold text-on-surface leading-tight">${esc(d.name)} ${d.degree ? `<span class="text-sm font-normal text-secondary">${esc(d.degree)}</span>` : ''}</h2>
<div class="flex flex-wrap items-center gap-3 mt-2 text-xs"><div class="flex items-center gap-1 text-tertiary font-bold bg-tertiary-fixed/60 px-2 py-0.5 rounded-md">${star.replace('text-xs', 'text-sm')}<span>${d.rating}</span></div>
<span class="text-on-surface-variant underline cursor-pointer hover:text-on-surface" data-profile="${esc(d.id)}">${d.reviews}+ รีวิวจากผู้รับการรักษาจริง</span><span class="text-outline-variant">•</span>
${d.availableNow ? '<span class="text-primary font-medium flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>พร้อมรับสายทันที</span>' : `<span class="text-on-surface-variant font-medium flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-outline"></span>คิวว่างถัดไป ${esc(d.nextSlotLabel)}</span>`}</div></div>
<div class="space-y-2"><h4 class="text-xs font-semibold text-secondary uppercase tracking-wider">ความเชี่ยวชาญเฉพาะทาง</h4><div class="flex flex-wrap gap-2 text-xs">${(d.expertise || []).map((x) => `<span class="px-3 py-1.5 rounded-lg bg-surface text-on-surface font-medium shadow-sm">${esc(x)}</span>`).join('')}</div></div>
<p class="text-xs md:text-sm text-on-surface-variant leading-relaxed">${esc(d.bio)}</p>
<div class="pt-4 p-4 rounded-xl bg-surface-container-low flex flex-col md:flex-row items-start md:items-center justify-between gap-4"><div class="space-y-1">
<div class="flex items-center gap-2 text-xs text-on-surface-variant"><span class="material-symbols-outlined text-base text-primary">calendar_month</span><span>เวลาเปิดรับสายวันนี้:</span><span class="font-bold text-on-surface">${esc(d.todayHours)}</span></div>
<div class="text-lg font-headline font-bold text-primary">฿${d.fee} <span class="text-xs font-body font-normal text-on-surface-variant">/ ${d.duration} นาที ${esc(d.feeNote || '(รวมการสรุปผลและออกใบสั่งยา)')}</span></div></div>
<div class="flex items-center gap-2.5 w-full md:w-auto">
<button ${d.availableNow ? '' : 'disabled'} class="flex-1 md:flex-initial px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" data-call="${esc(d.id)}" type="button"><span class="material-symbols-outlined text-base leading-none">videocam</span><span>${d.availableNow ? 'วิดีโอคอลปรึกษาทันที' : 'แพทย์ไม่ว่างขณะนี้'}</span></button>
<button class="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-surface hover:bg-surface-container-high text-on-surface font-semibold text-xs flex items-center justify-center gap-1.5 transition-all" data-book="${esc(d.id)}" type="button"><span class="material-symbols-outlined text-base leading-none text-secondary">event_available</span><span>จองเวลานัดหมายล่วงหน้า</span></button></div></div></div></div></div>`;
  }

  function cardTpl(d) {
    return `<div class="flex flex-col justify-between rounded-2xl bg-surface-container p-6 shadow-sm hover:shadow-md transition-all duration-300 animate-fade-in"><div class="space-y-4">
<div class="flex items-start gap-4"><div class="relative shrink-0"><img alt="${esc(d.name)}" class="w-20 h-20 rounded-xl object-cover" src="${esc(TC.avatar(d.photo, d.name))}">
<div class="absolute -bottom-1 -right-1 bg-surface-container-lowest p-0.5 rounded-full shadow"><span class="material-symbols-outlined text-primary text-base leading-none" style="font-variation-settings: 'FILL' 1;">verified</span></div></div>
<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5 mb-1"><span class="px-2 py-0.5 rounded text-[11px] font-medium bg-primary-fixed text-on-primary-fixed">${esc(d.specialtyLabel)}</span>
<div class="flex items-center gap-0.5 text-tertiary text-xs font-semibold ml-auto">${star}<span>${d.rating}</span></div></div>
<h4 class="font-headline font-bold text-on-surface text-base truncate">${esc(d.name)}</h4><p class="text-xs text-on-surface-variant truncate">${esc(d.subtitle)}</p><p class="text-[11px] text-secondary mt-1">${esc(d.experienceNote || `ประสบการณ์ ${d.experienceYears} ปี`)}</p></div></div>
<div class="bg-surface-container-low rounded-xl p-3 text-xs space-y-1.5"><span class="text-[11px] font-semibold text-secondary uppercase tracking-wider block">การดูแลหลัก</span><p class="text-on-surface-variant leading-relaxed text-xs">${esc(d.focus)}</p></div>
<div class="flex items-center justify-between text-xs pt-1">${d.availableNow
    ? '<div class="flex items-center gap-1.5 text-primary font-medium"><span class="w-2 h-2 rounded-full bg-primary animate-ping"></span><span>พร้อมรับสายทันที</span></div>'
    : `<div class="text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-sm text-secondary">schedule</span><span>คิวถัดไป: ${esc(d.nextSlotLabel)}</span></div>`}
<div class="font-headline font-bold text-primary text-sm">฿${d.fee} <span class="font-body text-[11px] text-on-surface-variant font-normal">/ ${d.duration} นาที</span></div></div></div>
<div class="mt-5 pt-4 border-t-0 flex gap-2">
<button class="w-full py-2.5 px-3 rounded-xl bg-surface hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors" data-profile="${esc(d.id)}" type="button"><span class="material-symbols-outlined text-sm">info</span><span>ดูประวัติ</span></button>
${d.availableNow
    ? `<button class="w-full py-2.5 px-3 rounded-xl bg-primary text-on-primary text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors shadow-sm" data-call="${esc(d.id)}" type="button"><span class="material-symbols-outlined text-sm">videocam</span><span>พร้อมรับสาย</span></button>`
    : `<button class="w-full py-2.5 px-3 rounded-xl bg-primary text-on-primary text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors shadow-sm" data-book="${esc(d.id)}" type="button"><span class="material-symbols-outlined text-sm">calendar_add_on</span><span>นัดหมาย</span></button>`}</div></div>`;
  }

  function paintFilters() {
    $$('.specialty-btn').forEach((b) => {
      const on = b.dataset.category === state.category;
      b.classList.toggle('bg-primary', on); b.classList.toggle('text-on-primary', on); b.classList.toggle('shadow-sm', on); b.classList.toggle('font-semibold', on);
      b.classList.toggle('bg-surface-container', !on); b.classList.toggle('text-on-surface-variant', !on); b.classList.toggle('font-medium', !on);
    });
  }

  async function load() {
    paintFilters();
    const params = new URLSearchParams({ category: state.category, sort: state.sort });
    if (state.q) params.set('q', state.q);
    const [list, all] = await Promise.all([TC.get(`/api/doctors?${params}`), state.featuredId ? null : TC.get('/api/doctors?sort=rating')]);
    state.doctors = list.doctors;
    let featured = state.featuredId ? (await TC.get(`/api/doctors/${encodeURIComponent(state.featuredId)}`).catch(() => null))?.doctor : null;
    if (!featured) featured = (all ? all.doctors : list.doctors).find((d) => d.featured) || list.doctors[0];
    $('#featured-doctor').innerHTML = featured ? featuredTpl(featured) : '';
    state.featured = featured;
    const rest = list.doctors.filter((d) => !featured || d.id !== featured.id);
    $('#grid-title').textContent = state.q ? `ผลการค้นหา "${state.q}" (${list.doctors.length})` : 'แพทย์เฉพาะทางพร้อมให้บริการ';
    $('#doctor-grid').innerHTML = rest.length ? rest.map(cardTpl).join('')
      : `<div class="md:col-span-2 lg:col-span-3 p-10 rounded-2xl bg-surface-container-low text-center text-sm text-on-surface-variant">ไม่พบแพทย์ในหมวดนี้${state.q ? ` สำหรับ "${esc(state.q)}"` : ''} <button class="text-primary font-semibold hover:underline ml-1" data-reset type="button">ดูแพทย์ทั้งหมด</button></div>`;
  }

  const find = (id) => state.doctors.find((d) => d.id === id) || (state.featured && state.featured.id === id ? state.featured : null);
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-call],[data-book],[data-profile],[data-reset]');
    if (!t || !t.closest('main')) return;
    if (t.dataset.reset != null) return reset();
    if (t.dataset.profile) return TC.doctorProfile(t.dataset.profile);
    if (t.dataset.book) return TC.bookAppointment(t.dataset.book);
    const d = find(t.dataset.call);
    if (d) TC.startConsultation({ providerType: 'doctor', doctorId: d.id, mode: 'video', providerName: d.name, fee: d.fee });
  });

  function reset() {
    state.category = 'all'; state.q = ''; state.featuredId = null; state.sort = 'availability';
    $('#sort-select').value = 'availability';
    history.replaceState(null, '', '/doctors');
    load().catch(TC.handle);
  }

  $$('.specialty-btn').forEach((b) => b.addEventListener('click', () => { state.category = b.dataset.category; load().catch(TC.handle); }));
  $('#reset-filters').onclick = reset;
  $('#sort-select').onchange = (e) => { state.sort = e.target.value; load().catch(TC.handle); };
  TC.on('appointment-booked', () => load().catch(() => {}));

  load().catch(TC.handle);
  if (TC.qs('appointments')) TC.ready.then((u) => u && TC.appointmentsModal());
  if (state.featuredId) setTimeout(() => $('#featured-doctor').scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
})();
