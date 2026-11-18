/* Video consultation room: camera/mic via getUserMedia, peer-to-peer WebRTC with SSE signalling. */
(function () {
  'use strict';
  const { $, esc } = TC;
  const id = TC.pathId();
  const audioOnly = TC.qs('audio') === '1';
  let C = null;
  let me = 'patient';
  let localStream = null;
  let screenStream = null;
  let pc = null;
  let timerSec = 0;
  let remoteMedia = { audio: true, video: true };
  let pickedFile = null;

  // ---------------------------------------------------------------- UI helpers
  const remoteVideo = $('#remote-video');
  const localVideo = $('#local-video');
  function setRemoteState(state) {
    // state: 'connected' | 'waiting' | 'demo' | 'ended'
    const connected = state === 'connected' && remoteMedia.video;
    remoteVideo.classList.toggle('hidden', !connected);
    $('#remote-img').classList.toggle('hidden', connected);
    const wait = $('#remote-wait');
    const showWait = state === 'waiting' || state === 'ended' || (state === 'connected' && !remoteMedia.video);
    wait.classList.toggle('hidden', !showWait);
    wait.classList.toggle('flex', showWait);
    const otherName = me === 'patient' ? C.provider.name : C.patient.name;
    $('#remote-wait-text').textContent = state === 'ended' ? 'การปรึกษาสิ้นสุดแล้ว' : state === 'connected' ? `${otherName} ปิดกล้องอยู่ (สนทนาด้วยเสียง)` : `กำลังรอ ${otherName} เข้าร่วมวิดีโอคอล...`;
    $('#remote-sub').textContent = state === 'connected' ? `${me === 'patient' ? (C.providerType === 'doctor' ? 'แพทย์เฉพาะทาง' : 'เภสัชกรชุมชน') : 'ผู้ป่วย'} • ออนไลน์สด` : state === 'demo' ? 'โหมดสาธิต • ตอบกลับผ่านบันทึกและแชท' : state === 'ended' ? 'สิ้นสุดการสนทนา' : 'รอเข้าร่วม';
    $('#live-label').textContent = state === 'connected' ? 'กำลังสนทนาสด' : state === 'ended' ? 'สิ้นสุดแล้ว' : state === 'demo' ? 'ห้องตรวจพร้อม (โหมดสาธิต)' : 'รอผู้ให้บริการ';
  }

  function renderInfo() {
    const p = C.provider;
    const pt = C.patient;
    const isP = me === 'patient';
    $('#hdr-name').textContent = isP ? p.name : `${pt.title || ''}${pt.name}`;
    $('#hdr-detail').textContent = isP ? `(${p.title} • ${p.license})` : `(HN ${pt.hn || '-'})`;
    $('#remote-name').textContent = isP ? p.name : pt.name;
    $('#remote-img').src = isP ? TC.avatar(p.videoPhoto || p.photo, p.name) : TC.avatar(pt.camPhoto || pt.avatar, pt.name);
    $('#remote-img').alt = isP ? p.name : pt.name;
    $('#local-img').src = isP ? TC.avatar(pt.camPhoto || pt.avatar, pt.name) : TC.avatar(p.photo, p.name);
    $('#local-name').textContent = `${isP ? 'คุณ' + pt.name.split(' ')[0] : p.name} (กล้องคุณ)`;
    $('#room-code').textContent = `รหัสห้อง: ${C.roomCode || C.id}`;
    $('#open-chat').href = `/consult/${C.id}`;
    $('#timer-total').textContent = ` / ${C.durationMins}:00 นาที`;
    renderDrawer();
  }

  function renderDrawer() {
    const pt = C.patient;
    const v = C.vitals || {};
    const age = pt.age ? `อายุ ${pt.age.years} ปี` : '';
    const allergy = (pt.allergies || []).map((a) => `${a.name}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ');
    const ph = C.pharmacy;
    const isProvider = me === 'provider';
    $('#drawer-dynamic').innerHTML = `<div class="bg-surface-container-low rounded-2xl p-5 shadow-sm space-y-4"><div class="flex items-center justify-between"><h3 class="font-headline font-semibold text-base text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-primary text-lg">person_pin</span>ข้อมูลผู้ป่วยขณะตรวจ</h3><span class="px-2 py-0.5 bg-surface-container rounded text-[11px] font-medium text-outline">HN ${esc(pt.hn || '-')}</span></div>
<div class="space-y-2"><div class="text-sm font-bold text-on-surface">${esc(`${pt.title || ''}${pt.name}`)} <span class="font-normal text-xs text-on-surface-variant">${age ? `(${esc(age)})` : ''}</span></div>
${allergy ? `<div class="flex items-center gap-2 p-2.5 rounded-xl bg-error-container text-error"><span class="material-symbols-outlined text-lg">warning</span><div class="text-xs"><span class="font-bold">ประวัติแพ้ยาสำคัญ:</span><span class="font-semibold underline ml-1">${esc(allergy)}</span></div></div>` : '<div class="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container text-xs text-on-surface-variant"><span class="material-symbols-outlined text-lg text-primary">check_circle</span>ไม่มีประวัติแพ้ยาที่บันทึกไว้</div>'}
<div class="grid grid-cols-3 gap-2 pt-1 text-center"><div class="p-2 rounded-xl bg-surface-container"><div class="text-[10px] text-outline">อุณหภูมิ</div><div class="text-xs font-bold ${parseFloat(v.temp) >= 37.5 ? 'text-error' : 'text-on-surface'}">${v.temp ? `${esc(v.temp)} °C` : '-'}</div></div>
<div class="p-2 rounded-xl bg-surface-container"><div class="text-[10px] text-outline">ความดัน</div><div class="text-xs font-bold text-on-surface">${esc(v.bp || '-')}</div></div><div class="p-2 rounded-xl bg-surface-container"><div class="text-[10px] text-outline">ชีพจร</div><div class="text-xs font-bold text-primary">${v.pulse ? `${esc(v.pulse)} bpm` : '-'}</div></div></div>
<div class="pt-2 text-xs text-on-surface-variant leading-relaxed"><span class="font-semibold text-on-surface">อาการสำคัญ:</span> ${esc(C.complaint || '-')}</div></div></div>
<div class="bg-surface-container-low rounded-2xl p-5 shadow-sm space-y-4"><div class="flex items-center justify-between"><h3 class="font-headline font-semibold text-base text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-tertiary text-lg">prescriptions</span>คำแนะนำ &amp; ใบสั่งยา</h3><span class="flex items-center gap-1 text-[11px] text-primary font-medium"><span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>อัปเดตสด</span></div>
<div class="p-3 bg-surface-container rounded-xl text-xs space-y-2"><div class="font-medium text-on-surface flex items-center gap-1 text-primary"><span class="material-symbols-outlined text-sm">edit_note</span><span>บันทึกการรักษาโดย${C.providerType === 'doctor' ? 'แพทย์' : 'เภสัชกร'}:</span></div>
${isProvider ? `<textarea class="w-full text-on-surface-variant leading-relaxed bg-surface p-2.5 rounded-lg min-h-[110px] focus:outline-none focus:ring-2 focus:ring-primary/40" id="note-input" placeholder="พิมพ์บันทึกการรักษา (ผู้ป่วยเห็นแบบเรียลไทม์)">${esc(C.note || '')}</textarea><button class="w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold" id="save-note" type="button">บันทึกและแชร์ให้ผู้ป่วย</button>`
    : `<p class="text-on-surface-variant leading-relaxed bg-surface p-2.5 rounded-lg" id="live-doctor-note">${C.note ? `"${esc(C.note)}"` : 'ผู้ให้บริการจะบันทึกคำแนะนำระหว่างการตรวจ ข้อความจะปรากฏที่นี่แบบเรียลไทม์'}</p>`}</div>
${C.prescription ? `<div class="p-3 rounded-xl bg-surface-container text-xs space-y-1.5"><div class="font-semibold text-on-surface flex items-center gap-1"><span class="material-symbols-outlined text-sm text-primary">medication</span>ใบสั่งยา ${C.prescription.items.length} รายการ</div>${C.prescription.items.map((i) => `<div class="flex justify-between text-on-surface-variant"><span>${esc(i.name)}</span><span>${TC.baht(i.price)}</span></div>`).join('')}<div class="text-[11px] text-primary font-semibold pt-1">${C.prescription.status === 'confirmed' ? 'ยืนยันแล้ว' : 'ยืนยันรับยาได้หลังวางสาย'}</div></div>` : ''}
${isProvider ? `<a class="block text-center py-2 rounded-lg bg-surface text-xs font-semibold text-primary" href="/consult/${C.id}" target="_blank">ออกใบสั่งยา / ใบรับรองแพทย์ (หน้าแชท)</a>` : ''}
${ph ? `<div class="p-3 rounded-xl bg-secondary-container/60 space-y-2.5 text-xs text-on-secondary-container"><div class="flex items-start gap-2"><span class="material-symbols-outlined text-primary text-base mt-0.5">local_pharmacy</span><div><div class="font-semibold text-on-surface">ส่งยาตรงจากเภสัชกรชุมชน</div><div class="text-[11px] text-outline">${esc(ph.name)} (ห่าง ${ph.distanceKm ?? '-'} กม.)</div></div></div>
<div class="flex items-center justify-between pt-1"><span class="text-[11px] text-outline">คาดการณ์ส่งถึงบ้าน</span><span class="font-bold text-primary font-mono">ภายใน ${ph.deliveryMins + 5} นาที</span></div></div>` : ''}</div>`;
    const save = $('#save-note');
    if (save) save.onclick = async () => {
      try { await TC.post(`/api/consultations/${id}/note`, { note: $('#note-input').value }); TC.toast('บันทึกแล้ว ผู้ป่วยเห็นบันทึกนี้ทันที', 'success'); } catch (e) { TC.handle(e); }
    };
  }

  // ---------------------------------------------------------------- media
  async function startLocal() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      TC.toast('เบราว์เซอร์นี้ไม่รองรับกล้อง/ไมโครโฟน (ต้องเปิดผ่าน HTTPS หรือ localhost)', 'error');
      return;
    }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: audioOnly ? false : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } });
    } catch (e) {
      try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); TC.toast('ไม่สามารถเปิดกล้องได้ ใช้การสนทนาด้วยเสียงแทน', 'info'); } catch (e2) {
        TC.toast('กรุณาอนุญาตการเข้าถึงกล้องและไมโครโฟนในเบราว์เซอร์', 'error');
        return;
      }
    }
    const vt = localStream.getVideoTracks()[0];
    if (vt) {
      localVideo.srcObject = localStream;
      localVideo.classList.remove('hidden');
      $('#local-img').classList.add('hidden');
      const s = vt.getSettings();
      $('#res-label').textContent = s.height >= 1080 ? 'FHD 1080p' : s.height >= 720 ? 'HD 720p' : `${s.height || ''}p`;
    } else {
      $('#res-label').textContent = 'เสียงเท่านั้น';
      setBtn('btn-cam', false, 'videocam', 'videocam_off', 'กล้อง');
    }
  }

  function setBtn(btnId, on, onIcon, offIcon, label) {
    const btn = $(`#${btnId}`);
    $(`#${btnId}-icon`).textContent = on ? onIcon : offIcon;
    btn.classList.toggle('bg-surface/15', on);
    btn.classList.toggle('bg-error/80', !on);
    btn.classList.toggle('text-on-error', !on);
    const t = $(`#${btnId}-text`);
    if (t) t.textContent = on ? `ปิด${label}` : `เปิด${label}`;
  }

  // Exposed for the inline onclick handlers kept from the original design.
  window.toggleControl = (btnId) => {
    if (!localStream) return TC.toast('ยังไม่ได้เปิดกล้อง/ไมโครโฟน', 'error');
    const kind = btnId === 'btn-mic' ? 'audio' : 'video';
    let track = kind === 'audio' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
    if (!track && kind === 'video') {
      navigator.mediaDevices.getUserMedia({ video: true }).then((s) => {
        track = s.getVideoTracks()[0];
        localStream.addTrack(track);
        localVideo.srcObject = localStream; localVideo.classList.remove('hidden'); $('#local-img').classList.add('hidden');
        if (pc) { pc.addTrack(track, localStream); startOffer(); }
        setBtn('btn-cam', true, 'videocam', 'videocam_off', 'กล้อง');
        signal('media', mediaState());
      }).catch(() => TC.toast('ไม่สามารถเปิดกล้องได้', 'error'));
      return;
    }
    track.enabled = !track.enabled;
    if (kind === 'audio') setBtn('btn-mic', track.enabled, 'mic', 'mic_off', 'ไมค์');
    else { setBtn('btn-cam', track.enabled, 'videocam', 'videocam_off', 'กล้อง'); localVideo.classList.toggle('opacity-0', !track.enabled); }
    signal('media', mediaState());
  };
  const mediaState = () => ({ audio: Boolean(localStream && localStream.getAudioTracks()[0] && localStream.getAudioTracks()[0].enabled), video: Boolean(screenStream || (localStream && localStream.getVideoTracks()[0] && localStream.getVideoTracks()[0].enabled)) });

  window.toggleMirror = () => localVideo.classList.toggle('mirrored');
  window.toggleSidePanel = () => $('#side-drawer').classList.toggle('hidden');

  window.toggleScreenShare = async () => {
    const btn = $('#btn-share');
    if (screenStream) return stopScreen();
    if (!navigator.mediaDevices.getDisplayMedia) return TC.toast('อุปกรณ์นี้ไม่รองรับการแชร์หน้าจอ', 'error');
    try { screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true }); } catch (e) { return; }
    const track = screenStream.getVideoTracks()[0];
    track.onended = stopScreen;
    replaceVideoTrack(track);
    localVideo.srcObject = screenStream; localVideo.classList.remove('mirrored', 'hidden', 'opacity-0'); $('#local-img').classList.add('hidden');
    btn.classList.add('text-primary-fixed-dim');
    signal('media', mediaState());
    TC.toast('กำลังแชร์หน้าจอให้อีกฝ่ายเห็น', 'info');
  };
  function stopScreen() {
    if (!screenStream) return;
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
    const cam = localStream && localStream.getVideoTracks()[0];
    replaceVideoTrack(cam || null);
    localVideo.srcObject = localStream; localVideo.classList.add('mirrored');
    if (!cam) { localVideo.classList.add('hidden'); $('#local-img').classList.remove('hidden'); }
    $('#btn-share').classList.remove('text-primary-fixed-dim');
    signal('media', mediaState());
  }
  function replaceVideoTrack(track) {
    if (!pc) return;
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video') || pc.getSenders().find((s) => !s.track);
    if (sender) sender.replaceTrack(track);
    else if (track) { pc.addTrack(track, screenStream || localStream); startOffer(); }
  }

  // ---------------------------------------------------------------- WebRTC
  const signal = (kind, data) => TC.post(`/api/consultations/${id}/signal`, { kind, data }).catch(() => ({}));

  function newPc() {
    if (pc) pc.close();
    pc = new RTCPeerConnection({ iceServers: TC.state.config.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
    if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(screenStream && t.kind === 'video' ? screenStream.getVideoTracks()[0] : t, localStream));
    pc.onicecandidate = (e) => { if (e.candidate) signal('ice', e.candidate); };
    pc.ontrack = (e) => {
      remoteVideo.srcObject = e.streams[0] || new MediaStream([e.track]);
      remoteVideo.play().catch(() => {});
      setRemoteState('connected');
      watchSpeaking(remoteVideo.srcObject);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { setRemoteState('connected'); measure(); }
      if (['failed', 'disconnected'].includes(pc.connectionState)) { setRemoteState('waiting'); $('#net-label').textContent = 'การเชื่อมต่อขาดหาย'; }
    };
    return pc;
  }
  async function startOffer() {
    if (!pc || pc.signalingState === 'closed') newPc();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal('offer', pc.localDescription);
  }
  const pendingIce = [];
  async function onRtc(d) {
    if (d.consultationId !== id || !C || C.status !== 'active') return;
    try {
      if (d.kind === 'hello') {
        if (me === 'patient') { newPc(); await startOffer(); } else if (!d.data || !d.data.reply) signal('hello', { reply: true });
      } else if (d.kind === 'offer') {
        newPc();
        await pc.setRemoteDescription(d.data);
        while (pendingIce.length) await pc.addIceCandidate(pendingIce.shift());
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal('answer', pc.localDescription);
        signal('media', mediaState());
      } else if (d.kind === 'answer' && pc) {
        await pc.setRemoteDescription(d.data);
        while (pendingIce.length) await pc.addIceCandidate(pendingIce.shift());
        signal('media', mediaState());
      } else if (d.kind === 'ice') {
        if (pc && pc.remoteDescription) await pc.addIceCandidate(d.data); else pendingIce.push(d.data);
      } else if (d.kind === 'media') {
        remoteMedia = d.data || remoteMedia;
        if (pc && pc.connectionState === 'connected') setRemoteState('connected');
      } else if (d.kind === 'bye') {
        if (pc) { pc.close(); pc = null; }
        remoteVideo.srcObject = null;
        setRemoteState('waiting');
      }
    } catch (e) { console.error('rtc', e); }
  }
  TC.on('rtc', onRtc);

  async function measure() {
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      let rtt = null;
      stats.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime * 1000; });
      $('#net-label').textContent = rtt == null ? 'เชื่อมต่อแล้ว' : rtt < 120 ? `สัญญาณดีเยี่ยม (${Math.round(rtt)}ms)` : rtt < 300 ? `สัญญาณดี (${Math.round(rtt)}ms)` : `สัญญาณอ่อน (${Math.round(rtt)}ms)`;
    } catch (e) { /* ignore */ }
    setTimeout(measure, 5000);
  }

  let audioCtx;
  function watchSpeaking(stream) {
    if (!stream.getAudioTracks().length || !window.AudioContext) return;
    try {
      audioCtx = audioCtx || new AudioContext();
      const analyser = audioCtx.createAnalyser();
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i += 1) peak = Math.max(peak, Math.abs(buf[i] - 128));
        const el = $('#remote-speaking');
        el.classList.toggle('hidden', peak < 12); el.classList.toggle('flex', peak >= 12);
        if (pc) requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { /* ignore */ }
  }

  function netHint() {
    const c = navigator.connection;
    if (c && c.effectiveType) $('#net-label').textContent = `${c.effectiveType.toUpperCase()} ${c.downlink >= 5 ? 'สัญญาณดีเยี่ยม' : 'สัญญาณปานกลาง'}`;
    else $('#net-label').textContent = navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์';
  }

  // ---------------------------------------------------------------- symptom photo modal
  window.openShareModal = () => { const m = $('#modal-share-photo'); m.classList.remove('hidden'); m.classList.add('flex'); };
  window.closeShareModal = () => { const m = $('#modal-share-photo'); m.classList.add('hidden'); m.classList.remove('flex'); };
  $('#dropzone').onclick = async () => {
    const f = await TC.pickFile('image/*', 'environment');
    if (!f) return;
    pickedFile = f;
    const url = URL.createObjectURL(f);
    $('#dropzone').innerHTML = `<img alt="ภาพที่เลือก" class="max-h-48 rounded-lg object-contain" src="${url}"/><span class="text-[11px] text-outline">${esc(f.name)} • แตะเพื่อเปลี่ยนภาพ</span>`;
  };
  window.simulatePhotoSend = async () => {
    let dataUrl;
    if (pickedFile) dataUrl = await TC.compressImage(pickedFile);
    else if (localStream && localStream.getVideoTracks()[0] && localVideo.videoWidth) {
      const c = document.createElement('canvas');
      c.width = localVideo.videoWidth; c.height = localVideo.videoHeight;
      c.getContext('2d').drawImage(localVideo, 0, 0);
      dataUrl = c.toDataURL('image/jpeg', 0.85);
    } else return TC.toast('กรุณาเลือกภาพก่อนส่ง', 'error');
    try {
      await TC.post(`/api/consultations/${id}/messages`, { dataUrl, fileName: pickedFile ? pickedFile.name : 'snapshot.jpg', text: 'ภาพประกอบอาการระหว่างวิดีโอคอล' });
      window.closeShareModal();
      pickedFile = null;
      $('#dropzone').innerHTML = '<span class="material-symbols-outlined text-3xl text-primary">cloud_upload</span><span class="text-xs font-semibold text-on-surface">แตะเพื่อถ่ายภาพใหม่ หรือเลือกจากแกลเลอรี</span><span class="text-[10px] text-outline">หากไม่เลือกภาพ ระบบจะส่งภาพจากกล้องขณะนี้</span>';
      TC.toast('ส่งภาพอาการไปยังหน้าจอผู้ให้บริการเรียบร้อยแล้ว', 'success');
    } catch (e) { TC.handle(e); }
  };

  // ---------------------------------------------------------------- end call
  window.confirmEndCall = async () => {
    if (C.status !== 'active') { location.href = `/consult/${id}`; return; }
    if (!(await TC.confirm('คุณต้องการสิ้นสุดการปรึกษาและรับสรุปใบสั่งยาหรือไม่?', { title: 'วางสาย', icon: 'call_end', ok: 'สิ้นสุดการปรึกษา', danger: true }))) return;
    try {
      await TC.post(`/api/consultations/${id}/end`);
      hangup();
      TC.toast('สิ้นสุดการปรึกษาเรียบร้อยแล้ว กำลังนำท่านไปที่สรุปการรักษาและใบสั่งยา...', 'success');
      setTimeout(() => { location.href = me === 'patient' ? `/consult/${id}` : '/provider'; }, 900);
    } catch (e) { TC.handle(e); }
  };
  function hangup() {
    signal('bye');
    if (pc) { pc.close(); pc = null; }
    [localStream, screenStream].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
  }
  window.addEventListener('beforeunload', () => { navigator.sendBeacon && C && C.status === 'active' && fetch(`/api/consultations/${id}/signal`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'bye' }) }); });

  $('#speaker-test').onclick = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 660; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
      o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 700);
      const mic = localStream && localStream.getAudioTracks()[0];
      TC.toast(`กำลังเล่นเสียงทดสอบ... ${mic ? `ไมโครโฟน: ${mic.label || 'พร้อมใช้งาน'}` : 'ไม่พบไมโครโฟน'}`, 'info');
    } catch (e) { TC.toast('ไม่สามารถทดสอบเสียงได้', 'error'); }
  };

  // ---------------------------------------------------------------- timer & realtime
  setInterval(() => {
    if (!C || C.status !== 'active') return;
    timerSec = Math.max(0, timerSec - 1);
    $('#call-timer').textContent = TC.mmss(timerSec);
    $('#call-timer').classList.toggle('text-error', timerSec < 120);
    if (timerSec === 120) TC.toast('เหลือเวลาปรึกษาอีก 2 นาที', 'info');
    if (timerSec === 0) load();
  }, 1000);
  TC.on('note', (d) => { if (d.consultationId === id) { C.note = d.note; if (me === 'patient') { const n = $('#live-doctor-note'); if (n) n.textContent = `"${d.note}"`; TC.toast('ผู้ให้บริการอัปเดตบันทึกการรักษา', 'info'); } } });
  TC.on('consultation', (d) => { if (d.consultationId === id) load(); });
  TC.silenceNotification = (n) => n.link && n.link.includes(id) && n.title.startsWith('มีผู้ป่วย');

  async function load() {
    const d = await TC.get(`/api/consultations/${encodeURIComponent(id)}`);
    const first = !C;
    C = d.consultation;
    me = C.viewerRole;
    timerSec = C.remainingSeconds;
    $('#call-timer').textContent = TC.mmss(timerSec);
    renderInfo();
    if (C.status !== 'active') {
      hangup();
      setRemoteState('ended');
      $('#call-timer').textContent = 'สิ้นสุด';
      if (!first) TC.toast('การปรึกษาสิ้นสุดแล้ว', 'info');
      return false;
    }
    return true;
  }

  (async () => {
    await TC.ready;
    if (!id) { location.href = '/consult'; return; }
    try {
      if (!(await load())) return;
    } catch (e) { TC.handle(e); return; }
    document.title = `วิดีโอคอล ${C.id} • TeleCare Terra`;
    netHint();
    setRemoteState(me === 'patient' && C.demoResponder ? 'demo' : 'waiting');
    await startLocal();
    if (localStream) {
      setBtn('btn-mic', true, 'mic', 'mic_off', 'ไมค์');
      if (localStream.getVideoTracks()[0]) setBtn('btn-cam', true, 'videocam', 'videocam_off', 'กล้อง');
    }
    const announce = () => signal('hello', { reply: false });
    announce();
    TC.on('stream-open', announce);
    $('#end-top').onclick = window.confirmEndCall;
  })();
})();
