/* Login / registration / password reset */
(function () {
  'use strict';
  const { $, $$, esc } = TC;
  const byText = (sel, text) => $$(sel).find((el) => el.textContent.includes(text));

  const form = $('#loginForm');
  const title = $('h1');
  const subtitle = title.nextElementSibling;
  const btn = $('#submitBtn');
  const btnText = $('#btnText');
  const btnIcon = $('#btnIcon');
  const idInput = $('#identifier');
  const pwInput = $('#password');
  const remember = $('#rememberMe');
  const forgot = byText('a', 'ลืมรหัสผ่าน');
  const regPrompt = byText('div.mt-6.text-center', 'ยังไม่มีบัญชี');
  let mode = 'login';

  // Extra fields used in registration mode.
  const nameField = document.createElement('div');
  nameField.className = 'hidden flex flex-col gap-1.5 text-left';
  nameField.innerHTML = `<label class="text-xs font-semibold text-on-surface tracking-wide" for="fullname">ชื่อ-นามสกุล</label>
    <div class="relative flex items-center"><span class="material-symbols-outlined absolute left-3.5 text-on-surface-variant text-xl pointer-events-none">person</span>
    <input autocomplete="name" class="w-full pl-11 pr-4 py-3 bg-surface-container-low text-on-surface placeholder:text-outline text-sm rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary transition-all duration-150" id="fullname" placeholder="เช่น สมชาย ใจดี" type="text"/></div>`;
  form.insertBefore(nameField, form.firstElementChild);

  const confirmField = document.createElement('div');
  confirmField.className = 'hidden flex flex-col gap-1.5 text-left';
  confirmField.innerHTML = `<label class="text-xs font-semibold text-on-surface tracking-wide" for="password2">ยืนยันรหัสผ่าน</label>
    <div class="relative flex items-center"><span class="material-symbols-outlined absolute left-3.5 text-on-surface-variant text-xl pointer-events-none">lock_reset</span>
    <input autocomplete="new-password" class="w-full pl-11 pr-4 py-3 bg-surface-container-low text-on-surface placeholder:text-outline text-sm rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary transition-all duration-150" id="password2" placeholder="กรอกรหัสผ่านอีกครั้ง" type="password"/></div>
    <label class="flex items-start gap-2 cursor-pointer select-none mt-2"><input class="w-4 h-4 mt-0.5 rounded accent-primary" id="acceptTerms" type="checkbox"/><span class="text-xs text-on-surface-variant">ยอมรับ <a class="text-primary font-semibold hover:underline" data-action="terms" href="#">ข้อกำหนดการใช้งาน</a> และ <a class="text-primary font-semibold hover:underline" data-action="privacy" href="#">นโยบายความเป็นส่วนตัวข้อมูลสุขภาพ (PDPA)</a></span></label>`;
  const pwBlock = pwInput.closest('.flex.flex-col');
  pwBlock.after(confirmField);

  const errorBox = document.createElement('div');
  errorBox.className = 'hidden p-3 rounded-lg bg-error-container text-error text-xs font-medium flex items-start gap-2';
  form.insertBefore(errorBox, form.firstElementChild);
  const showError = (msg) => { errorBox.innerHTML = `<span class="material-symbols-outlined text-base">error</span><span>${esc(msg)}</span>`; errorBox.classList.remove('hidden'); };
  const clearError = () => errorBox.classList.add('hidden');

  function setMode(next) {
    mode = next;
    clearError();
    const reg = mode === 'register';
    nameField.classList.toggle('hidden', !reg);
    confirmField.classList.toggle('hidden', !reg);
    forgot.classList.toggle('invisible', reg);
    title.textContent = reg ? 'สมัครสมาชิก TeleCare Terra' : 'เข้าสู่ระบบ TeleCare Terra';
    subtitle.textContent = reg ? 'สร้างบัญชีฟรี เพื่อปรึกษาเภสัชกร พบแพทย์เฉพาะทาง และติดตามการจัดส่งยาถึงบ้าน' : 'เข้าถึงบริการปรึกษาแพทย์ เภสัชกรชุมชน และระบบจัดส่งยาด่วนถึงบ้านตลอด 24 ชั่วโมง';
    btnText.textContent = reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
    pwInput.autocomplete = reg ? 'new-password' : 'current-password';
    regPrompt.innerHTML = reg
      ? '<span>มีบัญชีผู้ใช้งานอยู่แล้ว?</span><a class="font-bold text-primary hover:text-on-primary-fixed-variant ml-1 underline-offset-2 hover:underline" data-switch="login" href="#">เข้าสู่ระบบ</a>'
      : '<span>ยังไม่มีบัญชีผู้ใช้งานใช่หรือไม่?</span><a class="font-bold text-primary hover:text-on-primary-fixed-variant ml-1 underline-offset-2 hover:underline" data-switch="register" href="#">สมัครสมาชิกใหม่ (ฟรี)</a>';
    regPrompt.querySelector('[data-switch]').onclick = (e) => { e.preventDefault(); setMode(e.target.dataset.switch); };
    history.replaceState(null, '', reg ? '/login?register=1' + (TC.qs('next') ? `&next=${encodeURIComponent(TC.qs('next'))}` : '') : '/login' + (TC.qs('next') ? `?next=${encodeURIComponent(TC.qs('next'))}` : ''));
    (reg ? $('#fullname') : idInput).focus();
  }

  window.togglePasswordVisibility = () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    $('#password2').type = pwInput.type;
    $('#pwdEyeIcon').textContent = show ? 'visibility_off' : 'visibility';
  };

  const setBusy = (busy, text) => {
    btn.disabled = busy;
    btnText.textContent = text;
    btnIcon.textContent = busy ? 'progress_activity' : 'arrow_forward';
    btnIcon.classList.toggle('animate-spin', busy);
  };

  function redirectAfterLogin(user) {
    btnText.textContent = mode === 'register' ? 'สมัครสมาชิกสำเร็จ' : 'เข้าสู่ระบบสำเร็จ';
    btnIcon.textContent = 'check_circle';
    btnIcon.classList.remove('animate-spin');
    btn.classList.remove('bg-primary');
    btn.classList.add('bg-primary-container', 'text-on-primary-container');
    const next = TC.qs('next');
    setTimeout(() => { location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : user.role !== 'patient' ? '/provider' : '/'; }, 500);
  }

  window.submitLogin = async () => {
    clearError();
    const reg = mode === 'register';
    try {
      if (reg) {
        if (pwInput.value !== $('#password2').value) return showError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        setBusy(true, 'กำลังสร้างบัญชี...');
        const d = await TC.post('/api/auth/register', { name: $('#fullname').value, identifier: idInput.value, password: pwInput.value, acceptTerms: $('#acceptTerms').checked, remember: remember.checked });
        redirectAfterLogin(d.user);
      } else {
        setBusy(true, 'กำลังตรวจสอบข้อมูล...');
        const d = await TC.post('/api/auth/login', { identifier: idInput.value, password: pwInput.value, remember: remember.checked });
        redirectAfterLogin(d.user);
      }
    } catch (e) {
      setBusy(false, reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ');
      showError(e.message);
    }
  };

  // Forgot password
  forgot.addEventListener('click', (e) => {
    e.preventDefault();
    TC.modal({
      title: 'ลืมรหัสผ่าน', icon: 'lock_reset',
      body: `<div class="space-y-3"><p class="text-xs text-on-surface-variant">กรอกอีเมลหรือเบอร์โทรศัพท์ที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ (หมดอายุใน 30 นาที)</p><input class="${TC.inputCls}" data-id placeholder="08X-XXX-XXXX หรือ your@email.com" value="${esc(idInput.value)}"/><div data-result></div></div>`,
      actions: [{ label: 'ปิด' }, {
        label: 'ส่งลิงก์ตั้งรหัสผ่าน', primary: true, onClick: async (m) => {
          const d = await TC.post('/api/auth/forgot', { identifier: m.el.querySelector('[data-id]').value });
          m.el.querySelector('[data-result]').innerHTML = `<div class="p-3 rounded-xl bg-primary-fixed/40 text-xs text-on-surface space-y-1"><div>${esc(d.message)}</div>${d.resetLink ? `<div class="text-[11px] text-on-surface-variant">โหมดสาธิต (ยังไม่ได้เชื่อมต่อระบบส่งอีเมล/SMS): <a class="text-primary font-semibold underline break-all" href="${esc(d.resetLink)}">เปิดลิงก์ตั้งรหัสผ่านใหม่</a></div>` : ''}</div>`;
          return false;
        },
      }],
    });
  });

  // Password reset (arrived from a reset link)
  const resetToken = TC.qs('reset');
  if (resetToken) {
    TC.modal({
      title: 'ตั้งรหัสผ่านใหม่', icon: 'password', dismissible: false,
      body: `<div class="space-y-3"><input autocomplete="new-password" class="${TC.inputCls}" data-p1 placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)" type="password"/><input autocomplete="new-password" class="${TC.inputCls}" data-p2 placeholder="ยืนยันรหัสผ่านใหม่" type="password"/></div>`,
      actions: [{ label: 'ยกเลิก', onClick: () => { location.href = '/login'; } }, {
        label: 'บันทึกรหัสผ่านใหม่', primary: true, onClick: async (m) => {
          const p1 = m.el.querySelector('[data-p1]').value;
          if (p1 !== m.el.querySelector('[data-p2]').value) { TC.toast('รหัสผ่านไม่ตรงกัน', 'error'); return false; }
          await TC.post('/api/auth/reset', { token: resetToken, password: p1 });
          TC.toast('ตั้งรหัสผ่านใหม่เรียบร้อย กำลังเข้าสู่ระบบ...', 'success');
          setTimeout(() => { location.href = '/'; }, 800);
        },
      }],
    });
  }

  // Social sign-in
  const social = (provider, label) => () => {
    if (TC.state.config.oauth[provider]) { location.href = `/auth/${provider}`; return; }
    TC.info(`เข้าสู่ระบบด้วย ${label}`, `<p class="text-sm text-on-surface-variant leading-relaxed">ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ ${esc(label)} สำหรับเว็บไซต์นี้ ผู้ดูแลระบบสามารถเปิดใช้งานได้โดยกำหนดค่า ${provider === 'google' ? '<code>GOOGLE_CLIENT_ID</code> และ <code>GOOGLE_CLIENT_SECRET</code>' : '<code>LINE_CHANNEL_ID</code> และ <code>LINE_CHANNEL_SECRET</code>'} ในเซิร์ฟเวอร์</p><p class="text-xs text-outline mt-2">ระหว่างนี้สามารถเข้าสู่ระบบหรือสมัครด้วยอีเมล/เบอร์โทรศัพท์ได้ตามปกติ</p>`, 'link');
  };
  $('#googleAuthBtn').onclick = social('google', 'Google');
  byText('button', 'LINE Login').onclick = social('line', 'LINE');
  byText('button', 'หมอพร้อม').onclick = () => TC.info('หมอพร้อม / ThaiID', '<p class="text-sm text-on-surface-variant leading-relaxed">การยืนยันตัวตนผ่านหมอพร้อมและ ThaiID ต้องได้รับอนุมัติการเชื่อมต่อจากหน่วยงานรัฐก่อนเปิดใช้งาน ขณะนี้กรุณาเข้าสู่ระบบด้วยอีเมลหรือเบอร์โทรศัพท์</p>', 'health_and_safety');
  byText('a', 'English').onclick = (e) => { e.preventDefault(); TC.toast('English version is coming soon. ขณะนี้รองรับภาษาไทย', 'info'); };
  byText('a', 'ติดต่อศูนย์ช่วยเหลือ').onclick = (e) => { e.preventDefault(); TC.supportModal({}); };

  if (TC.qs('error') === 'oauth_failed') showError('เข้าสู่ระบบด้วยบัญชีโซเชียลไม่สำเร็จ กรุณาลองใหม่');
  if (TC.qs('error') === 'oauth_disabled') showError('ยังไม่ได้เปิดใช้งานการเข้าสู่ระบบด้วยบัญชีโซเชียล');

  TC.ready.then(() => {
    if (!TC.state.config.demoMode) return;
    const hint = document.createElement('div');
    hint.className = 'mt-4 p-3 rounded-lg bg-surface-container-low text-[11px] text-on-surface-variant flex items-center justify-between gap-2';
    hint.innerHTML = '<span><b class="text-on-surface">บัญชีทดลอง:</b> demo@telecare.terra / demo1234</span><button class="text-primary font-semibold hover:underline shrink-0" type="button">กรอกให้</button>';
    hint.querySelector('button').onclick = () => { setMode('login'); idInput.value = 'demo@telecare.terra'; pwInput.value = 'demo1234'; };
    regPrompt.after(hint);
  });

  setMode(TC.qs('register') ? 'register' : 'login');
})();
