'use strict';
// Domain logic shared by the API: availability, distances, order lifecycle, view models.
const db = require('./db');
const T = require('./time');
const realtime = require('./realtime');
const { SPECIALTIES } = require('./catalog');

const MIN = 60 * 1000;
const TIME_SCALE = Math.max(0.01, Number(process.env.ORDER_TIME_SCALE || 1));

// ---------- geo ----------
function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

const DEFAULT_LOCATION = { label: 'ซอยอารีย์ 1, พญาไท, กรุงเทพฯ', lat: 13.7797, lng: 100.5446 };

// ---------- pharmacies ----------
function pharmacyOpen(p, ts = Date.now()) {
  if (p.open24) return true;
  const now = T.minutesOfDay(T.timeKey(ts));
  return now >= T.minutesOfDay(p.openTime) && now < T.minutesOfDay(p.closeTime);
}

function pharmacyView(p, user) {
  const loc = (user && user.location) || DEFAULT_LOCATION;
  const dist = distanceKm(loc, p);
  const open = pharmacyOpen(p);
  let hoursLabel;
  if (p.open24) hoursLabel = 'เปิดตลอด 24 ชม.';
  else if (open) hoursLabel = `เปิดอยู่ • ปิด ${p.closeTime}`;
  else hoursLabel = `ปิดอยู่ • เปิด ${p.openTime}`;
  return {
    ...p, distanceKm: dist, openNow: open, hoursLabel,
    shortHours: p.open24 ? 'เปิด 24 ชม.' : open ? `ปิด ${p.closeTime} น.` : `เปิด ${p.openTime} น.`,
    pharmacistOnline: realtime.isOnline(p.pharmacistUserId),
  };
}

// ---------- doctors ----------
function withinHours(d, ts = Date.now()) {
  const p = T.parts(ts);
  if (!d.schedule.days.includes(p.dow)) return false;
  const now = p.hh * 60 + p.mm;
  return now >= T.minutesOfDay(d.schedule.start) && now < T.minutesOfDay(d.schedule.end);
}

function doctorBusy(doctorId) {
  return db.table('consultations').some((c) => c.doctorId === doctorId && c.status === 'active' && c.mode === 'video');
}

function slotsFor(d, date, ts = Date.now()) {
  if (!d.schedule.days.includes(T.dowOf(date))) return [];
  const step = 30;
  const start = T.minutesOfDay(d.schedule.start);
  const end = T.minutesOfDay(d.schedule.end) - (d.duration || 15);
  const booked = new Set(db.filter('appointments', (a) => a.doctorId === d.id && a.date === date && a.status === 'booked').map((a) => a.time));
  const out = [];
  for (let m = Math.ceil(start / step) * step; m <= end; m += step) {
    const time = `${T.pad(Math.floor(m / 60))}:${T.pad(m % 60)}`;
    if (T.toTs(date, time) < ts + 15 * MIN) continue;
    out.push({ time, available: !booked.has(time) });
  }
  return out;
}

function nextSlot(d, ts = Date.now()) {
  let date = T.dateKey(ts);
  for (let i = 0; i < 14; i += 1) {
    const slot = slotsFor(d, date, ts).find((s) => s.available);
    if (slot) return { date, time: slot.time, today: i === 0 };
    date = T.addDays(date, 1);
  }
  return null;
}

function doctorView(d) {
  const online = withinHours(d) && !doctorBusy(d.id);
  const availableNow = online && (d.instant || realtime.isOnline(d.userId));
  const next = nextSlot(d);
  const spec = SPECIALTIES.find((s) => s.id === d.category);
  return {
    ...d, specialty: spec ? spec.short : d.specialtyLabel, availableNow, providerOnline: realtime.isOnline(d.userId),
    nextSlot: next,
    nextSlotLabel: next ? `${next.today ? 'วันนี้ ' : thaiShortDate(next.date) + ' '}${next.time} น.` : 'ไม่มีคิวว่าง',
    todayHours: d.schedule.days.includes(T.parts().dow) ? `${d.schedule.start} - ${d.schedule.end} น.` : 'วันนี้ไม่เปิดรับสาย',
  };
}

// ---------- dates (Thai) ----------
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiShortDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}

// ---------- membership ----------
function membershipActive(user) {
  const m = user && user.membership;
  return Boolean(m && m.plan === 'care-plus' && m.expiresAt > Date.now());
}

