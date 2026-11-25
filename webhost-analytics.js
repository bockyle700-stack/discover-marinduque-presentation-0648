'use strict';
// WebHost analytics: preloaded with `node --require ./webhost-analytics.js` on Render.
// Observes every HTTP request of ANY Node app (Express, plain http, ...) and exposes private stats at
// /__webhost/stats?key=<WEBHOST_STATS_KEY>. No IP addresses are stored: visitors are one-way hashed.
try {
  const http = require('http');
  const crypto = require('crypto');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const KEY = process.env.WEBHOST_STATS_KEY || '';
  const FILE = path.join(os.tmpdir(), 'webhost-analytics.json');
  const S = { bootAt: Date.now(), total: 0, latencyMs: 0, hours: {}, routes: {}, status: {}, devices: {}, countries: {}, referrers: {}, uniques: [] };
  try { Object.assign(S, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) { /* first run */ }
  const uniq = new Set(S.uniques || []);
  const active = new Map();
  const recent = [];

  const bump = (o, k, cap) => { if (o[k] !== undefined || Object.keys(o).length < cap) o[k] = (o[k] || 0) + 1; };
  const top = (o, n) => Object.keys(o).map((k) => [k, o[k]]).sort((a, b) => b[1] - a[1]).slice(0, n);
  const deviceOf = (ua) => (/bot|crawl|spider|slurp|preview|monitor|curl|wget|python-requests/i.test(ua) ? 'bot'
    : /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop');

  function record(req, status, ms) {
    const h = req.headers || {};
    const ua = String(h['user-agent'] || '');
    if (/^render\//i.test(ua) || /^WebHost-KeepAlive/i.test(ua)) return;
    const p = String(req.url || '/').split('?')[0].slice(0, 120) || '/';
    const ip = String(h['cf-connecting-ip'] || h['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
    const v = crypto.createHash('sha1').update(ip + '|' + ua).digest('hex').slice(0, 12);
    const now = Date.now();
    const hour = String(Math.floor(now / 3600000));
    S.total++;
    S.hours[hour] = (S.hours[hour] || 0) + 1;
    S.latencyMs = S.latencyMs ? S.latencyMs * 0.9 + ms * 0.1 : ms;
    bump(S.routes, p, 300);
    bump(S.status, status >= 100 && status < 600 ? Math.floor(status / 100) + 'xx' : 'other', 10);
    bump(S.devices, deviceOf(ua), 10);
    const cc = String(h['cf-ipcountry'] || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(cc) && cc !== 'XX') bump(S.countries, cc, 120);
    const ref = String(h.referer || h.referrer || '');
    const m = /^https?:\/\/([^\/?#]+)/i.exec(ref);
    if (m && String(h.host || '').toLowerCase() !== m[1].toLowerCase()) bump(S.referrers, m[1].toLowerCase().slice(0, 60), 100);
    if (uniq.size < 20000) uniq.add(v);
    active.set(v, now);
    recent.unshift({ m: String(req.method || 'GET').slice(0, 8), p, s: status, ms, at: now });
    if (recent.length > 30) recent.pop();
  }

  function snapshot() {
    const now = Date.now();
    const nowH = Math.floor(now / 3600000);
    const hourly = [];
    let day = 0;
    for (let i = 23; i >= 0; i--) { const c = S.hours[String(nowH - i)] || 0; hourly.push(c); day += c; }
    for (const [k, t] of active) if (now - t > 60000) active.delete(k);
    return {
      v: 1, now, bootAt: S.bootAt, total: S.total, visitors: uniq.size, active: active.size, requests24h: day,
      avgMs: Math.round(S.latencyMs || 0), hourly, routes: top(S.routes, 10), status: S.status, devices: S.devices,
      countries: top(S.countries, 8), referrers: top(S.referrers, 8), recent
    };
  }

  function persist() {
    try {
      const nowH = Math.floor(Date.now() / 3600000);
      Object.keys(S.hours).forEach((k) => { if (Number(k) < nowH - 48) delete S.hours[k]; });
      fs.writeFileSync(FILE, JSON.stringify(Object.assign({}, S, { uniques: Array.from(uniq).slice(-20000) })));
    } catch (e) { /* read-only disk is fine */ }
  }
  setInterval(persist, 60000).unref();
  process.on('SIGTERM', persist);

  const origEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (ev, req, res) {
    if (ev === 'request' && req && res) {
      try {
        const u = String(req.url || '');
        if (u.startsWith('/__webhost/stats')) {
          const k = new URL(u, 'http://x').searchParams.get('key') || '';
          const ok = KEY && k.length === KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(KEY));
          res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(ok ? JSON.stringify(snapshot()) : '{"error":"not found"}');
          return true;
        }
        const t0 = process.hrtime.bigint();
        let done = false;
        const fin = () => { if (done) return; done = true; try { record(req, res.statusCode, Number((process.hrtime.bigint() - t0) / 1000000n)); } catch (e) { /* never break the app */ } };
        res.once('finish', fin);
        res.once('close', fin);
      } catch (e) { /* never break the app */ }
    }
    return origEmit.apply(this, arguments);
  };
} catch (e) { /* analytics must never stop the site from starting */ }
