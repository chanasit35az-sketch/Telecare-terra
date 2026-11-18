'use strict';
// Optional social sign-in (Google, LINE) using the OAuth 2.0 authorization-code flow.
// Enabled only when the matching client credentials are set in the environment.
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const L = require('./logic');
const { createSession } = require('./auth');

const router = express.Router();

const PROVIDERS = {
  google: {
    enabled: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async profile(tokens) {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const p = await r.json();
      return { sub: p.sub, email: p.email, name: p.name, avatar: p.picture };
    },
  },
  line: {
    enabled: () => Boolean(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET),
    clientId: () => process.env.LINE_CHANNEL_ID,
    secret: () => process.env.LINE_CHANNEL_SECRET,
    authorize: 'https://access.line.me/oauth2/v2.1/authorize',
    token: 'https://api.line.me/oauth2/v2.1/token',
    scope: 'profile openid email',
    async profile(tokens) {
      const body = new URLSearchParams({ id_token: tokens.id_token, client_id: process.env.LINE_CHANNEL_ID });
      const r = await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', body });
      const p = await r.json();
      return { sub: p.sub, email: p.email, name: p.name, avatar: p.picture };
    },
  },
};

const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

router.get('/:provider', (req, res) => {
  const p = PROVIDERS[req.params.provider];
  if (!p || !p.enabled()) return res.redirect('/login?error=oauth_disabled');
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `tct_oauth=${state}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600`);
  const q = new URLSearchParams({
    response_type: 'code', client_id: p.clientId(), redirect_uri: `${baseUrl(req)}/auth/${req.params.provider}/callback`, scope: p.scope, state,
  });
  res.redirect(`${p.authorize}?${q}`);
});

router.get('/:provider/callback', async (req, res) => {
  const name = req.params.provider;
  const p = PROVIDERS[name];
  try {
    if (!p || !p.enabled()) throw new Error('disabled');
    const cookieState = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('tct_oauth='));
    if (!req.query.code || !cookieState || cookieState.split('=')[1] !== req.query.state) throw new Error('bad state');
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code: req.query.code, redirect_uri: `${baseUrl(req)}/auth/${name}/callback`,
      client_id: p.clientId(), client_secret: p.secret(),
    });
    const tr = await fetch(p.token, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const tokens = await tr.json();
    if (!tr.ok) throw new Error('token exchange failed');
    const prof = await p.profile(tokens);
    if (!prof.sub) throw new Error('no profile');
    let user = db.find('users', (u) => u.oauth && u.oauth[name] === prof.sub)
      || (prof.email && db.find('users', (u) => (u.email || '').toLowerCase() === prof.email.toLowerCase()));
    if (user) {
      user.oauth = { ...(user.oauth || {}), [name]: prof.sub };
      db.save();
    } else {
      user = db.insert('users', {
        id: db.id('u_'), role: 'patient', name: prof.name || 'ผู้ใช้งานใหม่', email: (prof.email || '').toLowerCase(), phone: '',
        avatar: prof.avatar || null, oauth: { [name]: prof.sub }, allergies: [], conditions: [], points: 0,
        hn: `${String(new Date().getFullYear() + 543).slice(2)}-${String(db.nextNumber('hn', 1000)).padStart(5, '0')}`,
        location: L.DEFAULT_LOCATION, membership: null, createdAt: Date.now(), updatedAt: Date.now(),
      });
    }
    createSession(res, user.id, true);
    res.redirect('/');
  } catch (e) {
    console.error(`[oauth:${name}]`, e.message);
    res.redirect('/login?error=oauth_failed');
  }
});

module.exports = router;