// ---------- users ----------
function ageOf(dob) {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const now = T.parts();
  let years = now.y - y;
  let months = now.m - m;
  if (now.d < d) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  return { years, months };
}

function userView(u) {
  if (!u) return null;
  const { passwordHash, salt, ...rest } = u;
  return {
    ...rest, age: ageOf(u.dob), isMember: membershipActive(u), location: u.location || DEFAULT_LOCATION,
    provider: u.role === 'doctor' ? db.byId('doctors', u.doctorId) : u.role === 'pharmacist' ? db.byId('pharmacies', u.pharmacyId) : null,
  };
}

// ---------- orders ----------
const STAGES = [
  { key: 'verify', label: 'ตรวจใบสั่งยา', icon: 'check' },
  { key: 'pack', label: 'บรรจุยาและติดฉลาก', icon: 'check' },
  { key: 'deliver', label: 'ไรเดอร์กำลังนำส่ง', icon: 'moped' },
  { key: 'done', label: 'ผู้ป่วยรับมอบยา', icon: 'home' },
];

function orderTimeline(o) {
  const eta = (o.etaMins || 40) * MIN * TIME_SCALE;
  return {
    verify: o.createdAt + 3 * MIN * TIME_SCALE,
    pack: o.createdAt + Math.min(8 * MIN * TIME_SCALE, eta * 0.4),
    done: o.createdAt + eta,
  };
}

function orderStatus(o, ts = Date.now()) {
  if (o.status === 'cancelled') {
    const t = orderTimeline(o);
    return {
      stage: 'cancelled', label: 'ยกเลิกแล้ว', active: false, progress: 0, remainingMins: 0, remainingKm: 0, etaAt: t.done, times: t,
      stages: STAGES.map((s) => ({ ...s, at: o.cancelledAt || o.createdAt, done: false, current: false })),
    };
  }
  const t = orderTimeline(o);
  let stage;
  if (ts < t.verify) stage = 'verify';
  else if (ts < t.pack) stage = 'pack';
  else if (ts < t.done) stage = 'deliver';
  else stage = 'done';
  const idx = STAGES.findIndex((s) => s.key === stage);
  const stageTimes = { verify: t.verify, pack: t.pack, deliver: t.pack, done: t.done };
  const rideProgress = stage === 'deliver' ? (ts - t.pack) / (t.done - t.pack) : stage === 'done' ? 1 : 0;
  const remainingMins = stage === 'done' ? 0 : Math.max(1, Math.ceil((t.done - ts) / MIN));
  const labels = {
    verify: 'เภสัชกรกำลังตรวจใบสั่งยา',
    pack: 'กำลังบรรจุยาและติดฉลาก',
    deliver: `กำลังนำส่ง (~${remainingMins} นาที)`,
    done: 'จัดส่งสำเร็จแล้ว',
  };
  return {
    stage, active: stage !== 'done', label: labels[stage], remainingMins,
    progress: Math.min(1, Math.max(0, rideProgress)),
    remainingKm: Math.round((o.distanceKm || 1.5) * (1 - Math.min(1, rideProgress)) * 10) / 10,
    etaAt: t.done, deliveredAt: stage === 'done' ? t.done : null, times: t,
    stages: STAGES.map((s, i) => ({ ...s, at: s.key === 'verify' ? o.createdAt : stageTimes[s.key] , done: i < idx || stage === 'done', current: i === idx && stage !== 'done' })),
  };
}

function orderView(o) {
  const pharmacy = db.byId('pharmacies', o.pharmacyId);
  return { ...o, status: orderStatus(o), pharmacy: pharmacy ? { id: pharmacy.id, name: pharmacy.name, shortName: pharmacy.shortName, phone: pharmacy.phone, pharmacist: pharmacy.pharmacist, lat: pharmacy.lat, lng: pharmacy.lng, address: pharmacy.address } : null };
}

// ---------- notifications ----------
function notify(userId, { icon = 'notifications', title, body = '', link = '' }) {
  const n = db.insert('notifications', { id: db.id('n_'), userId, icon, title, body, link, read: false, at: Date.now() });
  realtime.send(userId, 'notification', n);
  return n;
}

module.exports = {
  distanceKm, DEFAULT_LOCATION, pharmacyOpen, pharmacyView, withinHours, slotsFor, nextSlot, doctorView,
  thaiShortDate, membershipActive, ageOf, userView, orderStatus, orderView, notify, TIME_SCALE, MIN,
};
