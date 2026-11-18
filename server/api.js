'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const T = require('./time');
const L = require('./logic');
const C = require('./consult');
const bot = require('./bot');
const realtime = require('./realtime');
const pay = require('./payments');
const { hashPassword, verifyPassword, createSession, destroySession, requireAuth, requireProvider, sha } = require('./auth');
const { SPECIALTIES, MEDICINES, medicineById } = require('./catalog');
const IMG = require('./images');

const router = express.Router();
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const DEMO = () => process.env.DEMO_MODE !== 'false';
const PROMPTPAY_ID = () => process.env.PROMPTPAY_ID || '0812345678';

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));

// ===================================================================== auth
const normEmail = (v) => str(v, 200).toLowerCase();
const normPhone = (v) => str(v, 30).replace(/\D/g, '');
function findByIdentifier(identifier) {
  const id = str(identifier, 200);
  if (!id) return null;
  if (id.includes('@')) return db.find('users', (u) => u.email && u.email.toLowerCase() === normEmail(id));
  const phone = normPhone(id);
  return phone ? db.find('users', (u) => u.phone && normPhone(u.phone) === phone) : null;
}

// simple in-memory rate limit for login attempts
const attempts = new Map();
function rateLimited(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 10 * MIN);
  list.push(now);
  attempts.set(key, list);
  return list.length > 10;
}

router.get('/auth/me', (req, res) => {
  res.json({
    user: L.userView(req.user),
    config: {
      demoMode: DEMO(),
      oauth: { google: Boolean(process.env.GOOGLE_CLIENT_ID), line: Boolean(process.env.LINE_CHANNEL_ID) },
      realtime: realtime.mode(),
      images: { mapPharmacy: IMG.mapPharmacy, mapChat: IMG.mapChat, careHero: IMG.careHero },
      iceServers: [
        { urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',') },
        ...(process.env.TURN_URL ? [{ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }] : []),
      ],
    },
  });
});

// Health check: reports which storage backend is active (no secrets).
router.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, storage: db.remote ? 'redis' : 'file', serverless: db.serverless, time: Date.now() });
});

