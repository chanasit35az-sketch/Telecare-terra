'use strict';
// Consultation operations shared by the HTTP API and the demo responder.
const db = require('./db');
const realtime = require('./realtime');
const L = require('./logic');
const { medicineById } = require('./catalog');

const MIN = 60 * 1000;

function providerUserId(c) {
  if (c.providerType === 'doctor') {
    const d = db.byId('doctors', c.doctorId);
    return d && d.userId;
  }
  const p = db.byId('pharmacies', c.pharmacyId);
  return p && p.pharmacistUserId;
}

function participants(c) {
  return [c.userId, providerUserId(c)].filter(Boolean);
}

function canAccess(user, c) {
  if (!user || !c) return false;
  if (c.userId === user.id) return true;
  if (user.role === 'doctor' && c.providerType === 'doctor' && c.doctorId === user.doctorId) return true;
  if (user.role === 'pharmacist' && c.providerType === 'pharmacist' && c.pharmacyId === user.pharmacyId) return true;
  return false;
}

function providerInfo(c) {
  if (c.providerType === 'doctor') {
    const d = db.byId('doctors', c.doctorId);
    return d && {
      kind: 'doctor', id: d.id, name: d.name, title: d.specialtyLabel, subtitle: d.subtitle, hospital: d.hospital, license: d.license,
      photo: d.photo, videoPhoto: d.videoPhoto || d.photo, rating: d.rating, reviews: d.reviews, responseTime: d.responseTime || '< 2 นาที',
      online: realtime.isOnline(d.userId),
    };
  }
  const p = db.byId('pharmacies', c.pharmacyId);
  return p && {
    kind: 'pharmacist', id: p.id, name: p.pharmacist.name, title: 'เภสัชกรชุมชน', subtitle: p.pharmacist.school, hospital: p.name,
    license: p.pharmacist.license, photo: p.pharmacist.photo, videoPhoto: p.pharmacist.photo, rating: p.rating, reviews: p.reviews,
    responseTime: '< 2 นาที', online: realtime.isOnline(p.pharmacistUserId),
  };
}

function remainingSeconds(c) {
  if (c.status !== 'active') return 0;
  return Math.max(0, Math.round((c.startedAt + c.durationMins * MIN - Date.now()) / 1000));
}

function consultationView(c, viewer) {
  const patient = L.userView(db.byId('users', c.userId));
  const pharmacy = c.pharmacyId ? L.pharmacyView(db.byId('pharmacies', c.pharmacyId), patient) : null;
  const unread = viewer ? c.messages.filter((m) => !m.read && m.from !== (viewer.id === c.userId ? 'patient' : 'provider') && m.from !== 'system').length : 0;
  return {
    ...c,
    provider: providerInfo(c),
    patient: patient && {
      id: patient.id, name: patient.name, title: patient.title, avatar: patient.avatar, camPhoto: patient.camPhoto, hn: patient.hn,
      age: patient.age, gender: patient.gender, bloodType: patient.bloodType, allergies: patient.allergies, conditions: patient.conditions,
      coverage: patient.coverage || patient.insurance, phone: patient.phone,
    },
    pharmacy: pharmacy && {
      id: pharmacy.id, name: pharmacy.name, shortName: pharmacy.shortName, distanceKm: pharmacy.distanceKm, deliveryMins: pharmacy.deliveryMins,
      open24: pharmacy.open24, image: pharmacy.image, lat: pharmacy.lat, lng: pharmacy.lng, phone: pharmacy.phone,
    },
    remainingSeconds: remainingSeconds(c), unread,
    viewerRole: viewer ? (viewer.id === c.userId ? 'patient' : 'provider') : null,
    demoResponder: process.env.DEMO_MODE !== 'false' && !realtime.isOnline(providerUserId(c)),
  };
}

function broadcast(c, event, data) {
  participants(c).forEach((uid) => realtime.send(uid, event, data));
}

