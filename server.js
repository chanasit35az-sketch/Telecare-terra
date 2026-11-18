'use strict';
const express = require('express');
const path = require('path');
const db = require('./server/db');
const { seed } = require('./server/seed');
const { attachUser } = require('./server/auth');
const L = require('./server/logic');
const realtime = require('./server/realtime');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), display-capture=(self)');
    next();
  });
  app.use(express.json({ limit: '15mb' }));
  app.use(attachUser);

  // Reject cross-site state-changing API calls (CSRF defence in addition to SameSite cookies).
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'cross-site request blocked' });
    next();
  });

  app.use('/api', require('./server/api').router);
  app.use('/auth', require('./server/oauth'));
  app.use('/print', require('./server/print'));

  const pub = path.join(__dirname, 'public');
  const pages = {
    '/': 'index.html', '/login': 'login.html', '/pharmacies': 'pharmacies.html', '/doctors': 'doctors.html',
    '/care-plus': 'care-plus.html', '/records': 'records.html', '/orders': 'orders.html', '/provider': 'provider.html',
  };
  const protectedPages = new Set(['/records', '/orders', '/provider', '/consult', '/video']);
  const guard = (route) => (req, res, next) => {
    if (protectedPages.has(route) && !req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (route === '/login' && req.user && !req.query.reset) return res.redirect(req.query.next && req.query.next.startsWith('/') ? req.query.next : '/');
    next();
  };
  Object.entries(pages).forEach(([route, file]) => app.get(route, guard(route), (req, res) => res.sendFile(path.join(pub, file))));
  app.get(['/consult', '/consult/:id'], guard('/consult'), (req, res) => res.sendFile(path.join(pub, 'consult.html')));
  app.get(['/video', '/video/:id'], guard('/video'), (req, res) => res.sendFile(path.join(pub, 'video.html')));
  app.use(express.static(pub, { extensions: ['html'], maxAge: '1h' }));
  app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));
  return app;
}

// Push order status changes (packed, rider on the way, delivered) to the patient.
function startOrderTicker() {
  const messages = {
    pack: { icon: 'inventory_2', title: 'เภสัชกรตรวจใบสั่งยาเรียบร้อย', body: 'กำลังบรรจุยาและติดฉลาก' },
    deliver: { icon: 'two_wheeler', title: 'ไรเดอร์รับยาจากร้านแล้ว', body: 'กำลังเดินทางมาหาคุณ' },
    done: { icon: 'task_alt', title: 'จัดส่งยาสำเร็จ', body: 'ขอให้หายป่วยไวๆ อย่าลืมทานยาตามเวลานะคะ' },
  };
  return setInterval(() => {
    db.table('orders').forEach((o) => {
      if (o.status === 'cancelled') return;
      const st = L.orderStatus(o);
      if (o.notifiedStage === st.stage) return;
      const first = o.notifiedStage === undefined;
      o.notifiedStage = st.stage;
      db.save();
      if (first) return; // don't replay history on startup
      const m = messages[st.stage];
      if (m) L.notify(o.userId, { ...m, body: `#${o.id} • ${m.body}`, link: `/orders?id=${o.id}` });
      realtime.send(o.userId, 'order', { orderId: o.id, stage: st.stage });
    });
  }, 10000);
}

if (require.main === module) {
  db.load();
  if (seed()) console.log('[seed] demo data created');
  startOrderTicker();
  const port = Number(process.env.PORT) || 3000;
  const server = createApp().listen(port, () => {
    console.log(`TeleCare Terra running on http://localhost:${port}  (demo mode: ${process.env.DEMO_MODE !== 'false'})`);
  });
  const shutdown = () => { db.flushNow(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createApp, startOrderTicker };
