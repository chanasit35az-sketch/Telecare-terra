'use strict';
// Print-ready documents (e-prescription, receipt, medical certificate). The browser's
// "Save as PDF" turns them into PDF files.
const express = require('express');
const db = require('./db');
const L = require('./logic');
const T = require('./time');

const router = express.Router();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (ts) => `${L.thaiShortDate(T.dateKey(ts))} ${T.timeKey(ts)} น.`;
const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH')}`;

function page(title, body) {
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} • TeleCare Terra</title>
<link href="https://fonts.googleapis.com/css2?family=Literata:wght@400;700&family=Prompt:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{--primary:#4a7c59;--surface:#faf6f0;--low:#f5f1ea;--muted:#4a4e4a;--outline:#74796e;--error:#b83230}
*{box-sizing:border-box}body{margin:0;background:#eae6de;font-family:'Prompt',sans-serif;color:#2e3230;line-height:1.6}
.sheet{max-width:780px;margin:24px auto;background:#fff;border-radius:16px;padding:40px 44px;box-shadow:0 4px 20px rgba(46,50,48,.08)}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid var(--primary);padding-bottom:16px;margin-bottom:20px}
.brand{font-family:'Literata',serif;font-weight:700;color:var(--primary);font-size:22px}.muted{color:var(--muted);font-size:13px}
h1{font-family:'Literata',serif;font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 8px;color:var(--primary)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #eae6de;vertical-align:top}
th{background:var(--low);font-weight:600}.right{text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:13px}
.box{background:var(--low);border-radius:12px;padding:12px 14px;font-size:13px}.warn{background:#ffdad8;color:var(--error);border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600}
.sign{margin-top:36px;display:flex;justify-content:flex-end}.sign div{text-align:center;font-size:13px}.sign .line{border-top:1px dashed var(--outline);width:240px;margin:40px auto 6px}
.total td{font-weight:700;font-size:15px;color:var(--primary)}.bar{max-width:780px;margin:16px auto 0;display:flex;gap:8px;justify-content:flex-end}
.bar button,.bar a{font:inherit;font-size:13px;padding:8px 16px;border-radius:12px;border:0;cursor:pointer;background:var(--primary);color:#fff;text-decoration:none}
.bar a{background:#f0ece4;color:#2e3230}.foot{margin-top:28px;font-size:11px;color:var(--outline);text-align:center}
@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;border-radius:0;padding:24px}.bar{display:none}}
@media (max-width:600px){.sheet{padding:24px 18px;margin:0;border-radius:0}.grid{grid-template-columns:1fr}}
</style></head><body>
<div class="bar"><a href="javascript:history.back()">ย้อนกลับ</a><button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div>
<div class="sheet">${body}<p class="foot">เอกสารอิเล็กทรอนิกส์ออกโดยระบบ TeleCare Terra • ใบอนุญาตสถานพยาบาลและเทเลเมดิซีนเลขที่ ภ.ส. 10294/2567 • ตรวจสอบได้ที่สายด่วน 02-123-4567</p></div>
</body></html>`;
}

function header(title, code, ts) {
  return `<div class="top"><div><div class="brand">TeleCare Terra</div><div class="muted">เทเลแคร์ • แพลตฟอร์มการแพทย์ทางไกลและเภสัชกรรมชุมชน</div></div>
<div style="text-align:right"><h1>${esc(title)}</h1><div class="muted">เลขที่ ${esc(code)}</div><div class="muted">${esc(dt(ts))}</div></div></div>`;
}

function patientBlock(u) {
  const age = L.ageOf(u.dob);
  const allergies = (u.allergies || []).map((a) => `${a.name}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ');
  return `<div class="grid"><div><b>ผู้ป่วย:</b> ${esc(`${u.title || ''}${u.name}`)}</div><div><b>HN:</b> ${esc(u.hn || '-')}</div>
<div><b>อายุ:</b> ${age ? `${age.years} ปี` : '-'} • <b>เพศ:</b> ${esc(u.gender || '-')}</div><div><b>หมู่เลือด:</b> ${esc(u.bloodType || '-')}</div></div>
${allergies ? `<p class="warn">ประวัติแพ้ยา: ${esc(allergies)}</p>` : ''}`;
}

const notFound = (res) => res.status(404).send(page('ไม่พบเอกสาร', '<h1>ไม่พบเอกสาร</h1><p class="muted">เอกสารนี้ไม่มีอยู่หรือคุณไม่มีสิทธิ์เข้าถึง</p>'));

router.use((req, res, next) => (req.user ? next() : res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`)));

router.get('/rx/:id', (req, res) => {
  const r = db.byId('records', req.params.id);
  if (!r || r.userId !== req.user.id) return notFound(res);
  const items = r.items || [];
  const total = items.reduce((s, i) => s + (i.price || 0), 0);
  const rows = items.map((i, n) => `<tr><td>${n + 1}</td><td><b>${esc(i.name)}</b>${i.thai ? `<div class="muted">${esc(i.thai)}</div>` : ''}</td><td>${esc(i.instructions || '')}</td><td>${esc(i.unit || '')}</td><td class="right">${baht(i.price)}</td></tr>`).join('');
  res.send(page(`ใบสั่งยา ${r.id}`, `${header('ใบสั่งยาอิเล็กทรอนิกส์ (e-Prescription)', r.id, r.createdAt)}
${patientBlock(req.user)}
<h2>ผู้สั่งจ่าย</h2><div class="box">${esc(r.provider.name)} (${esc(r.provider.license || '')}) • ${esc(r.facility || '')}${r.verifiedBy ? `<br>ตรวจสอบโดย ${esc(r.verifiedBy.name)} (${esc(r.verifiedBy.license)})` : ''}</div>
${r.complaint ? `<h2>อาการสำคัญ</h2><div class="box">${esc(r.complaint)}</div>` : ''}
${r.diagnosis ? `<h2>การวินิจฉัย</h2><div class="box">${esc(r.diagnosis)}${r.icd ? ` (ICD-10: ${esc(r.icd)})` : ''}</div>` : ''}
<h2>รายการยา (${items.length} รายการ)</h2>
<table><thead><tr><th>#</th><th>ชื่อยา</th><th>วิธีใช้</th><th>จำนวน</th><th class="right">ราคา</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">ไม่มีรายการยา</td></tr>'}</tbody>
<tfoot><tr class="total"><td colspan="4">รวม</td><td class="right">${baht(total)}</td></tr></tfoot></table>
<div class="sign"><div><div class="line"></div>${esc(r.provider.name)}<br><span class="muted">ลงนามอิเล็กทรอนิกส์ ${esc(r.provider.license || '')}</span></div></div>`));
});

router.get('/certificate/:id', (req, res) => {
  const r = db.byId('records', req.params.id);
  if (!r || r.userId !== req.user.id || !r.certificate) return notFound(res);
  const c = r.certificate;
  res.send(page('ใบรับรองแพทย์', `${header('ใบรับรองแพทย์ (Medical Certificate)', `MC-${r.id}`, c.issuedAt)}
${patientBlock(req.user)}
<h2>ผลการตรวจ</h2><div class="box">ข้าพเจ้า ${esc(r.provider.name)} (${esc(r.provider.license || '')}) ได้ทำการตรวจรักษาผู้ป่วยรายนี้ผ่านระบบการแพทย์ทางไกล เมื่อวันที่ ${esc(dt(r.createdAt))}
${r.diagnosis ? `<br>การวินิจฉัย: ${esc(r.diagnosis)}${r.icd ? ` (ICD-10: ${esc(r.icd)})` : ''}` : ''}<br>${esc(c.text || '')}
${c.restDays ? `<br><b>ความเห็นแพทย์: สมควรพักรักษาตัวเป็นเวลา ${c.restDays} วัน ตั้งแต่ ${esc(L.thaiShortDate(T.dateKey(c.issuedAt)))}</b>` : ''}</div>
<div class="sign"><div><div class="line"></div>${esc(r.provider.name)}<br><span class="muted">แพทย์ผู้ตรวจ • ${esc(r.facility || '')}</span></div></div>`));
});

router.get('/receipt/:id', (req, res) => {
  const o = db.byId('orders', req.params.id);
  if (!o || o.userId !== req.user.id) return notFound(res);
  const p = db.byId('pharmacies', o.pharmacyId);
  const pm = o.payment || {};
  const method = { promptpay: 'PromptPay QR', card: `บัตร ${pm.brand || ''} •••• ${pm.last4 || ''}`, cod: 'เก็บเงินปลายทาง', free: 'ไม่มีค่าใช้จ่าย' }[pm.method] || pm.method;
  const rows = o.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td>${esc(i.unit || '')}</td><td class="right">${baht(i.price)}</td></tr>`).join('');
  res.send(page(`ใบเสร็จ ${o.id}`, `${header('ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ', o.id, o.createdAt)}
<div class="grid"><div><b>ลูกค้า:</b> ${esc(req.user.name)}</div><div><b>ร้านยา:</b> ${esc(p ? p.name : '-')}</div>
<div><b>ที่อยู่จัดส่ง:</b> ${esc(o.address ? `${o.address.label || ''} ${o.address.detail || ''}` : '-')}</div><div><b>เลขที่ใบอนุญาตร้านยา:</b> ${esc(p ? `ข.ย.๕ ${p.license}` : '-')}</div></div>
<h2>รายการ</h2><table><thead><tr><th>#</th><th>รายการ</th><th>จำนวน</th><th class="right">จำนวนเงิน</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">รวมค่าเวชภัณฑ์</td><td class="right">${baht(o.subtotal)}</td></tr>
${o.discount ? `<tr><td colspan="3">ส่วนลดสมาชิก Terra Care+ (15%)</td><td class="right">-${baht(o.discount)}</td></tr>` : ''}
<tr><td colspan="3">ค่าจัดส่ง</td><td class="right">${o.deliveryFee ? baht(o.deliveryFee) : esc(o.deliveryNote || 'ฟรี')}</td></tr>
<tr class="total"><td colspan="3">ยอดรวมทั้งสิ้น</td><td class="right">${baht(o.total)}</td></tr></tfoot></table>
<h2>การชำระเงิน</h2><div class="box">${esc(method)} • สถานะ: ${pm.status === 'paid' ? 'ชำระแล้ว' : pm.status === 'cod' ? 'ชำระเมื่อรับสินค้า' : esc(pm.status || '-')} • เลขอ้างอิง ${esc(pm.ref || '-')}
${o.status === 'cancelled' ? '<br><b style="color:#b83230">คำสั่งซื้อนี้ถูกยกเลิก' + (pm.refund ? ' • คืนเงินแล้ว' : '') + '</b>' : ''}</div>`));
});

module.exports = router;