router.post('/auth/register', wrap(async (req, res) => {
  const name = str(req.body.name, 120);
  const identifier = str(req.body.identifier, 200);
  const password = String(req.body.password || '');
  if (name.length < 2) throw fail(400, 'กรุณากรอกชื่อ-นามสกุล');
  if (!identifier) throw fail(400, 'กรุณากรอกอีเมลหรือเบอร์โทรศัพท์');
  const isEmail = identifier.includes('@');
  if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw fail(400, 'รูปแบบอีเมลไม่ถูกต้อง');
  if (!isEmail && !/^0\d{8,9}$/.test(normPhone(identifier))) throw fail(400, 'เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)');
  if (password.length < 8) throw fail(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  if (!req.body.acceptTerms) throw fail(400, 'กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว');
  if (findByIdentifier(identifier)) throw fail(409, 'บัญชีนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบ');
  const { hash, salt } = hashPassword(password);
  const user = db.insert('users', {
    id: db.id('u_'), role: 'patient', name, email: isEmail ? normEmail(identifier) : '', phone: isEmail ? '' : normPhone(identifier),
    passwordHash: hash, salt, hn: `${String(new Date().getFullYear() + 543).slice(2)}-${String(db.nextNumber('hn', 1000)).padStart(5, '0')}`,
    allergies: [], conditions: [], points: 0, location: L.DEFAULT_LOCATION, address: null, preferredPharmacyId: null,
    membership: null, createdAt: Date.now(), updatedAt: Date.now(),
  });
  L.notify(user.id, { icon: 'waving_hand', title: 'ยินดีต้อนรับสู่ TeleCare Terra', body: 'กรอกข้อมูลสุขภาพ (แพ้ยา โรคประจำตัว) ในโปรไฟล์ เพื่อการจ่ายยาที่ปลอดภัย', link: '/records' });
  createSession(res, user.id, Boolean(req.body.remember));
  res.status(201).json({ user: L.userView(user) });
}));

router.post('/auth/login', wrap(async (req, res) => {
  const key = `${req.ip}|${str(req.body.identifier, 200).toLowerCase()}`;
  if (rateLimited(key)) throw fail(429, 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 10 นาที');
  const user = findByIdentifier(req.body.identifier);
  if (!user || !verifyPassword(req.body.password || '', user)) throw fail(401, 'อีเมล/เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง');
  attempts.delete(key);
  createSession(res, user.id, Boolean(req.body.remember));
  res.json({ user: L.userView(user) });
}));

router.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.post('/auth/forgot', wrap(async (req, res) => {
  const user = findByIdentifier(req.body.identifier);
  const out = { ok: true, message: 'หากพบบัญชีนี้ ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว' };
  if (user) {
    const token = crypto.randomBytes(24).toString('hex');
    db.remove('resetTokens', (t) => t.userId === user.id);
    db.insert('resetTokens', { id: sha(token), userId: user.id, expiresAt: Date.now() + 30 * MIN });
    const link = `/login?reset=${token}`;
    console.log(`[auth] password reset link for ${user.email || user.phone}: ${link}`);
    // No e-mail/SMS provider is configured, so demo mode returns the link directly.
    if (DEMO()) out.resetLink = link;
  }
  res.json(out);
}));

router.post('/auth/reset', wrap(async (req, res) => {
  const rec = db.byId('resetTokens', sha(str(req.body.token, 100)));
  if (!rec || rec.expiresAt < Date.now()) throw fail(400, 'ลิงก์หมดอายุหรือไม่ถูกต้อง');
  const password = String(req.body.password || '');
  if (password.length < 8) throw fail(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  const { hash, salt } = hashPassword(password);
  db.update('users', rec.userId, { passwordHash: hash, salt, updatedAt: Date.now() });
  db.remove('resetTokens', (t) => t.userId === rec.userId);
  db.remove('sessions', (s) => s.userId === rec.userId);
  createSession(res, rec.userId, false);
  res.json({ ok: true });
}));

// ===================================================================== profile
router.patch('/me', requireAuth, wrap(async (req, res) => {
  const b = req.body;
  const patch = { updatedAt: Date.now() };
  if (b.name != null) { if (str(b.name).length < 2) throw fail(400, 'กรุณากรอกชื่อ'); patch.name = str(b.name, 120); }
  if (b.title != null) patch.title = str(b.title, 20);
  if (b.phone != null) {
    const p = normPhone(b.phone);
    if (p && db.find('users', (u) => u.id !== req.user.id && normPhone(u.phone || '') === p)) throw fail(409, 'เบอร์โทรนี้ถูกใช้แล้ว');
    patch.phone = p;
  }
  if (b.email != null) {
    const e = normEmail(b.email);
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw fail(400, 'รูปแบบอีเมลไม่ถูกต้อง');
    if (e && db.find('users', (u) => u.id !== req.user.id && (u.email || '').toLowerCase() === e)) throw fail(409, 'อีเมลนี้ถูกใช้แล้ว');
    patch.email = e;
  }
  if (b.dob != null) { if (b.dob && !/^\d{4}-\d{2}-\d{2}$/.test(b.dob)) throw fail(400, 'วันเกิดไม่ถูกต้อง'); patch.dob = b.dob; }
  if (b.gender != null) patch.gender = str(b.gender, 20);
  if (b.bloodType != null) patch.bloodType = str(b.bloodType, 10);
  if (b.insurance != null) { patch.insurance = str(b.insurance, 80); patch.coverage = str(b.insurance, 80); }
  if (Array.isArray(b.allergies)) patch.allergies = b.allergies.slice(0, 20).map((a) => ({ name: str(a.name, 80), reaction: str(a.reaction, 120) })).filter((a) => a.name);
  if (Array.isArray(b.conditions)) patch.conditions = b.conditions.slice(0, 20).map((c) => str(c, 120)).filter(Boolean);
  if (b.address) {
    patch.address = { label: str(b.address.label, 120), detail: str(b.address.detail, 300), note: str(b.address.note, 200),
      lat: Number(b.address.lat) || (req.user.location || L.DEFAULT_LOCATION).lat, lng: Number(b.address.lng) || (req.user.location || L.DEFAULT_LOCATION).lng };
  }
  if (b.newPassword) {
    if (!verifyPassword(b.currentPassword || '', req.user)) throw fail(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    if (String(b.newPassword).length < 8) throw fail(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    const { hash, salt } = hashPassword(b.newPassword);
    patch.passwordHash = hash; patch.salt = salt;
  }
  res.json({ user: L.userView(db.update('users', req.user.id, patch)) });
}));

router.put('/me/location', requireAuth, wrap(async (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw fail(400, 'พิกัดไม่ถูกต้อง');
  const location = { label: str(req.body.label, 120) || `พิกัด ${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
  res.json({ user: L.userView(db.update('users', req.user.id, { location })) });
}));

router.put('/me/pharmacy', requireAuth, wrap(async (req, res) => {
  const p = db.byId('pharmacies', req.body.pharmacyId);
  if (!p) throw fail(404, 'ไม่พบร้านยา');
  res.json({ user: L.userView(db.update('users', req.user.id, { preferredPharmacyId: p.id })) });
}));

router.post('/me/avatar', requireAuth, wrap(async (req, res) => {
  const file = saveDataUrl(req.user.id, req.body.dataUrl, 'avatar');
  res.json({ user: L.userView(db.update('users', req.user.id, { avatar: `/api/files/${file.id}` })) });
}));

// ===================================================================== uploads
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };
function saveDataUrl(userId, dataUrl, name, extra = {}) {
  const m = /^data:([\w/+.-]+)(?:;[^,]*)?;base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw fail(400, 'ไฟล์ไม่ถูกต้อง');
  const mime = m[1].split(';')[0];
  const ext = MIME_EXT[mime];
  if (!ext) throw fail(400, 'รองรับเฉพาะไฟล์ JPG, PNG, WEBP, PDF หรือไฟล์เสียง');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 10 * 1024 * 1024) throw fail(413, 'ไฟล์ใหญ่เกิน 10MB');
  const id = db.id('f_');
  db.putFile(id, ext, buf).catch((err) => console.error('[upload]', err));
  return db.insert('uploads', { id, userId, mime, ext, name: str(name, 120), size: buf.length, createdAt: Date.now(), ...extra });
}

router.get('/files/:id', requireAuth, (req, res) => {
  const f = db.byId('uploads', req.params.id);
  if (!f) return res.status(404).end();
  let allowed = f.userId === req.user.id || f.public;
  if (!allowed && f.consultationId) allowed = C.canAccess(req.user, db.byId('consultations', f.consultationId));
  if (!allowed && req.user.role !== 'patient') {
    // providers may see files of patients they have consulted
    allowed = db.table('consultations').some((c) => c.userId === f.userId && C.canAccess(req.user, c));
  }
  if (!allowed) return res.status(403).end();
  db.getFile(f.id, f.ext).then((buf) => {
    if (!buf) return res.status(404).end();
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buf);
  }).catch(() => res.status(500).end());
});

// ===================================================================== catalogue
router.get('/specialties', (_req, res) => res.json({ specialties: SPECIALTIES.map(({ keywords, ...s }) => s) }));
router.get('/medicines', (_req, res) => res.json({ medicines: MEDICINES }));

router.get('/doctors', (req, res) => {
  const q = str(req.query.q, 100).toLowerCase();
  let list = db.table('doctors').map(L.doctorView);
  if (req.query.category && req.query.category !== 'all') list = list.filter((d) => d.category === req.query.category);
  if (q) list = list.filter((d) => [d.name, d.specialtyLabel, d.subtitle, d.focus, d.hospital].join(' ').toLowerCase().includes(q));
  const sort = req.query.sort || 'availability';
  if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
  else if (sort === 'price') list.sort((a, b) => a.fee - b.fee);
  else list.sort((a, b) => (b.availableNow - a.availableNow) || ((a.nextSlot ? T.toTs(a.nextSlot.date, a.nextSlot.time) : Infinity) - (b.nextSlot ? T.toTs(b.nextSlot.date, b.nextSlot.time) : Infinity)));
  res.json({ doctors: list, total: db.table('doctors').length });
});

router.get('/doctors/:id', (req, res) => {
  const d = db.byId('doctors', req.params.id);
  if (!d) return res.status(404).json({ error: 'ไม่พบแพทย์' });
  const today = T.dateKey();
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = T.addDays(today, i);
    days.push({ date, label: L.thaiShortDate(date), dow: T.dowOf(date), slots: L.slotsFor(d, date) });
  }
  res.json({ doctor: L.doctorView(d), days });
});

const PHARM_FILTERS = {
  open24: (p) => p.open24,
  fast: (p) => p.deliveryMins < 60 && p.openNow,
  standby: (p) => p.standby && p.openNow,
  rx: (p) => p.rxClinic || p.hasDoctor,
  near: (p) => p.distanceKm != null && p.distanceKm < 3,
  open: (p) => p.openNow,
};
router.get('/pharmacies', (req, res) => {
  const q = str(req.query.q, 100).toLowerCase();
  let list = db.table('pharmacies').map((p) => L.pharmacyView(p, req.user));
  if (q) list = list.filter((p) => [p.name, p.address, p.description, p.pharmacist.name, p.code].join(' ').toLowerCase().includes(q));
  String(req.query.filters || '').split(',').filter((f) => PHARM_FILTERS[f]).forEach((f) => { list = list.filter(PHARM_FILTERS[f]); });
  list.sort((a, b) => (b.openNow - a.openNow) || (a.distanceKm - b.distanceKm));
  res.json({ pharmacies: list, total: db.table('pharmacies').length });
});

router.get('/pharmacies/:id', (req, res) => {
  const p = db.byId('pharmacies', req.params.id);
  if (!p) return res.status(404).json({ error: 'ไม่พบร้านยา' });
  res.json({ pharmacy: L.pharmacyView(p, req.user) });
});

router.get('/search', (req, res) => {
  const q = str(req.query.q, 100).toLowerCase();
  if (!q) return res.json({ doctors: [], pharmacies: [], specialties: [], medicines: [] });
  const doctors = db.table('doctors').filter((d) => [d.name, d.specialtyLabel, d.subtitle, d.focus].join(' ').toLowerCase().includes(q)).slice(0, 5).map(L.doctorView);
  const pharmacies = db.table('pharmacies').filter((p) => [p.name, p.address, p.description].join(' ').toLowerCase().includes(q)).slice(0, 5).map((p) => L.pharmacyView(p, req.user));
  const specialties = SPECIALTIES.filter((s) => s.label.toLowerCase().includes(q) || s.keywords.some((k) => q.includes(k) || k.includes(q))).map(({ keywords, ...s }) => s);
  const medicines = MEDICINES.filter((m) => [m.name, m.thai, m.purpose].join(' ').toLowerCase().includes(q)).slice(0, 5);
  res.json({ doctors, pharmacies, specialties, medicines });
});

// ===================================================================== payments
router.get('/payments/promptpay', (req, res) => {
  const amount = Math.max(0, Number(req.query.amount) || 0);
  res.json({ payload: pay.promptPayPayload(PROMPTPAY_ID(), amount), amount, account: PROMPTPAY_ID().replace(/(\d{3})(\d{3})(\d+)/, '$1-xxx-$3'), merchant: 'TeleCare Terra Co., Ltd.' });
});

// ===================================================================== appointments
function appointmentView(a) {
  const d = db.byId('doctors', a.doctorId);
  const start = T.toTs(a.date, a.time);
  return { ...a, doctor: d && { id: d.id, name: d.name, photo: d.photo, specialtyLabel: d.specialtyLabel, duration: d.duration },
    startsAt: start, dateLabel: L.thaiShortDate(a.date), joinable: a.status === 'booked' && Date.now() > start - 10 * MIN && Date.now() < start + 60 * MIN };
}

router.get('/appointments', requireAuth, (req, res) => {
  const list = db.filter('appointments', (a) => a.userId === req.user.id).map(appointmentView).sort((a, b) => a.startsAt - b.startsAt);
  res.json({ appointments: list });
});

router.post('/appointments', requireAuth, wrap(async (req, res) => {
  const d = db.byId('doctors', req.body.doctorId);
  if (!d) throw fail(404, 'ไม่พบแพทย์');
  const date = str(req.body.date, 10);
  const time = str(req.body.time, 5);
  const slot = L.slotsFor(d, date).find((s) => s.time === time);
  if (!slot) throw fail(400, 'ช่วงเวลานี้ไม่เปิดให้จอง');
  if (!slot.available) throw fail(409, 'ช่วงเวลานี้ถูกจองแล้ว กรุณาเลือกเวลาอื่น');
  const fee = L.membershipActive(req.user) ? 0 : d.fee;
  const payment = pay.processPayment(req.body.payment, fee);
  const a = db.insert('appointments', {
    id: 'AP-' + db.nextNumber('appointment', 5000), userId: req.user.id, doctorId: d.id, date, time,
    mode: req.body.mode === 'chat' ? 'chat' : 'video', complaint: str(req.body.complaint, 500), status: 'booked', fee, payment, createdAt: Date.now(),
  });
  L.notify(req.user.id, { icon: 'event_available', title: 'จองนัดหมายสำเร็จ', body: `${d.name} • ${L.thaiShortDate(date)} เวลา ${time} น.`, link: '/doctors?appointments=1' });
  if (d.userId) L.notify(d.userId, { icon: 'event', title: 'มีนัดหมายใหม่', body: `${req.user.name} • ${L.thaiShortDate(date)} ${time} น.`, link: '/provider' });
  res.status(201).json({ appointment: appointmentView(a) });
}));

router.post('/appointments/:id/cancel', requireAuth, wrap(async (req, res) => {
  const a = db.byId('appointments', req.params.id);
  if (!a || a.userId !== req.user.id) throw fail(404, 'ไม่พบนัดหมาย');
  if (a.status !== 'booked') throw fail(400, 'ไม่สามารถยกเลิกนัดหมายนี้ได้');
  if (T.toTs(a.date, a.time) - Date.now() < 60 * MIN) throw fail(400, 'ยกเลิกได้ก่อนเวลานัดอย่างน้อย 1 ชั่วโมง');
  a.status = 'cancelled';
  if (a.payment && a.payment.status === 'paid' && a.fee > 0) a.payment.refund = { status: 'refunded', at: Date.now() };
  db.save();
  res.json({ appointment: appointmentView(a) });
}));

router.post('/appointments/:id/start', requireAuth, wrap(async (req, res) => {
  const a = db.byId('appointments', req.params.id);
  if (!a || a.userId !== req.user.id) throw fail(404, 'ไม่พบนัดหมาย');
  if (!appointmentView(a).joinable) throw fail(400, 'เข้าห้องตรวจได้ก่อนเวลานัด 10 นาที');
  if (a.consultationId) return res.json({ consultation: { id: a.consultationId, mode: a.mode } });
  const c = createConsultation(req.user, { providerType: 'doctor', doctorId: a.doctorId, mode: a.mode, complaint: a.complaint, prepaid: true });
  a.consultationId = c.id;
  a.status = 'completed';
  db.save();
  res.json({ consultation: { id: c.id, mode: c.mode } });
}));

// ===================================================================== consultations
function createConsultation(user, b) {
  const providerType = b.providerType === 'pharmacist' ? 'pharmacist' : 'doctor';
  let doctor = null;
  let pharmacy = null;
  if (providerType === 'doctor') {
    doctor = db.byId('doctors', b.doctorId);
    if (!doctor) throw fail(404, 'ไม่พบแพทย์');
    if (!b.prepaid && !L.doctorView(doctor).availableNow) throw fail(409, 'แพทย์ไม่ว่างในขณะนี้ กรุณาจองเวลานัดหมาย');
  }
  pharmacy = db.byId('pharmacies', b.pharmacyId || user.preferredPharmacyId) || nearestPharmacy(user);
  if (providerType === 'pharmacist' && !L.pharmacyOpen(pharmacy)) throw fail(409, 'ร้านยานี้ปิดทำการแล้ว กรุณาเลือกร้านที่เปิดอยู่');
  const member = L.membershipActive(user);
  const fee = providerType === 'doctor' && !b.prepaid && !member ? doctor.fee : 0;
  const payment = b.prepaid ? { method: 'appointment', status: 'paid', amount: 0 } : pay.processPayment(b.payment, fee);
  const durationMins = providerType === 'doctor' ? (member ? 60 : doctor.duration) : (member ? 60 : 15);
  const vitals = b.vitals || {};
  const now = Date.now();
  const c = db.insert('consultations', {
    id: `TC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, userId: user.id, providerType,
    doctorId: doctor ? doctor.id : null, pharmacyId: pharmacy ? pharmacy.id : null, mode: b.mode === 'video' ? 'video' : 'chat',
    status: 'active', startedAt: now, durationMins, fee, payment,
    complaint: str(b.complaint, 600), vitals: { temp: str(vitals.temp, 6), bp: str(vitals.bp, 9), pulse: str(vitals.pulse, 4) },
    note: '', messages: [{ id: db.id('m_'), from: 'system', type: 'text', text: 'เริ่มการปรึกษาทางไกลแบบปลอดภัย ข้อมูลได้รับการปกป้องตาม พ.ร.บ. สุขภาพ', at: now, read: true }],
    prescription: null, roomCode: `TC-${crypto.randomInt(1000, 9999)}-TERRA`,
  });
  if (c.complaint) {
    c.messages.push({ id: db.id('m_'), from: 'patient', type: 'text', text: `อาการเบื้องต้น: ${c.complaint}`, at: now + 1, read: false });
    db.save();
  }
  const providerUid = C.providerUserId(c);
  if (providerUid) L.notify(providerUid, { icon: 'support_agent', title: 'มีผู้ป่วยรอรับการปรึกษา', body: `${user.name} • ${c.mode === 'video' ? 'วิดีโอคอล' : 'แชท'}`, link: `/${c.mode === 'video' ? 'video' : 'consult'}/${c.id}` });
  bot.onConsultationStarted(c);
  return c;
}

function nearestPharmacy(user) {
  const list = db.table('pharmacies').map((p) => L.pharmacyView(p, user)).sort((a, b) => (b.openNow - a.openNow) || (a.distanceKm - b.distanceKm));
  return db.byId('pharmacies', list[0].id);
}

function getConsultation(req) {
  const c = db.byId('consultations', req.params.id);
  if (!c || !C.canAccess(req.user, c)) throw fail(404, 'ไม่พบการปรึกษา');
  return c;
}
const roleIn = (req, c) => (req.user.id === c.userId ? 'patient' : 'provider');

router.get('/consultations', requireAuth, (req, res) => {
  const list = db.table('consultations').filter((c) => C.canAccess(req.user, c))
    .sort((a, b) => b.startedAt - a.startedAt).map((c) => {
      const v = C.consultationView(c, req.user);
      const last = c.messages[c.messages.length - 1];
      return { id: v.id, status: v.status, mode: v.mode, providerType: v.providerType, provider: v.provider, patient: { name: v.patient.name, avatar: v.patient.avatar }, startedAt: v.startedAt, endedAt: v.endedAt, complaint: v.complaint, summary: v.summary || v.note, unread: v.unread, lastMessage: last && (last.type === 'rx' ? 'ใบสั่งยาอิเล็กทรอนิกส์' : last.type === 'image' ? 'รูปภาพ' : last.text), remainingSeconds: v.remainingSeconds };
    });
  res.json({ consultations: list });
});

router.post('/consultations', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'patient') throw fail(403, 'บัญชีผู้ให้บริการไม่สามารถเปิดการปรึกษาได้');
  const c = createConsultation(req.user, req.body);
  res.status(201).json({ consultation: C.consultationView(c, req.user) });
}));

router.get('/consultations/:id', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  if (c.status === 'active' && C.consultationView(c).remainingSeconds === 0) C.endConsultation(c, 'system');
  res.json({ consultation: C.consultationView(c, req.user) });
}));

router.post('/consultations/:id/messages', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  if (c.status !== 'active') throw fail(400, 'การปรึกษานี้สิ้นสุดแล้ว');
  const from = roleIn(req, c);
  let m;
  if (req.body.dataUrl) {
    const file = saveDataUrl(req.user.id, req.body.dataUrl, req.body.fileName || 'attachment', { consultationId: c.id });
    const isImage = file.mime.startsWith('image/');
    const isAudio = file.mime.startsWith('audio/');
    m = C.addMessage(c, from, { type: isImage ? 'image' : isAudio ? 'audio' : 'file', imageUrl: isImage ? `/api/files/${file.id}` : undefined, fileUrl: `/api/files/${file.id}`, fileName: file.name, text: str(req.body.text, 1000) });
  } else {
    const text = str(req.body.text, 2000);
    if (!text) throw fail(400, 'กรุณาพิมพ์ข้อความ');
    m = C.addMessage(c, from, { text });
  }
  if (from === 'patient') bot.onPatientMessage(c, m);
  res.status(201).json({ message: m });
}));

