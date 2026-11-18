/* Home page */
(function () {
  'use strict';
  const { $, $$, esc } = TC;
  const dist = (km) => (km == null ? '' : km < 1 ? `${Math.round(km * 1000)} ม.` : `${km} กม.`);
  let pharmacies = [];

  function pharmacyCard(p) {
    const badge = p.openNow ? `<span class="w-2 h-2 rounded-full bg-primary"></span><span>${esc(p.hoursLabel)}</span>` : `<span class="w-2 h-2 rounded-full bg-outline"></span><span class="text-outline">${esc(p.hoursLabel)}</span>`;
    const verified = p.hasDoctor ? 'มีแพทย์ประจำ' : p.open24 ? 'เภสัชกรชุมชน 24 ชม.' : 'เภสัชกรผ่านการรับรอง';
    const image = p.image ? `<img alt="${esc(p.name)}" class="w-full h-full object-cover" src="${esc(p.image)}">`
      : `<div class="w-full h-full flex items-center justify-center bg-surface-container"><span class="material-symbols-outlined text-6xl text-primary-container">${p.type === 'clinic' ? 'local_hospital' : 'local_pharmacy'}</span></div>`;
    return `<div class="rounded-xl bg-surface-container-lowest p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
<div><div class="relative w-full h-44 rounded-lg overflow-hidden mb-4 bg-surface-container">${image}
<div class="absolute top-3 left-3 bg-surface/90 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-semibold text-primary flex items-center gap-1">${badge}</div>
<div class="absolute bottom-3 right-3 bg-surface-container-lowest/90 px-2 py-0.5 rounded text-[11px] font-medium text-on-surface flex items-center gap-1"><span class="material-symbols-outlined text-xs text-tertiary">timer</span><span>ส่งด่วน ~${p.deliveryMins} นาที</span></div></div>
<div class="flex items-center justify-between mb-1.5 gap-2"><h3 class="font-headline text-lg font-bold text-on-surface">${esc(p.shortName || p.name)}</h3>
<span class="inline-flex items-center gap-0.5 text-xs text-tertiary font-bold shrink-0"><span class="material-symbols-outlined text-xs" style="font-variation-settings: 'FILL' 1;">star</span>${p.rating} (${p.reviews})</span></div>
<div class="flex items-center gap-2 text-xs text-on-surface-variant mb-3"><span class="flex items-center gap-1 font-medium text-primary"><span class="material-symbols-outlined text-sm">verified</span>${verified}</span><span>•</span><span>ห่าง ${dist(p.distanceKm)}</span></div>
<p class="text-xs text-outline leading-relaxed line-clamp-2 mb-4">${esc(p.description)}</p></div>
<div class="grid grid-cols-2 gap-2 pt-2">
<a class="py-2.5 px-3 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-opacity-90 flex items-center justify-center gap-1 transition-all cursor-pointer" href="tel:${esc(p.phone)}"><span class="material-symbols-outlined text-base">call</span><span>${p.open24 ? 'ปรึกษา 24 ชม.' : p.hasDoctor ? 'โทรปรึกษา' : 'โทรปรึกษาฟรี'}</span></a>
<a class="py-2.5 px-3 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high flex items-center justify-center gap-1 transition-all cursor-pointer" href="/pharmacies?id=${esc(p.id)}"><span class="material-symbols-outlined text-base">storefront</span><span>${p.type === 'clinic' ? 'ดูข้อมูล' : 'ดูหน้าร้าน'}</span></a></div></div>`;
  }

  function doctorCard(d) {
    const now = d.availableNow;
    return `<div class="rounded-xl bg-surface-container-lowest p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between animate-fade-in">
<div class="space-y-4"><div class="flex items-start gap-4"><div class="relative shrink-0">
<img alt="${esc(d.name)}" class="w-16 h-16 rounded-xl object-cover cursor-pointer" data-profile="${esc(d.id)}" src="${esc(TC.avatar(d.photo, d.name))}">
<span class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${now ? 'bg-primary-fixed' : 'bg-secondary-fixed'} border-2 border-surface-container-lowest flex items-center justify-center"><span class="w-2 h-2 rounded-full ${now ? 'bg-primary' : 'bg-secondary'}"></span></span></div>
<div class="min-w-0"><div class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${now ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-secondary-container text-on-secondary-container'} mb-1">${now ? 'พร้อมคุยทันที' : 'นัดหมายล่วงหน้าได้'}</div>
<h3 class="font-headline text-base font-bold text-on-surface truncate cursor-pointer hover:text-primary" data-profile="${esc(d.id)}">${esc(d.name)}</h3>
<p class="text-xs text-primary font-medium truncate">${esc(d.subtitle)}</p><p class="text-[11px] text-outline truncate">${esc(d.hospital)}</p></div></div>
<div class="p-3 rounded-lg bg-surface-container-low flex items-center justify-between text-xs"><div class="space-y-0.5"><span class="text-outline text-[11px]">อัตราค่าปรึกษา</span><div class="font-bold text-on-surface">${d.fee}฿ <span class="font-normal text-on-surface-variant">/ ${d.duration} นาที</span></div></div>
${now ? `<div class="text-right space-y-0.5"><span class="text-outline text-[11px]">รีวิวจากผู้รับบริการ</span><div class="flex items-center gap-1 font-bold text-tertiary"><span class="material-symbols-outlined text-xs" style="font-variation-settings: 'FILL' 1;">star</span><span>${d.rating}</span><span class="text-outline font-normal">(${d.reviews})</span></div></div>`
    : `<div class="text-right space-y-0.5"><span class="text-outline text-[11px]">คิวว่างถัดไป</span><div class="font-semibold text-primary">${esc(d.nextSlotLabel)}</div></div>`}</div></div>
<div class="pt-5">${now
    ? `<button class="w-full py-2.5 px-4 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-opacity-90 flex items-center justify-center gap-1.5 transition-all cursor-pointer" data-call="${esc(d.id)}" type="button"><span class="material-symbols-outlined text-base">video_call</span><span>เริ่มคุยกับแพทย์ตอนนี้</span></button>`
    : `<button class="w-full py-2.5 px-4 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high flex items-center justify-center gap-1.5 transition-all cursor-pointer" data-book="${esc(d.id)}" type="button"><span class="material-symbols-outlined text-base text-primary">calendar_add_on</span><span>จองเวลานัดหมาย</span></button>`}</div></div>`;
  }

  async function loadPharmacies() {
    const d = await TC.get('/api/pharmacies');
    pharmacies = d.pharmacies;
    $('#home-pharmacies').innerHTML = pharmacies.filter((p) => p.openNow).slice(0, 3).map(pharmacyCard).join('') || '<p class="text-sm text-outline">ไม่มีร้านยาที่เปิดอยู่ในขณะนี้</p>';
    $('#pharm-count').textContent = `ดูทั้งหมด ${d.total} ร้านรอบตัวคุณ`;
    const nearest = pharmacies.find((p) => p.openNow) || pharmacies[0];
    if (nearest) {
      $('#nearest-pharmacy').textContent = `${nearest.shortName || nearest.name} (~${dist(nearest.distanceKm)})`;
      $('#nearest-status').textContent = nearest.openNow ? 'มีสต็อกยาพร้อมส่ง' : 'ปิดทำการ';
    }
    const near = pharmacies.filter((p) => p.openNow).slice(0, 3);
    if (near.length) $('#avg-delivery').textContent = `${Math.round(near.reduce((s, p) => s + p.deliveryMins, 0) / near.length)} นาที ในย่าน${(TC.state.user && TC.state.user.location ? TC.state.user.location.label : 'อารีย์').split(/[,\s]/)[0].replace('ซอย', '')}`;
  }

  let doctors = [];
  let page = 0;
  function renderDoctors() {
    const pages = Math.max(1, Math.ceil(doctors.length / 3));
    page = (page + pages) % pages;
    $('#home-doctors').innerHTML = doctors.slice(page * 3, page * 3 + 3).map(doctorCard).join('');
  }

  async function init() {
    const user = await TC.ready;
    $('#loc-label').textContent = (user && user.location ? user.location : { label: 'ซอยอารีย์ พญาไท, กรุงเทพฯ' }).label;
    $('#loc-change').onclick = async () => {
      const loc = await TC.locationModal();
      if (loc) { $('#loc-label').textContent = loc.label; loadPharmacies().catch(TC.handle); }
    };
    loadPharmacies().catch(TC.handle);
    TC.get('/api/doctors').then((d) => { doctors = d.doctors; renderDoctors(); }).catch(TC.handle);
  }

  $('#doc-prev').onclick = () => { page -= 1; renderDoctors(); };
  $('#doc-next').onclick = () => { page += 1; renderDoctors(); };
  $('#home-doctors').addEventListener('click', (e) => {
    const t = e.target.closest('[data-call],[data-book],[data-profile]');
    if (!t) return;
    const d = doctors.find((x) => x.id === (t.dataset.call || t.dataset.book || t.dataset.profile));
    if (t.dataset.call) TC.startConsultation({ providerType: 'doctor', doctorId: d.id, mode: 'video', providerName: d.name, fee: d.fee });
    else if (t.dataset.book) TC.bookAppointment(d.id);
    else TC.doctorProfile(d.id);
  });

  $('#btn-pharmacist').onclick = () => {
    const p = pharmacies.find((x) => x.openNow);
    if (!p) return TC.toast('ขณะนี้ไม่มีร้านยาที่เปิดให้บริการใกล้คุณ', 'error');
    TC.startConsultation({ providerType: 'pharmacist', pharmacyId: p.id, mode: 'chat', providerName: `${p.pharmacist.name} • ${p.shortName || p.name}` });
  };
  $('#btn-doctors').onclick = () => { location.href = '/doctors'; };
  $$('[data-cat]').forEach((icon) => {
    const btn = icon.closest('button');
    btn.onclick = () => { location.href = `/doctors?category=${icon.dataset.cat}`; };
  });

  init();
})();
