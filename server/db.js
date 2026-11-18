'use strict';
// Small document database. All data lives in memory as one JSON object.
//
// Two storage backends:
//  - "file"  (default): flushed atomically to DATA_DIR/db.json shortly after every change.
//  - "redis" (when Upstash / Vercel KV REST credentials are set): the JSON lives in Redis so
//    that stateless serverless instances (e.g. Vercel) share one database. Each request
//    refreshes the state if another instance changed it, and commits changes before the
//    response is sent (see server.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ON_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = process.env.DATA_DIR || (ON_VERCEL ? '/tmp/telecare-terra' : path.join(__dirname, '..', 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PREFIX = process.env.REDIS_PREFIX || 'tct';
const remote = Boolean(REDIS_URL && REDIS_TOKEN);
// Serverless hosts cannot keep connections or timers alive, so realtime uses polling there.
const serverless = remote || ON_VERCEL;
const memEvents = {}; // per-instance event queue when serverless without redis
const K = { db: `${PREFIX}:db`, ver: `${PREFIX}:ver`, presence: `${PREFIX}:presence`, file: (id) => `${PREFIX}:file:${id}`, events: (uid) => `${PREFIX}:ev:${uid}` };

const COLLECTIONS = [
  'users', 'sessions', 'doctors', 'pharmacies', 'consultations', 'appointments',
  'orders', 'records', 'medications', 'intakes', 'vitals', 'notifications',
  'tickets', 'resetTokens', 'uploads', 'jobs',
];

let state = null;
let saveTimer = null;
let dirty = false;
let version = null; // redis version of the loaded state
let queued = []; // extra redis commands sent with the next commit
const presence = {}; // userId -> last seen (ms)

function emptyState() {
  const s = { meta: { version: 1, seededAt: null, counters: {} } };
  for (const c of COLLECTIONS) s[c] = [];
  return s;
}

function normalise(s) {
  for (const c of COLLECTIONS) if (!Array.isArray(s[c])) s[c] = [];
  if (!s.meta) s.meta = { version: 1, counters: {} };
  if (!s.meta.counters) s.meta.counters = {};
  return s;
}

// ---------------------------------------------------------------- redis (Upstash REST)
async function redis(commands) {
  const res = await fetch(`${REDIS_URL.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`redis ${res.status}: ${await res.text()}`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(`redis: ${r.error}`);
    return r.result;
  });
}

// ---------------------------------------------------------------- lifecycle
function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (remote) { if (!state) state = emptyState(); return state; }
  state = fs.existsSync(DB_FILE) ? normalise(JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))) : emptyState();
  return state;
}

// Remote mode: pull the latest state (if another instance changed it) and presence data.
async function refresh() {
  if (!remote) return;
  const [ver, pres] = await redis([['GET', K.ver], ['HGETALL', K.presence]]);
  for (let i = 0; pres && i < pres.length; i += 2) presence[pres[i]] = Number(pres[i + 1]);
  if (ver !== null && ver === version && state) return;
  const [raw] = await redis([['GET', K.db]]);
  state = raw ? normalise(JSON.parse(raw)) : emptyState();
  version = ver;
  dirty = false;
}

// Remote mode: write pending changes and queued commands in one round trip.
async function commit() {
  if (!remote) return;
  const cmds = queued;
  queued = [];
  const writeState = dirty;
  dirty = false;
  if (writeState) cmds.unshift(['SET', K.db, JSON.stringify(state)], ['INCR', K.ver]);
  if (!cmds.length) return;
  try {
    const out = await redis(cmds);
    if (writeState) version = String(out[1]);
  } catch (err) {
    if (writeState) dirty = true;
    throw err;
  }
}

function flush() {
  if (!state || remote) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DB_FILE);
}

function save() {
  if (remote) { dirty = true; return; }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { flush(); } catch (err) { console.error('[db] save failed', err); }
  }, 50);
}

function flushNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  flush();
}

// ---------------------------------------------------------------- files (uploads)
async function putFile(id, ext, buf) {
  if (remote) { queued.push(['SET', K.file(id), buf.toString('base64')]); return; }
  fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.${ext}`), buf);
}

async function getFile(id, ext) {
  if (remote) {
    const [b64] = await redis([['GET', K.file(id)]]);
    return b64 ? Buffer.from(b64, 'base64') : null;
  }
  const p = path.join(UPLOAD_DIR, `${id}.${ext}`);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

// ---------------------------------------------------------------- events & presence (remote mode)
function pushEvent(userId, event) {
  if (!remote) { const l = (memEvents[userId] = memEvents[userId] || []); l.push(event); if (l.length > 200) l.shift(); return; }
  const key = K.events(userId);
  queued.push(['RPUSH', key, JSON.stringify(event)], ['LTRIM', key, '-200', '-1'], ['EXPIRE', key, '3600']);
}

async function readEvents(userId) {
  if (!remote) return (memEvents[userId] || []).slice();
  const [list] = await redis([['LRANGE', K.events(userId), '0', '-1']]);
  return (list || []).map((s) => JSON.parse(s));
}

function touch(userId) {
  const now = Date.now();
  if (now - (presence[userId] || 0) < 5000) return;
  presence[userId] = now;
  if (remote) queued.push(['HSET', K.presence, userId, String(now)]);
}

const lastSeen = (userId) => presence[userId] || 0;

// ---------------------------------------------------------------- queries
const id = (prefix = '') => prefix + crypto.randomBytes(8).toString('hex');

function nextNumber(key, start = 1) {
  const c = state.meta.counters;
  c[key] = (c[key] || start - 1) + 1;
  save();
  return c[key];
}

const table = (name) => state[name];
const find = (name, pred) => state[name].find(pred);
const filter = (name, pred) => state[name].filter(pred);
const byId = (name, value) => state[name].find((r) => r.id === value);

function insert(name, record) {
  state[name].push(record);
  save();
  return record;
}

function update(name, value, patch) {
  const rec = byId(name, value);
  if (!rec) return null;
  Object.assign(rec, patch);
  save();
  return rec;
}

function remove(name, pred) {
  const before = state[name].length;
  state[name] = state[name].filter((r) => !pred(r));
  if (state[name].length !== before) save();
}

module.exports = {
  DATA_DIR, UPLOAD_DIR, remote, serverless, ON_VERCEL, load, refresh, commit, save, flushNow, id, nextNumber,
  table, find, filter, byId, insert, update, remove, putFile, getFile, pushEvent, readEvents, touch, lastSeen,
  get state() { return state; },
  reset() { state = emptyState(); if (remote) { dirty = true; } else flushNow(); return state; },
  _redis: redis,
};
