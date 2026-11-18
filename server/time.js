'use strict';
// Thailand has no daylight saving time, so Asia/Bangkok is always UTC+7.
const OFFSET = 7 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, '0');

function parts(ts = Date.now()) {
  const d = new Date(ts + OFFSET);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hh: d.getUTCHours(), mm: d.getUTCMinutes(), dow: d.getUTCDay(),
  };
}

const dateKey = (ts = Date.now()) => { const p = parts(ts); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const timeKey = (ts = Date.now()) => { const p = parts(ts); return `${pad(p.hh)}:${pad(p.mm)}`; };
const minutesOfDay = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Convert a Bangkok local date ("YYYY-MM-DD") + time ("HH:MM") to a UTC timestamp.
function toTs(date, time = '00:00') {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - OFFSET;
}

function addDays(date, n) {
  return dateKey(toTs(date, '12:00') + n * 86400000);
}

const dowOf = (date) => new Date(toTs(date, '12:00') + OFFSET).getUTCDay();

module.exports = { parts, dateKey, timeKey, minutesOfDay, toTs, addDays, dowOf, pad };
