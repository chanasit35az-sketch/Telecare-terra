'use strict';
// Demo responder: when DEMO_MODE is on and the doctor/pharmacist is not signed in to the
// provider console, it answers the patient so the whole flow can be tried end to end.
// When a real provider is online, it stays silent.
const db = require('./db');
const realtime = require('./realtime');
const C = require('./consult');
const { medicineById } = require('./catalog');

const enabled = () => process.env.DEMO_MODE !== 'false';

function pickPrescription(c, patient) {
  const t = `${c.complaint || ''} ${c.messages.filter((m) => m.from === 'patient').map((m) => m.text).join(' ')}`;
  let ids;
  if (/ผื่น|คัน|แพ้|สิว|ผิว/.test(t)) ids = ['cetirizine', 'hydrocortisone'];
  else if (/ท้อง|กรด|จุก|อืด|กระเพาะ/.test(t)) ids = ['omeprazole', 'simethicone'];
  else if (/ความดัน|amlodipine/i.test(t)) ids = ['amlodipine'];
  else if (/ไอ|เสมหะ|เจ็บคอ|หวัด|ไข้/.test(t)) ids = ['paracetamol', 'bromhexine', 'ors'];
  else if (/จมูก|คัดจมูก|น้ำมูก/.test(t)) ids = ['saline', 'cetirizine'];
  else ids = ['paracetamol', 'ors'];
  return ids.map((id) => medicineById(id)).filter((m) => !C.allergyConflict(patient, m)).map((m) => ({ medId: m.id, qty: 1 }));
}

function replyFor(c, patientMsg) {
  const patient = db.byId('users', c.userId);
  const first = (patient && patient.name ? patient.name.split(' ')[0] : 'คุณ');
  const isDoctor = c.providerType === 'doctor';
  const ending = isDoctor && C.providerInfo(c).name.startsWith('พญ') ? 'ค่ะ' : (isDoctor ? 'ครับ' : 'ครับ');
  const text = (patientMsg.text || '').trim();
  const providerMsgs = c.messages.filter((m) => m.from === 'provider').length;
  const allergy = (patient.allergies || [])[0];

  if (patientMsg.type === 'image') {
    return { text: `ได้รับภาพแล้ว${ending} จากภาพที่ส่งมา ประกอบกับอาการที่เล่า ยังไม่พบสัญญาณอันตรายเร่งด่วน จะใช้ประกอบการวินิจฉัยและบันทึกลงเวชระเบียนให้นะ${ending}`, note: 'ได้รับภาพประกอบอาการจากผู้ป่วยแล้ว ไม่พบลักษณะอันตรายเร่งด่วน สอดคล้องกับอาการที่ซักประวัติ' };
  }
  if (/ใบรับรองแพทย์/.test(text)) {
    if (!isDoctor) return { text: 'ใบรับรองแพทย์ต้องออกโดยแพทย์เท่านั้นครับ สามารถกด "พบแพทย์เฉพาะทาง" เพื่อปรึกษาแพทย์และขอใบรับรองได้เลยครับ' };
    c.certificate = { issuedAt: Date.now(), restDays: 2, text: `ได้รับการตรวจรักษาทางไกล ด้วยอาการ ${c.complaint || 'เจ็บป่วย'} เห็นสมควรให้พักรักษาตัว 2 วัน` };
    return { text: `ออกใบรับรองแพทย์อิเล็กทรอนิกส์ให้เรียบร้อยแล้ว${ending} (แนะนำพัก 2 วัน) หลังจบการปรึกษาสามารถดาวน์โหลดได้ที่หน้า "ประวัติการรักษาและใบสั่งยา"` };
  }
  if (/ก่อนนอน|วิธีทาน|ทานยา|กินยา/.test(text)) {
    return { text: `ยาลดไข้ทานเฉพาะเวลามีไข้ ห่างกันอย่างน้อย 4-6 ชั่วโมง ส่วนยาแก้แพ้อาจทำให้ง่วง แนะนำทานก่อนนอน ดื่มน้ำตามมากๆ และหลีกเลี่ยงการขับรถหลังทานยานะ${ending}` };
  }
  if (/ตรวจซ้ำ|นัด|ติดตาม/.test(text)) {
    return { text: `หากอาการไม่ดีขึ้นภายใน 3 วัน มีไข้สูงเกิน 39°C หรือหายใจเหนื่อย ให้นัดตรวจซ้ำได้ทันทีผ่านหน้า "พบแพทย์เฉพาะทาง" หรือโทร 1669 กรณีฉุกเฉิน${ending}` };
  }
  if (/ดีขึ้น|หายแล้ว/.test(text)) {
    return { text: `ดีใจด้วย${ending} ทานยาให้ครบตามที่แนะนำ พักผ่อนให้เพียงพอ และติดตามอาการต่อเนื่องนะ${ending}` };
  }
  if (providerMsgs === 0) {
    return { text: `สวัสดี${ending}คุณ${first} ${isDoctor ? 'หมอ' : 'เภสัชกร'}ดูข้อมูลอาการเบื้องต้นแล้ว${c.complaint ? ` (${c.complaint.slice(0, 60)})` : ''} มีอาการเจ็บหน้าอก หายใจลำบาก หรือเหนื่อยหอบร่วมด้วยไหม${ending}?` };
  }
  if (!c.prescription) {
    return {
      text: `รับทราบ${ending}${allergy ? ` จากประวัติแพ้ยา ${allergy.name} จะหลีกเลี่ยงยากลุ่มนี้ให้` : ''} จัดยาบรรเทาอาการและออกใบสั่งยาอิเล็กทรอนิกส์เข้าสู่ระบบร้านยาใกล้บ้านให้ทันที${ending}`,
      prescribe: true,
      note: `ซักประวัติ: ${c.complaint || text}. ไม่มีอาการเตือนอันตราย แนะนำพักผ่อน ดื่มน้ำมากๆ ทานยาตามอาการ${allergy ? ` (หลีกเลี่ยงยากลุ่ม ${allergy.name})` : ''} หากไม่ดีขึ้นใน 3 วันให้ติดตามอาการ`,
    };
  }
  return { text: `${isDoctor ? 'คุณหมอ' : 'เภสัชกร'}ได้รับข้อความเรียบร้อย${ending} กำลังบันทึกลงในเวชระเบียนและระบบจัดส่งยาให้นะ${ending}` };
}

function onPatientMessage(c, msg) {
  if (!enabled() || realtime.isOnline(C.providerUserId(c)) || c.status !== 'active') return;
  const delay = 1500 + Math.random() * 1500;
  setTimeout(() => realtime.send(c.userId, 'typing', { consultationId: c.id }), 400);
  setTimeout(() => {
    const fresh = db.byId('consultations', c.id);
    if (!fresh || fresh.status !== 'active') return;
    fresh.messages.filter((m) => m.from === 'patient').forEach((m) => { m.read = true; });
    C.broadcast(fresh, 'read', { consultationId: fresh.id });
    const r = replyFor(fresh, msg);
    C.addMessage(fresh, 'provider', { text: r.text, auto: true });
    if (r.note) C.setNote(fresh, r.note);
    if (r.prescribe) {
      const items = pickPrescription(fresh, db.byId('users', fresh.userId));
      if (items.length) setTimeout(() => C.issuePrescription(fresh, items), 1200);
    }
  }, delay);
}

function onConsultationStarted(c) {
  if (!enabled() || realtime.isOnline(C.providerUserId(c))) return;
  if (c.complaint) setTimeout(() => onPatientMessage(c, { type: 'text', text: c.complaint }), 800);
}

module.exports = { onPatientMessage, onConsultationStarted };
