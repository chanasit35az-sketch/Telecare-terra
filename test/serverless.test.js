'use strict';
// Serverless (Vercel-style) mode: two independent server processes share one Redis
// (a minimal in-test Upstash REST emulator). Requests alternate between instances.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const store = new Map();
function exec([cmd, ...a]) {
  const get = (k) => (store.has(k) ? store.get(k) : null);
  switch (cmd.toUpperCase()) {
    case 'GET': return get(a[0]);
    case 'SET': store.set(a[0], String(a[1])); return 'OK';
    case 'INCR': { const v = Number(get(a[0]) || 0) + 1; store.set(a[0], String(v)); return v; }
    case 'HSET': { const h = get(a[0]) || {}; h[a[1]] = a[2]; store.set(a[0], h); return 1; }
    case 'HGETALL': { const h = get(a[0]) || {}; return Object.entries(h).flat(); }
    case 'RPUSH': { const l = get(a[0]) || []; l.push(a[1]); store.set(a[0], l); return l.length; }
    case 'LTRIM': { const l = get(a[0]) || []; store.set(a[0], l.slice(Number(a[1]))); return 'OK'; }
    case 'LRANGE': return (get(a[0]) || []).slice();
    case 'EXPIRE': return 1;
    default: return { error: `unknown ${cmd}` };
  }
}
const redisServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer test-token') { res.statusCode = 401; return res.end('unauthorized'); }
    const out = JSON.parse(body).map((c) => { const r = exec(c); return r && r.error ? r : { result: r }; });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(out));
  });
});

const procs = [];
let ports = [];
async function startInstance(port, redisUrl) {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), KV_REST_API_URL: redisUrl, KV_REST_API_TOKEN: 'test-token', VERCEL: '1', DATA_DIR: path.join(require('os').tmpdir(), `tct-sl-${port}`) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(p);
  await new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => { if (String(d).includes('running')) resolve(); });
    p.stderr.on('data', (d) => process.stderr.write(d));
    p.on('exit', (code) => reject(new Error(`instance exited ${code}`)));
  });
}

let turn = 0;
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const port = ports[turn++ % ports.length]; // alternate instances on every request
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(async () => {
  await new Promise((r) => redisServer.listen(0, r));
  const url = `http://127.0.0.1:${redisServer.address().port}`;
  ports = [31871 + Math.floor(Math.random() * 1000), 33871 + Math.floor(Math.random() * 1000)];
  await startInstance(ports[0], url);
  await startInstance(ports[1], url);
});
test.after(() => { procs.forEach((p) => p.kill()); redisServer.close(); });

test('state, sessions, jobs and events are shared across instances', async () => {
  const me = await (client())('GET', '/api/auth/me');
  assert.strictEqual(me.body.config.realtime, 'poll');
  const c = client();
  const reg = await c('POST', '/api/auth/register', { name: 'เซิร์ฟเวอร์เลส', identifier: 'sl@example.com', password: 'password123', acceptTerms: true });
  assert.strictEqual(reg.status, 201);
  // the session created on one instance is valid on the other
  for (let i = 0; i < 4; i += 1) assert.strictEqual((await c('GET', '/api/auth/me')).body.user.email, 'sl@example.com');
  const cursor = (await c('GET', '/api/events')).body.cursor;
  const start = await c('POST', '/api/consultations', { providerType: 'pharmacist', pharmacyId: 'ph-pure', mode: 'chat', complaint: 'ไอ เจ็บคอ' });
  assert.strictEqual(start.status, 201);
  const id = start.body.consultation.id;
  await c('POST', `/api/consultations/${id}/messages`, { text: 'ไม่เหนื่อยครับ' });
  // demo replies are jobs: they run on later requests (here: event polling) on either instance
  let rx = null;
  const seen = [];
  let since = cursor;
  for (let i = 0; i < 40 && !rx; i += 1) {
    await wait(250);
    const ev = await c('GET', `/api/events?since=${since}`);
    seen.push(...ev.body.events.map((e) => e.event));
    since = ev.body.cursor;
    rx = (await c('GET', `/api/consultations/${id}`)).body.consultation.prescription;
  }
  assert.ok(rx, 'prescription issued by scheduled job');
  assert.ok(seen.includes('message'), 'message events delivered through polling');
  const order = await c('POST', `/api/consultations/${id}/confirm-rx`, { payment: { method: 'cod' } });
  assert.strictEqual(order.status, 201);
  assert.ok((await c('GET', '/api/orders')).body.orders.some((o) => o.id === order.body.order.id));
});

test('file uploads are stored in redis and readable from the other instance', async () => {
  const c = client();
  await c('POST', '/api/auth/login', { identifier: 'demo@telecare.terra', password: 'demo1234' });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const up = await c('POST', '/api/records/upload', { dataUrl: png, title: 'ผลตรวจ' });
  assert.strictEqual(up.status, 201);
  const port = ports[turn++ % ports.length];
  const cookieRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'demo@telecare.terra', password: 'demo1234' }) });
  const cookie = cookieRes.headers.get('set-cookie').split(';')[0];
  for (const p of ports) {
    const f = await fetch(`http://127.0.0.1:${p}${up.body.record.fileUrl}`, { headers: { Cookie: cookie } });
    assert.strictEqual(f.status, 200);
    assert.strictEqual(f.headers.get('content-type'), 'image/png');
  }
});