function addMessage(c, from, payload) {
  const m = { id: db.id('m_'), from, type: 'text', text: '', at: Date.now(), read: false, ...payload };
  c.messages.push(m);
  db.save();
  broadcast(c, 'message', { consultationId: c.id, message: m });
  if (from !== 'patient' && from !== 'system') {
    L.notify(c.userId, { icon: 'chat', title: `ข้อความใหม่จาก ${providerInfo(c).name}`, body: m.type === 'rx' ? 'ออกใบสั่งยาอิเล็กทรอนิกส์ให้คุณแล้ว' : (m.text || '').slice(0, 80), link: `/consult/${c.id}` });
  }
  return m;
}

function allergyConflict(patient, med) {
  if (!med || !med.allergyGroup || !patient) return null;
  const text = (patient.allergies || []).map((a) => `${a.name} ${a.reaction || ''}`).join(' ').toLowerCase();
  const hit = med.allergyGroup.find((g) => text.includes(g.toLowerCase()));
  return hit ? `${med.name} ขัดกับประวัติแพ้ยา (${hit}) ของผู้ป่วย` : null;
}

function buildItems(patient, items) {
  const out = [];
  for (const it of items || []) {
    const med = medicineById(it.medId);
    if (!med) throw Object.assign(new Error('ไม่พบรายการยาในระบบ'), { status: 400 });
    const conflict = allergyConflict(patient, med);
    if (conflict) throw Object.assign(new Error(conflict), { status: 409 });
    const qty = Math.min(10, Math.max(1, parseInt(it.qty, 10) || 1));
    out.push({
      medId: med.id, name: med.name, thai: med.thai, icon: med.icon, unit: med.unit, qty,
      instructions: (it.instructions || med.instructions).toString().slice(0, 300), price: med.price * qty, controlled: Boolean(med.controlled),
    });
  }
  if (!out.length) throw Object.assign(new Error('กรุณาเลือกยาอย่างน้อย 1 รายการ'), { status: 400 });
  return out;
}

function issuePrescription(c, items, note) {
  const patient = db.byId('users', c.userId);
  c.prescription = { items: buildItems(patient, items), issuedAt: Date.now(), status: 'pending' };
  if (note) c.note = note;
  db.save();
  addMessage(c, 'provider', { type: 'rx', read: false });
  broadcast(c, 'consultation', { consultationId: c.id });
  return c.prescription;
}

function setNote(c, note) {
  c.note = String(note || '').slice(0, 2000);
  db.save();
  broadcast(c, 'note', { consultationId: c.id, note: c.note });
}

function endConsultation(c, by) {
  if (c.status !== 'active') return c;
  c.status = 'ended';
  c.endedAt = Date.now();
  addMessage(c, 'system', { text: by === 'provider' ? 'ผู้ให้บริการสิ้นสุดการปรึกษาแล้ว' : 'สิ้นสุดการปรึกษา ขอบคุณที่ใช้บริการ', read: true });
  const provider = providerInfo(c);
  // Write the consultation into the patient's medical record.
  const kind = c.providerType === 'doctor' ? 'md' : 'pharmacy';
  db.insert('records', {
    id: `${kind === 'md' ? 'MD' : 'RX'}-${new Date().getFullYear()}-${db.nextNumber('record', 6000)}`, userId: c.userId, kind,
    title: c.providerType === 'doctor' ? `ปรึกษาแพทย์ออนไลน์ (${c.mode === 'video' ? 'วิดีโอคอล' : 'แชท'})` : `ปรึกษาเภสัชกรออนไลน์ (${c.mode === 'video' ? 'วิดีโอคอล' : 'แชท'})`,
    createdAt: c.startedAt, provider: { name: provider.name, license: provider.license, role: c.providerType === 'doctor' ? 'แพทย์' : 'เภสัชกร' },
    facility: provider.hospital, consultationId: c.id, complaint: c.complaint, summary: c.note || c.summary || '',
    items: c.prescription ? c.prescription.items : [], orderId: c.prescription && c.prescription.orderId,
    certificate: c.certificate || null, durationMins: Math.max(1, Math.round((c.endedAt - c.startedAt) / MIN)),
  });
  db.save();
  broadcast(c, 'consultation', { consultationId: c.id, status: 'ended' });
  return c;
}

module.exports = {
  providerUserId, participants, canAccess, providerInfo, consultationView, broadcast, addMessage, issuePrescription,
  setNote, endConsultation, buildItems, allergyConflict,
};
