'use strict';
// Small JSON-file database. All data lives in memory and is flushed to disk
// atomically (write temp file + rename) shortly after every change.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const COLLECTIONS = [
  'users', 'sessions', 'doctors', 'pharmacies', 'consultations', 'appointments',
  'orders', 'records', 'medications', 'intakes', 'vitals', 'notifications',
  'tickets', 'resetTokens', 'uploads',
];

let state = null;
let saveTimer = null;

function emptyState() {
  const s = { meta: { version: 1, seededAt: null, counters: {} } };
  for (const c of COLLECTIONS) s[c] = [];
  return s;
}

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    for (const c of COLLECTIONS) if (!Array.isArray(state[c])) state[c] = [];
    if (!state.meta) state.meta = { version: 1, counters: {} };
    if (!state.meta.counters) state.meta.counters = {};
  } else {
    state = emptyState();
  }
  return state;
}

function flush() {
  if (!state) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DB_FILE);
}

function save() {
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
  DATA_DIR, UPLOAD_DIR, load, save, flushNow, id, nextNumber,
  table, find, filter, byId, insert, update, remove,
  get state() { return state; },
  reset() { state = emptyState(); flushNow(); return state; },
};