router.post('/consultations/:id/read', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  const other = roleIn(req, c) === 'patient' ? 'provider' : 'patient';
  let changed = false;
  c.messages.forEach((m) => { if (m.from === other && !m.read) { m.read = true; changed = true; } });
  if (changed) { db.save(); C.broadcast(c, 'read', { consultationId: c.id, by: roleIn(req, c) }); }
  res.json({ ok: true });
}));

router.post('/consultations/:id/typing', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  C.participants(c).filter((u) => u !== req.user.id).forEach((u) => realtime.send(u, 'typing', { consultationId: c.id }));
  res.json({ ok: true });
}));

router.post('/consultations/:id/end', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  C.endConsultation(c, roleIn(req, c));
  res.json({ consultation: C.consultationView(c, req.user) });
}));

router.post('/consultations/:id/mode', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  if (c.status !== 'active') throw fail(400, 'การปรึกษานี้สิ้นสุดแล้ว');
  c.mode = req.body.mode === 'video' ? 'video' : 'chat';
  db.save();
  C.broadcast(c, 'consultation', { consultationId: c.id, mode: c.mode });
  res.json({ consultation: C.consultationView(c, req.user) });
}));

router.post('/consultations/:id/vitals', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  c.vitals = { temp: str(req.body.temp, 6), bp: str(req.body.bp, 9), pulse: str(req.body.pulse, 4) };
  if (req.body.complaint != null) c.complaint = str(req.body.complaint, 600);
  db.save();
  C.broadcast(c, 'consultation', { consultationId: c.id });
  res.json({ consultation: C.consultationView(c, req.user) });
}));

