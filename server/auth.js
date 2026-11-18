'use strict';
const crypto = require('crypto');
const db = require('./db');

const COOKIE = 'tct_session';
const LONG_SESSION_MS = 30 * 24 * 3600 * 1000;
const SHORT_SESSION_MS = 12 * 3600 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user || !user.passwordHash) return false;
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function createSession(res, userId, remember) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = remember ? LONG_SESSION_MS : SHORT_SESSION_MS;
  db.insert('sessions', { id: sha(token), userId, createdAt: Date.now(), expiresAt: Date.now() + ttl });
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  const maxAge = remember ? `; Max-Age=${Math.floor(ttl / 1000)}` : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secure}`);
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.remove('sessions', (s) => s.id === sha(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function userFromRequest(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const session = db.byId('sessions', sha(token));
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    db.remove('sessions', (s) => s.id === session.id);
    return null;
  }
  return db.byId('users', session.userId) || null;
}

function attachUser(req, _res, next) {
  req.user = userFromRequest(req);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  next();
}

function requireProvider(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  if (!['doctor', 'pharmacist'].includes(req.user.role)) {
    return res.status(403).json({ error: 'เฉพาะบุคลากรทางการแพทย์เท่านั้น' });
  }
  next();
}

module.exports = {
  hashPassword, verifyPassword, createSession, destroySession, attachUser,
  requireAuth, requireProvider, sha, userFromRequest,
};
