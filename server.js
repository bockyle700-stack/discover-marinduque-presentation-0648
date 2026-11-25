const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const DEFAULT_CONTENT_FILE = path.join(PUBLIC_DIR, 'content.default.json');

// Admin password. Override on a real host with the ADMIN_PASSWORD environment variable.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'students@@';

const MAX_JSON_BYTES = 2 * 1024 * 1024;     // 2 MB of slide text
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;  // 25 MB per image
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;  // 500 MB per source video
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// ---------- helpers ----------
const sessions = new Map(); // token -> expiry
const attempts = new Map(); // ip -> { count, lockedUntil }

function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }
function safeEqual(a, b) { return crypto.timingSafeEqual(sha(a), sha(b)); }

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > limit) {
        failed = true;
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function getToken(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

function isAuthed(req) {
  const token = getToken(req);
  const exp = token && sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'gif';
  return null;
}


function sniffVideo(head) {
  if (head.length < 12) return null;
  if (head.slice(4, 8).toString() === 'ftyp') return 'mp4';
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
  return null;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve({ code: -1, out }));
    p.on('close', (code) => resolve({ code, out }));
  });
}

async function optimizeVideo(src, outBase) {
  const mp4 = outBase + '.mp4';
  const poster = outBase + '.jpg';
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate',
    '-of', 'default=nw=1:nk=1', src]);
  const [a, b] = String(probe.out).trim().split('/').map(Number);
  const fps = b ? a / b : a || 30;
  const chain = ['scale=1920:1920:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos'];
  if (fps < 50) {
    chain.push(process.env.INTERPOLATE === '1' ? 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1' : 'fps=60');
  }
  const enc = await run('ffmpeg', ['-y', '-i', src, '-an', '-vf', chain.join(','),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-g', '120', '-movflags', '+faststart', mp4]);
  if (enc.code !== 0) return null;
  await run('ffmpeg', ['-y', '-ss', '0.4', '-i', mp4, '-frames:v', '1', '-q:v', '3', poster]);
  return { mp4: path.basename(mp4), poster: fs.existsSync(poster) ? path.basename(poster) : null };
}

function receiveToFile(req, dest, limit) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    let size = 0, head = null, failed = false;
    req.on('data', (c) => {
      if (failed) return;
      if (!head) head = c.slice(0, 16);
      size += c.length;
      if (size > limit) { failed = true; out.destroy(); fs.unlink(dest, () => {}); reject(Object.assign(new Error('big'), { status: 413 })); return; }
      out.write(c);
    });
    req.on('end', () => { if (!failed) out.end(() => resolve({ head: head || Buffer.alloc(0), size })); });
    req.on('error', reject);
  });
}

function loadContent() {
  for (const file of [CONTENT_FILE, DEFAULT_CONTENT_FILE]) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* try next */ }
  }
  return { version: 2, slides: [] };
}

function validContent(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.slides)) return false;
  if (data.slides.length < 1 || data.slides.length > 500) return false;
  return data.slides.every((s) => s && typeof s === 'object' && typeof s.type === 'string' && typeof s.id === 'string');
}