router.post('/consultations/:id/signal', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  const delivered = C.participants(c).filter((u) => u !== req.user.id)
    .reduce((n, u) => n + realtime.send(u, 'rtc', { consultationId: c.id, from: roleIn(req, c), kind: str(req.body.kind, 20), data: req.body.data }), 0);
  res.json({ ok: true, delivered });
}));

// provider-only actions
function requireConsultProvider(req, c) {
  if (roleIn(req, c) !== 'provider') throw fail(403, 'เฉพาะผู้ให้บริการเท่านั้น');
  if (c.status !== 'active') throw fail(400, 'การปรึกษานี้สิ้นสุดแล้ว');
}

router.post('/consultations/:id/note', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  requireConsultProvider(req, c);
  C.setNote(c, req.body.note);
  res.json({ consultation: C.consultationView(c, req.user) });
}));

router.post('/consultations/:id/prescription', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  requireConsultProvider(req, c);
  C.issuePrescription(c, req.body.items, req.body.note);
  res.json({ consultation: C.consultationView(c, req.user) });
}));

router.post('/consultations/:id/certificate', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  requireConsultProvider(req, c);
  if (c.providerType !== 'doctor') throw fail(403, 'ใบรับรองแพทย์ออกได้โดยแพทย์เท่านั้น');
  c.certificate = { issuedAt: Date.now(), restDays: Math.min(30, Math.max(0, parseInt(req.body.restDays, 10) || 0)), text: str(req.body.text, 600) };
  db.save();
  C.addMessage(c, 'provider', { text: `ออกใบรับรองแพทย์อิเล็กทรอนิกส์แล้ว${c.certificate.restDays ? ` (พักรักษาตัว ${c.certificate.restDays} วัน)` : ''} ดาวน์โหลดได้หลังจบการปรึกษา` });
  res.json({ consultation: C.consultationView(c, req.user) });
}));

