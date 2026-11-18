/* Terra Care+ membership: subscribe, manage, FAQ */
(function () {
  'use strict';
  const { $$, esc } = TC;
  const PRICE = 1200;
  const heroBtn = $$('button').find((b) => b.textContent.includes('สมัครสมาชิกรายเดือน'));
  const bottomBtn = $$('button').find((b) => b.textContent.includes('สมัครสมาชิก 1,200'));
  const heroNote = heroBtn.nextElementSibling;

  window.toggleFaq = (el) => {
    const content = el.querySelector('.faq-content');
    const icon = el.querySelector('.faq-icon');
    const isHidden = content.classList.contains('hidden');
    $$('.faq-content').forEach((x) => x.classList.add('hidden'));
    $$('.faq-icon').forEach((x) => x.classList.remove('rotate-180'));
    if (isHidden) { content.classList.remove('hidden'); icon.classList.add('rotate-180'); }
  };

  async function subscribe() {
    await TC.ready;
    if (!TC.requireLogin('เข้าสู่ระบบเพื่อสมัครสมาชิก Terra Care+')) return;
    const u = TC.state.user;
    if (u.role !== 'patient') return TC.toast('บัญชีผู้ให้บริการไม่สามารถสมัครสมาชิกได้', 'error');
    if (u.isMember && u.membership.cancelAtPeriodEnd) {
      const d = await TC.post('/api/membership/subscribe', {}).catch(TC.handle);
      if (d) { TC.state.user = d.user; TC.toast('เปิดการต่ออายุอัตโนมัติแล้ว', 'success'); paint(); }
      return;
    }
    if (u.isMember) return manage();
    const user = await TC.checkout({
      title: 'สมัครสมาชิก Terra Care+', amount: PRICE, submitLabel: 'ชำระเงินและเริ่มใช้สิทธิ์',
      lines: [{ label: 'แพ็กเกจ Terra Care+ (30 วัน)', value: TC.baht(PRICE) }, { label: 'ปรึกษาแพทย์เฉพาะทาง', value: 'ไม่จำกัด • 60 นาที/ครั้ง', accent: true }, { label: 'ค่าจัดส่งยา', value: 'ฟรีทุกครั้ง', accent: true }, { label: 'ส่วนลดค่ายา', value: '15% ทุกคำสั่งซื้อ', accent: true }],
      submit: async (payment) => (await TC.post('/api/membership/subscribe', { payment })).user,
    });
    if (user) {
      TC.state.user = user;
      paint();
      TC.modal({ title: 'ยินดีต้อนรับสู่ Terra Care+', icon: 'workspace_premium', body: `<div class="text-center space-y-2 py-2"><span class="material-symbols-outlined text-5xl text-tertiary" style="font-variation-settings:'FILL' 1">workspace_premium</span><p class="text-sm font-semibold">สิทธิ์ของคุณเริ่มใช้งานได้ทันที</p><p class="text-xs text-on-surface-variant">ใช้ได้ถึง ${esc(TC.longDate(user.membership.expiresAt))} • ต่ออายุอัตโนมัติ ยกเลิกได้ทุกเมื่อ</p></div>`, actions: [{ label: 'นัดพบแพทย์เฉพาะทาง', primary: true, onClick: () => { location.href = '/doctors'; } }] });
    }
  }

  function manage() {
    const m = TC.state.user.membership;
    TC.modal({
      title: 'การจัดการสมาชิก Terra Care+', icon: 'manage_accounts',
      body: `<div class="space-y-3 text-xs"><div class="p-4 rounded-xl bg-surface-container-low space-y-1"><div class="flex justify-between"><span class="text-outline">สถานะ</span><b class="text-primary">${m.cancelAtPeriodEnd ? 'ยกเลิกการต่ออายุแล้ว' : 'ใช้งานอยู่ • ต่ออายุอัตโนมัติ'}</b></div>
        <div class="flex justify-between"><span class="text-outline">เริ่มเป็นสมาชิก</span><b>${esc(TC.longDate(m.startedAt))}</b></div><div class="flex justify-between"><span class="text-outline">${m.cancelAtPeriodEnd ? 'สิทธิ์ใช้ได้ถึง' : 'รอบบิลถัดไป'}</span><b>${esc(TC.longDate(m.expiresAt))}</b></div><div class="flex justify-between"><span class="text-outline">ค่าบริการ</span><b>${TC.baht(m.price)} / เดือน</b></div></div>
        <p class="text-outline">${m.cancelAtPeriodEnd ? 'คุณยังใช้สิทธิ์ได้จนครบรอบบิลปัจจุบัน และจะไม่ถูกเรียกเก็บเงินในรอบถัดไป' : 'เมื่อยกเลิก สิทธิ์ยังคงใช้ได้จนครบรอบบิลปัจจุบัน และจะไม่ถูกตัดเงินในรอบถัดไป'}</p></div>`,
      actions: [{ label: 'ปิด' }, m.cancelAtPeriodEnd
        ? { label: 'เปิดการต่ออายุอีกครั้ง', primary: true, onClick: async () => { const d = await TC.post('/api/membership/subscribe', {}); TC.state.user = d.user; paint(); TC.toast('เปิดการต่ออายุอัตโนมัติแล้ว', 'success'); } }
        : { label: 'ยกเลิกการต่ออายุ', danger: true, onClick: async () => { const d = await TC.post('/api/membership/cancel'); TC.state.user = d.user; paint(); TC.toast('ยกเลิกการต่ออายุแล้ว สิทธิ์ยังใช้ได้จนครบรอบบิล', 'success'); } }],
    });
  }

  function paint() {
    const u = TC.state.user;
    if (u && u.isMember) {
      const m = u.membership;
      heroBtn.innerHTML = `<span>${m.cancelAtPeriodEnd ? 'เปิดการต่ออายุสมาชิกอีกครั้ง' : 'คุณเป็นสมาชิก Terra Care+ แล้ว • จัดการสมาชิก'}</span><span class="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">${m.cancelAtPeriodEnd ? 'autorenew' : 'manage_accounts'}</span>`;
      heroNote.innerHTML = `<span class="material-symbols-outlined text-sm text-primary">event_available</span><span>${m.cancelAtPeriodEnd ? 'สิทธิ์ใช้ได้ถึง' : 'ต่ออายุอัตโนมัติวันที่'} ${esc(TC.longDate(m.expiresAt))}</span>`;
      bottomBtn.textContent = 'จัดการสมาชิก';
    } else {
      heroBtn.innerHTML = '<span>สมัครสมาชิกรายเดือน 1,200 บาท / เดือน</span><span class="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">arrow_forward</span>';
      bottomBtn.textContent = 'สมัครสมาชิก 1,200 บ./ด.';
    }
  }

  heroBtn.onclick = subscribe;
  bottomBtn.onclick = () => (TC.state.user && TC.state.user.isMember ? manage() : subscribe());
  TC.ready.then(paint);
  if (TC.qs('subscribe')) subscribe();
})();