// ---------- API ----------
async function handleApi(req, res, pathname) {
  try {
    if (pathname === '/api/health') return sendJson(res, 200, { status: 'ok', project: 'Discover Marinduque' });

    if (pathname === '/api/content' && req.method === 'GET') {
      return sendJson(res, 200, loadContent());
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
      const rec = attempts.get(ip) || { count: 0, lockedUntil: 0 };
      if (rec.lockedUntil > Date.now()) {
        return sendJson(res, 429, { error: 'Too many attempts. Please wait a few minutes and try again.' });
      }
      let body = {};
      try { body = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}'); } catch (_) { /* ignore */ }
      if (typeof body.password === 'string' && safeEqual(body.password, ADMIN_PASSWORD)) {
        attempts.delete(ip);
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, Date.now() + SESSION_TTL_MS);
        return sendJson(res, 200, { token });
      }
      rec.count += 1;
      if (rec.count >= 5) { rec.lockedUntil = Date.now() + 5 * 60 * 1000; rec.count = 0; }
      attempts.set(ip, rec);
      return sendJson(res, 401, { error: 'Incorrect password.' });
    }

    if (pathname === '/api/session' && req.method === 'GET') {
      return sendJson(res, 200, { admin: isAuthed(req), ffmpeg: HAS_FFMPEG });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      sessions.delete(getToken(req));
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/content' && req.method === 'PUT') {
      if (!isAuthed(req)) return sendJson(res, 401, { error: 'Not authorized.' });
      const raw = await readBody(req, MAX_JSON_BYTES);
      let data;
      try { data = JSON.parse(raw.toString('utf8')); } catch (_) { return sendJson(res, 400, { error: 'Invalid JSON.' }); }
      if (!validContent(data)) return sendJson(res, 400, { error: 'Invalid content.' });
      const tmp = CONTENT_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ version: 2, slides: data.slides }));
      fs.renameSync(tmp, CONTENT_FILE);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/upload-video' && req.method === 'POST') {
      if (!isAuthed(req)) return sendJson(res, 401, { error: 'Not authorized.' });
      const id = crypto.randomBytes(12).toString('hex');
      const tmp = path.join(UPLOAD_DIR, id + '.src');
      const { head } = await receiveToFile(req, tmp, MAX_VIDEO_BYTES);
      const kind = sniffVideo(head);
      if (!kind) { fs.unlink(tmp, () => {}); return sendJson(res, 415, { error: 'Please upload an MP4, MOV or WebM video.' }); }
      if (HAS_FFMPEG) {
        const done = await optimizeVideo(tmp, path.join(UPLOAD_DIR, id));
        fs.unlink(tmp, () => {});
        if (done) return sendJson(res, 200, { url: 'uploads/' + done.mp4, poster: done.poster ? 'uploads/' + done.poster : null, optimized: true });
        return sendJson(res, 422, { error: 'This video could not be processed. Try exporting it as MP4 (H.264).' });
      }
      const final = id + '.' + kind;
      fs.renameSync(tmp, path.join(UPLOAD_DIR, final));
      return sendJson(res, 200, { url: 'uploads/' + final, poster: null, optimized: false });
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      if (!isAuthed(req)) return sendJson(res, 401, { error: 'Not authorized.' });
      const buf = await readBody(req, MAX_UPLOAD_BYTES);
      const ext = sniffImage(buf);
      const declared = IMAGE_TYPES[String(req.headers['content-type'] || '').split(';')[0].trim()];
      if (!ext || !declared) return sendJson(res, 415, { error: 'Please upload a JPG, PNG, WebP or GIF image.' });
      const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      return sendJson(res, 200, { url: 'uploads/' + name });
    }

    return sendJson(res, 404, { error: 'Not found.' });
  } catch (err) {
    const status = err.status || 500;
    return sendJson(res, status, { error: status === 413 ? 'File is too large.' : 'Server error.' });
  }
}

// ---------- static files ----------
function serveFile(res, filePath, extraHeaders) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, Object.assign({
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    }, extraHeaders));
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_) {
    res.writeHead(400); res.end('Bad request'); return;
  }

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }

  // Uploaded media (images and videos, with Range support so video streams and seeks smoothly)
  if (pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length);
    if (!/^[a-f0-9]{24}\.(jpg|png|webp|gif|mp4|webm)$/.test(name)) { res.writeHead(404); res.end('Not found'); return; }
    const file = path.join(UPLOAD_DIR, name);
    fs.stat(file, (err, st) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const type = MIME_TYPES[path.extname(name)] || 'application/octet-stream';
      const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (m && (m[1] || m[2])) {
        let start = m[1] ? parseInt(m[1], 10) : st.size - parseInt(m[2], 10);
        let end = m[1] && m[2] ? parseInt(m[2], 10) : st.size - 1;
        end = Math.min(end, st.size - 1);
        if (!(start >= 0 && start <= end)) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); res.end(); return; }
        res.writeHead(206, Object.assign({}, base, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size, 'Content-Length': end - start + 1 }));
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, Object.assign({}, base, { 'Content-Length': st.size }));
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
    return;
  }

  // Public site
  const target = path.resolve(PUBLIC_DIR, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(target, (err, stats) => {
    if (!err && stats.isFile()) {
      serveFile(res, target, { 'Cache-Control': 'no-cache' });
    } else if (path.extname(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
    } else {
      serveFile(res, path.join(PUBLIC_DIR, 'index.html'), { 'Cache-Control': 'no-cache' });
    }
  });
});

server.requestTimeout = 0;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Discover Marinduque presentation running at http://0.0.0.0:${PORT}`);
});
