'use strict';
// End-to-end API tests: run with `npm test`. Uses a throw-away data directory.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'telecare-test-'));
process.env.DEMO_MODE = 'true';
const db = require('../server/db');
const { seed } = require('../server/seed');
const { createApp } = require('../server');
const jobs = require('../server/jobs');
const { promptPayPayload } = require('../server/payments');

let server;
let ticker;
let base;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), headers: res.headers };
  };
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b) => call('PUT', u, b), patch: (u, b) => call('PATCH', u, b) };
}

test.before(async () => {
  db.load();
  seed();
  ticker = jobs.startTicker();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  clearInterval(ticker);
  server.close();
  await wait(3500); // let pending demo replies finish writing
  db.flushNow();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('pages are served and protected pages redirect to login', async () => {
  const c = client();
  for (const p of ['/', '/login', '/doctors', '/pharmacies', '/care-plus']) assert.strictEqual((await c.get(p)).status, 200, p);
  const r = await c.get('/records');
  assert.strictEqual(r.status, 302);
  assert.match(r.headers.get('location'), /^\/login\?next=/);
});

test('register, login, logout and validation', async () => {
  const c = client();
  assert.strictEqual((await c.post('/api/auth/register', { name: 'ทดสอบ', identifier: 'x@y.com', password: 'short', acceptTerms: true })).status, 400);
  const r = await c.post('/api/auth/register', { name: 'สมใจ ทดสอบ', identifier: 'somjai@example.com', password: 'password123', acceptTerms: true });
  assert.strictEqual(r.status, 201);
  assert.ok(!('passwordHash' in r.body.user));
  assert.strictEqual((await c.post('/api/auth/register', { name: 'ซ้ำ', identifier: 'somjai@example.com', password: 'password123', acceptTerms: true })).status, 409);
  assert.strictEqual((await c.get('/api/auth/me')).body.user.email, 'somjai@example.com');
  await c.post('/api/auth/logout');
  assert.strictEqual((await c.get('/api/auth/me')).body.user, null);
  assert.strictEqual((await c.post('/api/auth/login', { identifier: 'somjai@example.com', password: 'wrong-pass' })).status, 401);
  assert.strictEqual((await c.post('/api/auth/login', { identifier: 'somjai@example.com', password: 'password123' })).status, 200);
});

test('password reset flow', async () => {
  const c = client();
  const f = await c.post('/api/auth/forgot', { identifier: 'somjai@example.com' });
  const token = new URL(base + f.body.resetLink).searchParams.get('reset');
  assert.strictEqual((await c.post('/api/auth/reset', { token, password: 'newpassword1' })).status, 200);
  assert.strictEqual((await client().post('/api/auth/login', { identifier: 'somjai@example.com', password: 'newpassword1' })).status, 200);
});

test('catalogue: doctors, pharmacies, search', async () => {
  const c = client();
  const d = await c.get('/api/doctors?category=derma');
  assert.ok(d.body.doctors.length >= 2 && d.body.doctors.every((x) => x.category === 'derma'));
  const p = await c.get('/api/pharmacies?filters=open24');
  assert.ok(p.body.pharmacies.every((x) => x.open24));
  const s = await c.get('/api/search?q=' + encodeURIComponent('ผื่น'));
  assert.ok(s.body.specialties.some((x) => x.id === 'derma'));
});

test('pharmacist chat → demo reply → e-prescription → order', async () => {
  const c = client();
  await c.post('/api/auth/login', { identifier: 'demo@telecare.terra', password: 'demo1234' });
  const start = await c.post('/api/consultations', { providerType: 'pharmacist', pharmacyId: 'ph-pure', mode: 'chat', complaint: 'ไอมีเสมหะ เจ็บคอ 2 วัน' });
  assert.strictEqual(start.status, 201);
  const id = start.body.consultation.id;
  await c.post(`/api/consultations/${id}/messages`, { text: 'ไม่มีอาการเหนื่อยหอบครับ' });
  let rx = null;
  for (let i = 0; i < 30 && !rx; i += 1) { await wait(300); rx = (await c.get(`/api/consultations/${id}`)).body.consultation.prescription; }
  assert.ok(rx, 'demo responder issued a prescription');
  assert.ok(!rx.items.some((i) => i.medId === 'amoxicillin'), 'penicillin-allergic patient never gets amoxicillin');
  const o = await c.post(`/api/consultations/${id}/confirm-rx`, { payment: { method: 'card', number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' } });
  assert.strictEqual(o.status, 201);
  assert.strictEqual(o.body.order.payment.last4, '4242');
  assert.strictEqual(o.body.order.status.stage, 'verify');
  const end = await c.post(`/api/consultations/${id}/end`);
  assert.strictEqual(end.body.consultation.status, 'ended');
  assert.ok((await c.get('/api/records')).body.records.some((r) => r.consultationId === id));
});

test('payments: invalid card rejected, PromptPay payload has valid CRC', async () => {
  const c = client();
  await c.post('/api/auth/login', { identifier: 'demo@telecare.terra', password: 'demo1234' });
  const bad = await c.post('/api/orders', { items: [{ medId: 'paracetamol' }], payment: { method: 'card', number: '4242424242424241', expiry: '12/30', cvc: '123' } });
  assert.strictEqual(bad.status, 400);
  const payload = promptPayPayload('0812345678', 225);
  assert.match(payload, /^000201010212/);
  assert.match(payload, /6304[0-9A-F]{4}$/);
});

test('prescription-only medicine cannot be bought over the counter', async () => {
  const c = client();
  await c.post('/api/auth/register', { name: 'ผู้ใช้ใหม่', identifier: '0899999999', password: 'password123', acceptTerms: true });
  const r = await c.post('/api/orders', { items: [{ medId: 'amoxicillin' }], payment: { method: 'cod' } });
  assert.strictEqual(r.status, 400);
  const ok = await c.post('/api/orders', { items: [{ medId: 'ors', qty: 2 }], payment: { method: 'cod' } });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.body.order.deliveryFee, 30);
});

test('appointments: book, double-book blocked, cancel', async () => {
  const c = client();
  await c.post('/api/auth/login', { identifier: 'demo@telecare.terra', password: 'demo1234' });
  const doc = (await c.get('/api/doctors/dr-chanakan')).body;
  const day = doc.days.find((d) => d.slots.some((s) => s.available));
  const slot = day.slots.find((s) => s.available);
  const pay = { method: 'promptpay' };
  const a = await c.post('/api/appointments', { doctorId: 'dr-chanakan', date: day.date, time: slot.time, payment: pay });
  assert.strictEqual(a.status, 201);
  assert.strictEqual((await c.post('/api/appointments', { doctorId: 'dr-chanakan', date: day.date, time: slot.time, payment: pay })).status, 409);
  const cancel = await c.post(`/api/appointments/${a.body.appointment.id}/cancel`);
  if (a.body.appointment.startsAt - Date.now() > 3600e3) assert.strictEqual(cancel.body.appointment.status, 'cancelled');
});

test('membership gives free consults, discount and free delivery', async () => {
  const c = client();
  await c.post('/api/auth/register', { name: 'สมาชิก พลัส', identifier: 'member@example.com', password: 'password123', acceptTerms: true });
  const s = await c.post('/api/membership/subscribe', { payment: { method: 'promptpay' } });
  assert.strictEqual(s.body.user.isMember, true);
  const o = await c.post('/api/orders', { items: [{ medId: 'cetirizine' }], payment: { method: 'cod' } });
  assert.strictEqual(o.body.order.deliveryFee, 0);
  assert.strictEqual(o.body.order.discount, 9);
  const cons = await c.post('/api/consultations', { providerType: 'doctor', doctorId: 'dr-pimmada', mode: 'video', complaint: 'ปวดหัว' });
  if (cons.status === 201) { assert.strictEqual(cons.body.consultation.fee, 0); assert.strictEqual(cons.body.consultation.durationMins, 60); }
  await c.post('/api/membership/cancel');
  assert.strictEqual((await c.get('/api/auth/me')).body.user.membership.cancelAtPeriodEnd, true);
});

test('medication intake, refill and calendar export', async () => {
  const c = client();
  await c.post('/api/auth/login', { identifier: 'demo@telecare.terra', password: 'demo1234' });
  const today = (await c.get('/api/medications/today')).body;
  assert.ok(today.refill.some((m) => m.medId === 'amlodipine'));
  const med = today.medications.find((m) => !m.takenAt);
  assert.ok((await c.post(`/api/medications/${med.id}/intake`, { taken: true })).body.medication.takenAt);
  const ics = await c.get('/api/medications/reminders.ics');
  assert.match(ics.body, /BEGIN:VCALENDAR[\s\S]*RRULE:FREQ=DAILY/);
  const refill = await c.post('/api/medications/refill', { payment: { method: 'cod' } });
  assert.strictEqual(refill.status, 201);
  assert.strictEqual(refill.body.order.refill, true);
});

test('access control: users cannot read each other’s data', async () => {
  const a = client();
  await a.post('/api/auth/register', { name: 'คนอื่น', identifier: 'other@example.com', password: 'password123', acceptTerms: true });
  assert.strictEqual((await a.get('/api/consultations/TC-84920B')).status, 404);
  assert.strictEqual((await a.get('/api/orders/MED-2410-098')).status, 404);
  assert.strictEqual((await a.get('/print/rx/RX-2024-8841')).status, 404);
  assert.strictEqual((await a.get('/api/provider/queue')).status, 403);
});

test('provider console sees the patient queue and can prescribe', async () => {
  const p = client();
  await p.post('/api/auth/login', { identifier: 'teerapat@telecare.terra', password: 'provider1234' });
  const q = await p.get('/api/provider/queue');
  assert.strictEqual(q.status, 200);
  const pt = client();
  await pt.post('/api/auth/login', { identifier: 'demo@telecare.terra', password: 'demo1234' });
  const c = (await pt.post('/api/consultations', { providerType: 'pharmacist', pharmacyId: 'ph-ari', mode: 'chat', complaint: 'ผื่นคันที่แขน' })).body.consultation;
  const blocked = await p.post(`/api/consultations/${c.id}/prescription`, { items: [{ medId: 'amoxicillin' }] });
  assert.strictEqual(blocked.status, 409, 'allergy check blocks amoxicillin');
  const ok = await p.post(`/api/consultations/${c.id}/prescription`, { items: [{ medId: 'cetirizine' }], note: 'ทานก่อนนอน' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await pt.get(`/api/consultations/${c.id}`)).body.consultation.prescription.items[0].medId, 'cetirizine');
});