router.post('/consultations/:id/confirm-rx', requireAuth, wrap(async (req, res) => {
  const c = getConsultation(req);
  if (roleIn(req, c) !== 'patient') throw fail(403, 'เฉพาะผู้ป่วยเท่านั้น');
  if (!c.prescription) throw fail(400, 'ยังไม่มีใบสั่งยา');
  if (c.prescription.orderId) return res.json({ order: L.orderView(db.byId('orders', c.prescription.orderId)) });
  const order = createOrder(req.user, {
    items: c.prescription.items, pharmacyId: req.body.pharmacyId || c.pharmacyId, payment: req.body.payment,
    consultationId: c.id, note: str(req.body.note, 200), kind: 'telepharmacy',
  });
  c.prescription.status = 'confirmed';
  c.prescription.orderId = order.id;
  db.save();
  C.addMessage(c, 'system', { text: `ยืนยันใบสั่งยาแล้ว ส่งต่อ ${order.pharmacy.name} • คำสั่งซื้อ #${order.id}`, read: true });
  res.status(201).json({ order });
}));

// ===================================================================== orders
function quote(user, items, pharmacyId) {
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const member = L.membershipActive(user);
  const discount = member ? Math.round(subtotal * 0.15) : 0;
  const deliveryFee = member || subtotal >= 200 ? 0 : 30;
  const deliveryNote = member ? 'ฟรี (สิทธิ์สมาชิก Terra Care+)' : deliveryFee === 0 ? 'ฟรี (ยอดเกิน ฿200)' : '฿30';
  const pharmacy = db.byId('pharmacies', pharmacyId);
  return { subtotal, discount, deliveryFee, deliveryNote, total: subtotal - discount + deliveryFee, pharmacy };
}

