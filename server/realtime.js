'use strict';
// Realtime events for chat, WebRTC signalling, order status and notifications.
//  - Long-running server: Server-Sent Events, one stream per browser tab.
//  - Serverless (redis mode): events are queued per user in Redis and the browser polls
//    /api/events, because serverless functions cannot hold connections open.
const db = require('./db');

const clients = new Map(); // userId -> Set<res>
let seq = 0;

function connect(req, res, userId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    const set = clients.get(userId);
    if (set) { set.delete(res); if (!set.size) clients.delete(userId); }
  });
}

function send(userId, event, data) {
  if (!userId) return 0;
  if (db.serverless) {
    seq = (seq + 1) % 1000;
    db.pushEvent(userId, { id: Date.now() * 1000 + seq, event, data });
    return 1;
  }
  const set = clients.get(userId);
  if (!set) return 0;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
  return set.size;
}

const isOnline = (userId) => Boolean(userId && (clients.has(userId) || Date.now() - db.lastSeen(userId) < 20000));

module.exports = { connect, send, isOnline, mode: () => (db.serverless ? 'poll' : 'sse') };
