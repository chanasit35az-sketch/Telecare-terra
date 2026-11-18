'use strict';
// Payment helpers. PromptPay QR payloads follow the EMVCo / Bank of Thailand spec, so any
// Thai banking app can scan them. Card payments are validated locally only: connect a real
// gateway (e.g. Omise, 2C2P, GB Prime Pay) before taking live payments.
const crypto = require('crypto');

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i += 1) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

function promptPayPayload(target, amount) {
  const digits = String(target).replace(/\D/g, '');
  let account;
  if (digits.length >= 13) account = tlv('02', digits); // national ID / tax ID
  else account = tlv('01', ('0000000000000' + digits.replace(/^0/, '66')).slice(-13)); // mobile number
  let payload = tlv('00', '01') + tlv('01', amount ? '12' : '11')
    + tlv('29', tlv('00', 'A000000677010111') + account) + tlv('53', '764');
  if (amount) payload += tlv('54', Number(amount).toFixed(2));
  payload += tlv('58', 'TH') + '6304';
  return payload + crc16(payload);
}

function luhn(num) {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i -= 1) {
    let d = Number(num[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function cardBrand(num) {
  if (/^4/.test(num)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(num)) return 'Mastercard';
  if (/^3[47]/.test(num)) return 'American Express';
  if (/^35/.test(num)) return 'JCB';
  return 'Card';
}

const err = (msg) => Object.assign(new Error(msg), { status: 400 });

// Returns the stored payment object or throws a 400 error.
function processPayment(payment, amount, { allowCod = false } = {}) {
  const ref = 'TXN-' + crypto.randomInt(100000000, 999999999);
  if (amount <= 0) return { method: 'free', status: 'paid', ref, amount: 0, paidAt: Date.now() };
  const method = payment && payment.method;
  if (method === 'promptpay') {
    return { method, status: 'paid', ref, amount, paidAt: Date.now(), confirmedBy: 'customer' };
  }
  if (method === 'card') {
    const number = String(payment.number || '').replace(/\D/g, '');
    const [mm, yy] = String(payment.expiry || '').split('/').map((v) => parseInt(v, 10));
    const cvc = String(payment.cvc || '');
    if (number.length < 13 || number.length > 19 || !luhn(number)) throw err('หมายเลขบัตรไม่ถูกต้อง');
    if (!mm || mm > 12 || yy == null || Number.isNaN(yy)) throw err('วันหมดอายุบัตรไม่ถูกต้อง (MM/YY)');
    const exp = new Date(2000 + yy, mm, 1).getTime();
    if (exp <= Date.now()) throw err('บัตรหมดอายุแล้ว');
    if (!/^\d{3,4}$/.test(cvc)) throw err('รหัส CVC ไม่ถูกต้อง');
    return { method, status: 'paid', ref, amount, paidAt: Date.now(), brand: cardBrand(number), last4: number.slice(-4) };
  }
  if (method === 'cod' && allowCod) return { method, status: 'cod', ref, amount, paidAt: null };
  throw err('กรุณาเลือกวิธีชำระเงิน');
}

module.exports = { promptPayPayload, processPayment, luhn, crc16 };
