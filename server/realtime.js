'use strict';
// Server-Sent Events hub: one stream per browser tab, addressed by user id.
const clients = new Map(); // userId -> Set<res>

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
  const set = clients.get(userId);
  if (!set) return 0;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
  return set.size;
}

const isOnline = (userId) => Boolean(userId && clients.has(userId));

module.exports = { connect, send, isOnline };