function createOrder(user, { items, pharmacyId, payment, consultationId = null, refill = false, note = '', kind = 'telepharmacy' }) {
  const pharmacy = db.byId('pharmacies', pharmacyId || user.preferredPharmacyId) || nearestPharmacy(user);
  if (!pharmacy) throw fail(404, 'ไม่พบร้านยา');
  const q = quote(user, items, pharmacy.id);
  const pm = pay.processPayment(payment, q.total, { allowCod: true });
  const now = Date.now();
  const yymm = T.dateKey(now).slice(2, 7).replace('-', '');
  const dest = user.address || user.location || L.DEFAULT_LOCATION;
  const riders = db.state.meta.riders || [];
  const order = db.insert('orders', {
    id: `MED-${yymm}-${String(db.nextNumber('order', 100)).padStart(3, '0')}`, userId: user.id, pharmacyId: pharmacy.id, consultationId, kind, refill,
    items, subtotal: q.subtotal, discount: q.discount, deliveryFee: q.deliveryFee, deliveryNote: q.deliveryNote, total: q.total,
    payment: pm, address: dest, note, createdAt: now, etaMins: pharmacy.deliveryMins,
    distanceKm: Math.max(0.4, L.distanceKm(pharmacy, dest) || 1.5), rider: riders[crypto.randomInt(0, Math.max(1, riders.length))] || null,
    pointsEarned: Math.floor(q.total / 10), verifiedBy: pharmacy.pharmacist.name, bagTemp: Math.round((21 + Math.random() * 2.5) * 10) / 10,
  });
  db.update('users', user.id, { points: (user.points || 0) + order.pointsEarned });
  // Keep the medication schedule in sync with what was dispensed.
  const today = T.dateKey(now);
  items.forEach((it) => {
    const med = medicineById(it.medId);
    if (!med || !med.slot) return;
    const existing = db.find('medications', (m) => m.userId === user.id && m.medId === med.id && m.active);
    const supply = med.chronic ? (med.supplyDays || 30) : 5;
    if (existing) Object.assign(existing, { startDate: today, supplyDays: supply });
    else {
      db.insert('medications', {
        id: db.id('med_'), userId: user.id, medId: med.id, name: med.name, dose: '1 เม็ด', purpose: med.purpose, slot: med.slot,
        time: { morning: '08:00', noon: '12:30', evening: '19:00', bedtime: '21:30' }[med.slot], note: med.prn ? 'เฉพาะเมื่อมีอาการ' : 'หลังอาหาร',
        chronic: Boolean(med.chronic), supplyDays: supply, startDate: today, active: true,
      });
    }
  });
  db.save();
  L.notify(user.id, { icon: 'receipt_long', title: `สั่งยาสำเร็จ #${order.id}`, body: `${pharmacy.name} • ยอดชำระ ฿${order.total.toLocaleString()}`, link: `/orders?id=${order.id}` });
  if (pharmacy.pharmacistUserId) L.notify(pharmacy.pharmacistUserId, { icon: 'inventory_2', title: 'มีคำสั่งซื้อใหม่', body: `#${order.id} • ${user.name}`, link: '/provider' });
  return L.orderView(order);
}

router.get('/orders', requireAuth, (req, res) => {
  res.json({ orders: db.filter('orders', (o) => o.userId === req.user.id).sort((a, b) => b.createdAt - a.createdAt).map(L.orderView) });
});

router.get('/orders/quote', requireAuth, wrap(async (req, res) => {
  const items = String(req.query.items || '').split(',').filter(Boolean).map((id) => C.buildItems(req.user, [{ medId: id }])[0]);
  const q = quote(req.user, items, req.query.pharmacyId);
  res.json({ ...q, pharmacy: q.pharmacy && { id: q.pharmacy.id, name: q.pharmacy.name } });
}));

router.get('/orders/:id', requireAuth, (req, res) => {
  const o = db.byId('orders', req.params.id);
  if (!o || o.userId !== req.user.id) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  res.json({ order: L.orderView(o) });
});

router.post('/orders', requireAuth, wrap(async (req, res) => {
  const items = C.buildItems(req.user, req.body.items);
  // Prescription-only medicines need a prescription (consultation) or must be an existing chronic regimen.
  const regimenIds = new Set(db.filter('medications', (m) => m.userId === req.user.id && m.active).map((m) => m.medId));
  const rxOnly = items.find((i) => { const m = medicineById(i.medId); return (m.controlled || m.chronic) && !regimenIds.has(m.id); });
  if (rxOnly) throw fail(400, `${rxOnly.name} ต้องมีใบสั่งยาจากแพทย์ กรุณาปรึกษาแพทย์หรือเภสัชกรก่อน`);
  const order = createOrder(req.user, { items, pharmacyId: req.body.pharmacyId, payment: req.body.payment, refill: Boolean(req.body.refill), note: str(req.body.note, 200), kind: req.body.refill ? 'refill' : 'otc' });
  res.status(201).json({ order });
}));

router.post('/orders/:id/reorder', requireAuth, wrap(async (req, res) => {
  const o = db.byId('orders', req.params.id);
  if (!o || o.userId !== req.user.id) throw fail(404, 'ไม่พบคำสั่งซื้อ');
  const items = C.buildItems(req.user, o.items.filter((i) => medicineById(i.medId)).map((i) => ({ medId: i.medId, qty: i.qty })));
  const regimenIds = new Set(db.filter('medications', (m) => m.userId === req.user.id && m.active).map((m) => m.medId));
  const controlled = items.find((i) => medicineById(i.medId).controlled && !regimenIds.has(i.medId));
  if (controlled) throw fail(400, `${controlled.name} เป็นยาควบคุม ต้องได้รับใบสั่งยาใหม่จากแพทย์ก่อนสั่งซ้ำ`);
  const order = createOrder(req.user, { items, pharmacyId: req.body.pharmacyId || o.pharmacyId, payment: req.body.payment, refill: o.refill, note: 'สั่งซ้ำจาก #' + o.id, kind: 'reorder' });
  res.status(201).json({ order });
}));

router.post('/orders/:id/cancel', requireAuth, wrap(async (req, res) => {
  const o = db.byId('orders', req.params.id);
  if (!o || o.userId !== req.user.id) throw fail(404, 'ไม่พบคำสั่งซื้อ');
  const st = L.orderStatus(o).stage;
  if (!['verify', 'pack'].includes(st)) throw fail(400, 'ไรเดอร์รับยาแล้ว ไม่สามารถยกเลิกได้ กรุณาติดต่อสายด่วน');
  o.status = 'cancelled';
  o.cancelledAt = Date.now();
  if (o.payment.status === 'paid') o.payment.refund = { status: 'refunded', at: Date.now(), amount: o.total };
  db.update('users', req.user.id, { points: Math.max(0, (req.user.points || 0) - (o.pointsEarned || 0)) });
  db.save();
  L.notify(req.user.id, { icon: 'cancel', title: `ยกเลิกคำสั่งซื้อ #${o.id}`, body: o.payment.refund ? 'ระบบจะคืนเงินภายใน 3-7 วันทำการ' : '', link: `/orders?id=${o.id}` });
  res.json({ order: L.orderView(o) });
}));

