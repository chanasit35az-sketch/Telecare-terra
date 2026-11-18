'use strict';
// Delayed work stored in the database instead of in-memory timers, so it also runs on
// serverless hosts: jobs are executed by a 500 ms ticker on a normal server, and at the
// start of each request in serverless (redis) mode.
const db = require('./db');
const L = require('./logic');
const realtime = require('./realtime');

const handlers = {};
const register = (type, fn) => { handlers[type] = fn; };

function schedule(type, delayMs, payload = {}) {
  db.insert('jobs', { id: db.id('j_'), type, dueAt: Date.now() + delayMs, payload });
}

const ORDER_MESSAGES = {
  pack: { icon: 'inventory_2', title: 'เภสัชกรตรวจใบสั่งยาเรียบร้อย', body: 'กำลังบรรจุยาและติดฉลาก' },
  deliver: { icon: 'two_wheeler', title: 'ไรเดอร์รับยาจากร้านแล้ว', body: 'กำลังเดินทางมาหาคุณ' },
  done: { icon: 'task_alt', title: 'จัดส่งยาสำเร็จ', body: 'ขอให้หายป่วยไวๆ อย่าลืมทานยาตามเวลานะคะ' },
};

// Notify patients when an order moves to a new stage (packed, on the way, delivered).
function tickOrders() {
  db.table('orders').forEach((o) => {
    if (o.status === 'cancelled') return;
    const st = L.orderStatus(o);
    if (o.notifiedStage === st.stage) return;
    const first = o.notifiedStage === undefined;
    o.notifiedStage = st.stage;
    db.save();
    if (first) return; // don't replay history on startup
    const m = ORDER_MESSAGES[st.stage];
    if (m) L.notify(o.userId, { ...m, body: `#${o.id} • ${m.body}`, link: `/orders?id=${o.id}` });
    realtime.send(o.userId, 'order', { orderId: o.id, stage: st.stage });
  });
}

function runDue() {
  const now = Date.now();
  const due = db.table('jobs').filter((j) => j.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
  if (due.length) {
    const ids = new Set(due.map((j) => j.id));
    db.remove('jobs', (j) => ids.has(j.id));
    due.forEach((j) => {
      try { if (handlers[j.type]) handlers[j.type](j.payload); } catch (err) { console.error('[jobs]', j.type, err); }
    });
  }
  tickOrders();
}

function startTicker() {
  return setInterval(() => { try { runDue(); } catch (err) { console.error('[jobs]', err); } }, 500);
}

module.exports = { register, schedule, runDue, startTicker };
