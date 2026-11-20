'use strict';
const express = require('express');
const path = require('path');
const db = require('./server/db');
const { seed } = require('./server/seed');
const { attachUser } = require('./server/auth');
const jobs = require('./server/jobs');

// Load the database (and create demo data on first run). Returns a promise.
let initPromise = null;
function init() {
  if (!initPromise) {
    initPromise = (async () => {
      db.load();
      await db.refresh();
      if (seed()) {
        console.log('[seed] demo data created');
        await db.commit();
      }
    })().catch((err) => { initPromise = null; throw err; });
  }
  return initPromise;
}

// Serverless (redis) mode: requests in one instance run one at a time; each refreshes the
// shared state first and commits its changes before the response is sent.
let chain = Promise.resolve();
function remoteState(req, res, next) {
  if (!db.remote) {
    if (db.serverless) { try { jobs.runDue(); } catch (err) { console.error('[jobs]', err); } }
    return next();
  }
  let release;
  const turn = new Promise((r) => { release = r; });
  const prev = chain;
  chain = chain.then(() => turn);
  let released = false;
  const done = () => { if (!released) { released = true; release(); } };
  const timer = setTimeout(done, 25000);
  res.on('close', () => { clearTimeout(timer); done(); });
  prev.then(async () => {
    try {
      await db.refresh();
      jobs.runDue();
    } catch (err) {
      console.error('[db] refresh failed', err);
      return res.status(503).json({ error: 'ระบบฐานข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่' });
    }
    const end = res.end;
    let ended = false;
    res.end = function patchedEnd(...args) {
      if (ended) return end.apply(res, args);
      ended = true;
      db.commit().catch((err) => console.error('[db] commit failed', err)).finally(() => { end.apply(res, args); clearTimeout(timer); done(); });
      return res;
    };
    next();
  });
}

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
  app.use((req, res, next) => init().then(() => next(), next));
  app.use(remoteState);
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
    '/privacy': 'privacy.html', '/terms': 'terms.html',
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
  app.use(express.static(pub, { extensions: ['html'], maxAge: 0 })); // always revalidate so new deploys show immediately
  app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));
  return app;
}

if (require.main === module) {
  init().then(() => {
    if (!db.serverless) jobs.startTicker(); // serverless: jobs run at the start of each request
    const port = Number(process.env.PORT) || 3000;
    const server = createApp().listen(port, () => {
      console.log(`TeleCare Terra running on http://localhost:${port}  (demo mode: ${process.env.DEMO_MODE !== 'false'}, storage: ${db.remote ? 'redis' : 'file'})`);
    });
    const shutdown = () => { db.flushNow(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { createApp, init };