router.post('/orders/:id/report', requireAuth, wrap(async (req, res) => {
  const o = db.byId('orders', req.params.id);
  if (!o || o.userId !== req.user.id) throw fail(404, 'ไม่พบคำสั่งซื้อ');
  const t = createTicket(req.user, { topic: req.body.topic || 'ปัญหาคำสั่งซื้อ', message: req.body.message, orderId: o.id });
  res.status(201).json({ ticket: t });
}));

// ===================================================================== support
function createTicket(user, { topic, message, orderId = null }) {
  const msg = str(message, 2000);
  if (msg.length < 5) throw fail(400, 'กรุณาอธิบายปัญหาอย่างน้อย 5 ตัวอักษร');
  const t = db.insert('tickets', { id: 'TK-' + db.nextNumber('ticket', 1000), userId: user ? user.id : null, topic: str(topic, 120), message: msg, orderId, status: 'open', createdAt: Date.now() });
  if (user) L.notify(user.id, { icon: 'support_agent', title: `รับเรื่องแล้ว ${t.id}`, body: 'เจ้าหน้าที่จะติดต่อกลับภายใน 15 นาที', link: '' });
  return t;
}
router.post('/support', wrap(async (req, res) => {
  const t = createTicket(req.user, { topic: req.body.topic, message: `${req.body.message || ''}${req.user ? '' : `\nติดต่อกลับ: ${str(req.body.contact, 120)}`}` });
  res.status(201).json({ ticket: t });
}));

// ===================================================================== records
function recordView(r) {
  const order = r.orderId ? db.byId('orders', r.orderId) : null;
  return { ...r, order: order ? L.orderView(order) : null };
}

router.get('/records', requireAuth, (req, res) => {
  const list = db.filter('records', (r) => r.userId === req.user.id).sort((a, b) => b.createdAt - a.createdAt).map(recordView);
  res.json({ records: list });
});

router.get('/records/:id', requireAuth, (req, res) => {
  const r = db.byId('records', req.params.id);
  if (!r || r.userId !== req.user.id) return res.status(404).json({ error: 'ไม่พบเวชระเบียน' });
  res.json({ record: recordView(r) });
});

router.post('/records/upload', requireAuth, wrap(async (req, res) => {
  const title = str(req.body.title, 120) || 'เอกสารที่อัปโหลด';
  const file = saveDataUrl(req.user.id, req.body.dataUrl, req.body.fileName || title);
  const r = db.insert('records', {
    id: 'UP-' + db.nextNumber('upload', 1000), userId: req.user.id, kind: 'upload', title, createdAt: Date.now(),
    category: str(req.body.category, 40) || 'ผลตรวจ', summary: str(req.body.note, 500), fileUrl: `/api/files/${file.id}`, fileMime: file.mime, fileName: file.name,
    provider: { name: req.user.name, role: 'ผู้ป่วยอัปโหลด' }, items: [],
  });
  res.status(201).json({ record: recordView(r) });
}));

// ===================================================================== medications
function regimen(user) {
  const today = T.dateKey();
  return db.filter('medications', (m) => m.userId === user.id && m.active).map((m) => {
    const end = T.addDays(m.startDate, m.supplyDays);
    const daysLeft = Math.round((T.toTs(end) - T.toTs(today)) / DAY);
    const intake = db.find('intakes', (i) => i.medicationId === m.id && i.date === today);
    return { ...m, daysLeft, finished: daysLeft <= 0, takenAt: intake ? intake.takenAt : null };
  }).filter((m) => m.chronic || !m.finished);
}

router.get('/medications/today', requireAuth, (req, res) => {
  const meds = regimen(req.user);
  const lowSupply = meds.filter((m) => m.chronic && m.daysLeft <= 7);
  const snoozed = req.user.refillSnoozeUntil && req.user.refillSnoozeUntil > Date.now();
  res.json({ date: T.dateKey(), dateLabel: L.thaiShortDate(T.dateKey()), medications: meds, refill: snoozed ? [] : lowSupply });
});

router.post('/medications/:id/intake', requireAuth, wrap(async (req, res) => {
  const m = db.byId('medications', req.params.id);
  if (!m || m.userId !== req.user.id) throw fail(404, 'ไม่พบรายการยา');
  const today = T.dateKey();
  db.remove('intakes', (i) => i.medicationId === m.id && i.date === today);
  if (req.body.taken) db.insert('intakes', { id: db.id('in_'), userId: req.user.id, medicationId: m.id, date: today, takenAt: Date.now() });
  res.json({ medication: regimen(req.user).find((x) => x.id === m.id) });
}));

router.post('/medications/refill', requireAuth, wrap(async (req, res) => {
  const meds = regimen(req.user).filter((m) => m.chronic && (!req.body.medicationId || m.id === req.body.medicationId));
  if (!meds.length) throw fail(400, 'ไม่มียาประจำที่ต้องเติม');
  const items = C.buildItems(req.user, meds.map((m) => ({ medId: m.medId })));
  const order = createOrder(req.user, { items, pharmacyId: req.body.pharmacyId, payment: req.body.payment, refill: true, note: 'คำสั่งซื้อยาโรคประจำตัว รอบ 30 วัน', kind: 'refill' });
  db.update('users', req.user.id, { refillSnoozeUntil: null });
  res.status(201).json({ order });
}));

router.post('/medications/snooze', requireAuth, (req, res) => {
  db.update('users', req.user.id, { refillSnoozeUntil: Date.now() + DAY });
  res.json({ ok: true });
});

router.get('/medications/reminders.ics', requireAuth, (req, res) => {
  const meds = regimen(req.user);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const today = T.dateKey().replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TeleCare Terra//Medication Reminders//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Bangkok', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:ICT', 'END:STANDARD', 'END:VTIMEZONE'];
  meds.forEach((m) => {
    const count = m.chronic ? '' : `;COUNT=${Math.max(1, m.daysLeft)}`;
    lines.push('BEGIN:VEVENT', `UID:${m.id}@telecare.terra`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Asia/Bangkok:${today}T${m.time.replace(':', '')}00`,
      `RRULE:FREQ=DAILY${count}`, `SUMMARY:ทานยา ${m.name} (${m.dose})`, `DESCRIPTION:${m.purpose || ''} • ${m.note || ''}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:ถึงเวลาทานยา ${m.name}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="telecare-medication-reminders.ics"');
  res.send(lines.join('\r\n'));
});

// ===================================================================== vitals
router.get('/vitals', requireAuth, (req, res) => {
  const list = db.filter('vitals', (v) => v.userId === req.user.id && (!req.query.type || v.type === req.query.type)).sort((a, b) => a.at - b.at);
  res.json({ vitals: list });
});

router.post('/vitals', requireAuth, wrap(async (req, res) => {
  const s = parseInt(req.body.systolic, 10);
  const d = parseInt(req.body.diastolic, 10);
  if (!(s >= 60 && s <= 260 && d >= 30 && d <= 160 && s > d)) throw fail(400, 'ค่าความดันไม่ถูกต้อง (เช่น 120/80)');
  const pulse = parseInt(req.body.pulse, 10);
  const v = db.insert('vitals', { id: db.id('v_'), userId: req.user.id, type: 'bp', systolic: s, diastolic: d, pulse: pulse > 0 ? pulse : null, at: Date.now() });
  res.status(201).json({ vital: v });
}));

// ===================================================================== notifications
router.get('/notifications', requireAuth, (req, res) => {
  const list = db.filter('notifications', (n) => n.userId === req.user.id).sort((a, b) => b.at - a.at).slice(0, 30);
  res.json({ notifications: list, unread: list.filter((n) => !n.read).length });
});

router.post('/notifications/read-all', requireAuth, (req, res) => {
  db.filter('notifications', (n) => n.userId === req.user.id).forEach((n) => { n.read = true; });
  db.save();
  res.json({ ok: true });
});

// ===================================================================== membership
const PLAN_PRICE = 1200;
router.get('/membership', requireAuth, (req, res) => {
  res.json({ membership: req.user.membership, active: L.membershipActive(req.user), price: PLAN_PRICE });
});

router.post('/membership/subscribe', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'patient') throw fail(403, 'เฉพาะผู้ใช้งานทั่วไป');
  const m = req.user.membership;
  if (L.membershipActive(req.user) && !m.cancelAtPeriodEnd) throw fail(409, 'คุณเป็นสมาชิก Terra Care+ อยู่แล้ว');
  if (L.membershipActive(req.user) && m.cancelAtPeriodEnd) {
    m.cancelAtPeriodEnd = false;
    db.save();
    return res.json({ user: L.userView(req.user) });
  }
  const payment = pay.processPayment(req.body.payment, PLAN_PRICE);
  const now = Date.now();
  const membership = { plan: 'care-plus', price: PLAN_PRICE, startedAt: now, expiresAt: now + 30 * DAY, cancelAtPeriodEnd: false, payments: [payment] };
  db.update('users', req.user.id, { membership });
  L.notify(req.user.id, { icon: 'workspace_premium', title: 'ยินดีต้อนรับสู่ Terra Care+', body: 'สิทธิ์ปรึกษาแพทย์ไม่จำกัด 60 นาที/ครั้ง ส่งยาฟรี และส่วนลดยา 15% เริ่มใช้ได้ทันที', link: '/care-plus' });
  res.json({ user: L.userView(db.byId('users', req.user.id)) });
}));

router.post('/membership/cancel', requireAuth, wrap(async (req, res) => {
  if (!L.membershipActive(req.user)) throw fail(400, 'คุณยังไม่ได้เป็นสมาชิก');
  req.user.membership.cancelAtPeriodEnd = true;
  db.save();
  res.json({ user: L.userView(req.user) });
}));

// ===================================================================== provider console
router.get('/provider/queue', requireProvider, (req, res) => {
  const mine = db.table('consultations').filter((c) => C.canAccess(req.user, c));
  const consultations = mine.sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1) || b.startedAt - a.startedAt).slice(0, 50)
    .map((c) => { const v = C.consultationView(c, req.user); return { id: v.id, status: v.status, mode: v.mode, patient: v.patient, complaint: v.complaint, startedAt: v.startedAt, unread: v.unread, remainingSeconds: v.remainingSeconds, hasRx: Boolean(v.prescription) }; });
  const appointments = req.user.role === 'doctor'
    ? db.filter('appointments', (a) => a.doctorId === req.user.doctorId && a.status === 'booked').map((a) => ({ ...appointmentView(a), patient: (db.byId('users', a.userId) || {}).name })).sort((a, b) => a.startsAt - b.startsAt)
    : [];
  const orders = req.user.role === 'pharmacist'
    ? db.filter('orders', (o) => o.pharmacyId === req.user.pharmacyId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map((o) => ({ ...L.orderView(o), patient: (db.byId('users', o.userId) || {}).name }))
    : [];
  res.json({ consultations, appointments, orders });
});

// ===================================================================== realtime stream
router.get('/stream', requireAuth, (req, res) => {
  if (db.serverless) return res.status(204).end(); // serverless: clients poll /api/events instead
  db.touch(req.user.id);
  realtime.connect(req, res, req.user.id);
});

// Polling fallback for serverless hosting: returns events newer than `since`.
router.get('/events', requireAuth, wrap(async (req, res) => {
  db.touch(req.user.id);
  const since = Number(req.query.since) || 0;
  const all = db.serverless ? await db.readEvents(req.user.id) : [];
  res.setHeader('Cache-Control', 'no-store');
  // First poll only establishes the cursor so old events are not replayed.
  const latest = all.length ? all[all.length - 1].id : 0;
  if (!since) return res.json({ events: [], cursor: Math.max(latest, Date.now() * 1000 - 5e6) });
  const events = all.filter((e) => e.id > since);
  res.json({ events, cursor: Math.max(since, latest) });
}));

// ===================================================================== errors
router.use((req, res) => res.status(404).json({ error: 'ไม่พบ API ที่ร้องขอ' }));
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'ไฟล์ใหญ่เกินกำหนด (สูงสุด 10MB)' });
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: status >= 500 ? 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' : err.message });
});

module.exports = { router, appointmentView };
