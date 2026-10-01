// 실적 대시보드 서버 — Node.js 기본 모듈만 사용한다(외부 패키지 없음).
// 설정은 모두 환경변수로 받는다(.env.example 참고).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const sanitize = require('./lib/sanitize');
const { createStorage } = require('./lib/storage');
const { resolveUser, filterFor } = require('./lib/access');
const auth = require('./lib/auth');
const { buildBackup, scheduleBackups } = require('./lib/backup');

// ---- 설정 -------------------------------------------------------------------
const env = process.env;
const readSecret = (name) => (env[`${name}_FILE`] ? fs.readFileSync(env[`${name}_FILE`], 'utf8').trim() : env[name] || '');
const config = {
  port: Number(env.PORT || 7020),
  // 기본은 NAS 안에서만 받는다(역방향 프록시가 https → 127.0.0.1:PORT 로 넘겨줌).
  host: env.HOST || '127.0.0.1',
  dataDir: env.DATA_DIR || path.join(__dirname, 'data'),
  sessionSecret: readSecret('SESSION_SECRET'),
  allowedDomains: (env.ALLOWED_EMAIL_DOMAINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  adminRole: env.OIDC_ADMIN_ROLE || '',
  backup: { dir: env.BACKUP_DIR || '', hour: Number(env.BACKUP_HOUR || 3), keepDays: Number(env.BACKUP_KEEP_DAYS || 30) },
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  authMode: env.AUTH_MODE || 'local',
  adminEmails: (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  localPasswordHash: readSecret('LOCAL_ADMIN_PASSWORD_HASH'),
  cookieSecure: env.COOKIE_SECURE !== 'false',
  sessionHours: Number(env.SESSION_HOURS || 8),
  maxUploadBytes: Number(env.MAX_UPLOAD_MB || 80) * 1024 * 1024,
  trustProxy: env.TRUST_PROXY === 'true',
  // 발급자 주소를 따로 주지 않으면 Entra ID 테넌트 ID 로 만든다.
  oidc: { issuer: env.OIDC_ISSUER || (env.OIDC_TENANT_ID ? `https://login.microsoftonline.com/${env.OIDC_TENANT_ID}/v2.0` : ''), clientId: env.OIDC_CLIENT_ID || '', clientSecret: readSecret('OIDC_CLIENT_SECRET'), tenantId: env.OIDC_TENANT_ID || '' },
};
if (!config.adminEmails.length) throw new Error('ADMIN_EMAILS 환경변수에 관리자 이메일을 하나 이상 넣어 주세요.');
if (config.authMode === 'local' && !config.localPasswordHash) throw new Error('AUTH_MODE=local 이면 LOCAL_ADMIN_PASSWORD_HASH 가 필요합니다 (node tools/hash-password.js).');
if (config.authMode === 'oidc' && (!config.oidc.issuer || !config.oidc.clientId || !config.oidc.clientSecret || !config.publicUrl)) {
  throw new Error('AUTH_MODE=oidc 이면 OIDC_TENANT_ID(또는 OIDC_ISSUER), OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, PUBLIC_URL 이 필요합니다.');
}
if (!['local', 'oidc'].includes(config.authMode)) throw new Error('AUTH_MODE 는 local 또는 oidc 입니다.');

const storage = createStorage(config.dataDir);
const sessions = auth.createSessions(config.sessionHours, config.sessionSecret);
const limiter = auth.createLimiter();
const oidc = config.authMode === 'oidc'
  ? auth.createOidc({ ...config.oidc, allowedDomains: config.allowedDomains, redirectUri: `${config.publicUrl}/auth/callback` })
  : null;
const PUBLIC_DIR = path.join(__dirname, 'public');
const indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
const VERSION = (() => { try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim(); } catch { return 'unknown'; } })();

// ---- 응답 도우미 --------------------------------------------------------------
function securityHeaders(res, nonce) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'", nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'", "style-src 'unsafe-inline'",
    'img-src data: blob:', "connect-src 'self'", "form-action 'self'", "base-uri 'none'", "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
function send(req, res, status, body, type) {
  securityHeaders(res);
  let data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.setHeader('Content-Type', type);
  if (data.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    data = zlib.gzipSync(data); res.setHeader('Content-Encoding', 'gzip');
  }
  res.writeHead(status); res.end(data);
}
const json = (req, res, status, obj) => send(req, res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
const redirect = (res, to, headers = {}) => { securityHeaders(res); res.writeHead(302, { Location: to, ...headers }); res.end(); };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(req, res, status, title, bodyHtml) {
  send(req, res, status, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:system-ui,"Segoe UI","Malgun Gothic",sans-serif;background:#f9f9f7;color:#0b0b0b}main{max-width:380px;margin:12vh auto;padding:24px 16px}
h1{font-size:20px}label{display:block;margin:12px 0 4px;font-size:14px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c3c2b7;border-radius:8px;font:inherit}
button,a.btn{display:inline-block;margin-top:16px;padding:10px 16px;border:0;border-radius:8px;background:#2a78d6;color:#fff;font:inherit;text-decoration:none;cursor:pointer}
.err{color:#d03b3b;font-size:14px}.muted{color:#52514e;font-size:13px}@media (prefers-color-scheme:dark){body{background:#0d0d0d;color:#fff}input{background:#1a1a19;color:#fff;border-color:#383835}.muted{color:#c3c2b7}}</style></head>
<body><main>${bodyHtml}</main></body></html>`, 'text/html; charset=utf-8');
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('올린 자료가 너무 큽니다.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const buf = await readBody(req, config.maxUploadBytes);
  const raw = req.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(buf, { maxOutputLength: config.maxUploadBytes * 4 }) : buf;
  try { return JSON.parse(raw.toString('utf8')); } catch { throw Object.assign(new Error('JSON 형식이 아닙니다.'), { status: 400 }); }
}
const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress);

// 다른 사이트에서 보낸 요청(CSRF)을 막는다: 전용 헤더 + 같은 출처 확인
function sameOrigin(req) {
  if (req.headers['x-dashboard'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  const expected = config.publicUrl || `${config.cookieSecure ? 'https' : 'http'}://${req.headers.host}`;
  return origin === expected;
}

// ---- 로그인 상태 --------------------------------------------------------------
function currentUser(req) {
  const s = sessions.get(auth.parseCookies(req.headers.cookie).sid);
  if (!s) return { session: null, user: null };
  return { session: s, user: resolveUser(s.email, storage.load().input, { adminEmails: config.adminEmails, roles: s.roles, adminRole: config.adminRole }) };
}
function startSession(res, email, name, to = '/') {
  const id = sessions.create(email, name);
  redirect(res, to, { 'Set-Cookie': auth.cookie('sid', id, { maxAge: sessions.maxAgeSeconds, secure: config.cookieSecure }) });
}

function loginForm(req, res, status = 200, error = '') {
  page(req, res, status, '로그인', `<h1>실적 대시보드</h1>
<form method="post" action="/auth/login"><label for="e">이메일</label><input id="e" name="email" type="email" autocomplete="username" required>
<label for="p">비밀번호</label><input id="p" name="password" type="password" autocomplete="current-password" required>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}<button type="submit">로그인</button></form>
<p class="muted">회사 계정(SSO) 로그인을 연결하기 전까지 쓰는 관리자 전용 로그인입니다.</p>`);
}

// ---- 관리자 작업 ------------------------------------------------------------
function monthRecord(m) { return storage.load().months[m] || { locked: false }; }
function stamp(rec, user) { rec.updatedAt = new Date().toISOString(); rec.by = user.email; return rec; }

const adminRoutes = {
  async input(body, user) {
    const cfg = sanitize.config(body.cfg);
    storage.saveInput({ cfg, fileName: String(body.fileName || '').slice(0, 300), updatedAt: new Date().toISOString(), by: user.email });
    storage.audit({ by: user.email, action: 'input', fileName: body.fileName });
    return { ok: true };
  },
  async datasets(body, user) {
    const saved = []; const skipped = [];
    const list = Array.isArray(body.datasets) ? body.datasets : [];
    for (const raw of list) {
      const d = sanitize.dataset(raw);
      const rec = { ...monthRecord(d.month) };
      if (rec.locked && !d.locked) { skipped.push({ month: d.month, kind: d.kind, fileName: d.fileName, why: 'locked' }); continue; }
      const { kind, month, locked, ...rest } = d;
      rec[kind] = rest;
      if (locked) rec.locked = true;
      storage.saveMonth(month, stamp(rec, user));
      saved.push({ month, kind, fileName: d.fileName, locked: !!rec.locked });
    }
    storage.audit({ by: user.email, action: 'datasets', saved, skipped });
    return { saved, skipped };
  },
  async lock(body, user) {
    if (!sanitize.isMonth(body.upto)) throw Object.assign(new Error('마감할 월을 골라 주세요.'), { status: 400 });
    const locked = [];
    for (const [m, rec] of Object.entries(storage.load().months)) {
      if (m <= body.upto && rec.contract && !rec.locked) { storage.saveMonth(m, stamp({ ...rec, locked: true }, user)); locked.push(m); }
    }
    storage.audit({ by: user.email, action: 'lock', upto: body.upto, locked });
    return { locked };
  },
  async unlock(body, user) {
    if (!sanitize.isMonth(body.month) || !storage.load().months[body.month]) throw Object.assign(new Error('없는 월입니다.'), { status: 404 });
    storage.saveMonth(body.month, stamp({ ...monthRecord(body.month), locked: false }, user));
    storage.audit({ by: user.email, action: 'unlock', month: body.month });
    return { ok: true };
  },
  async delete(body, user) {
    const rec = sanitize.isMonth(body.month) && storage.load().months[body.month];
    if (!rec) throw Object.assign(new Error('없는 월입니다.'), { status: 404 });
    if (rec.locked) throw Object.assign(new Error('확정된 달은 먼저 확정을 풀어야 지울 수 있습니다.'), { status: 409 });
    storage.deleteMonth(body.month);
    storage.audit({ by: user.email, action: 'delete', month: body.month });
    return { ok: true };
  },
};

// ---- 요청 처리 --------------------------------------------------------------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /healthz') return send(req, res, 200, `ok ${VERSION}`, 'text/plain');

  // 로그인
  if (route === 'GET /auth/login') {
    if (oidc) {
      const { url: to, state } = await oidc.startUrl();
      return redirect(res, to, { 'Set-Cookie': auth.cookie('oidc_state', state, { maxAge: 600, secure: config.cookieSecure }) });
    }
    return loginForm(req, res);
  }
  if (route === 'POST /auth/login' && !oidc) {
    const ip = clientIp(req);
    if (limiter.blocked(ip)) return loginForm(req, res, 429, '로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.');
    const form = new URLSearchParams((await readBody(req, 10 * 1024)).toString('utf8'));
    const email = String(form.get('email') || '').trim().toLowerCase();
    const ok = email === config.adminEmails[0] && auth.verifyPassword(form.get('password') || '', config.localPasswordHash);
    if (!ok) { limiter.fail(ip); return loginForm(req, res, 401, '이메일 또는 비밀번호가 맞지 않습니다.'); }
    limiter.reset(ip);
    storage.audit({ by: email, action: 'login', ip });
    return startSession(res, email, email);
  }
  if (route === 'GET /auth/callback' && oidc) {
    const state = url.searchParams.get('state') || '';
    if (!state || auth.parseCookies(req.headers.cookie).oidc_state !== state) return page(req, res, 400, '로그인 오류', '<h1>로그인 오류</h1><p>로그인 요청을 확인할 수 없습니다.</p><a class="btn" href="/auth/login">다시 로그인</a>');
    if (url.searchParams.get('error')) return page(req, res, 401, '로그인 취소', '<h1>로그인하지 않았습니다</h1><a class="btn" href="/auth/login">다시 로그인</a>');
    try {
      const who = await oidc.finish(url.searchParams.get('code') || '', state);
      storage.audit({ by: who.email, action: 'login', ip: clientIp(req) });
      const id = sessions.create(who.email, who.name, who.roles);
      return redirect(res, '/', { 'Set-Cookie': [auth.cookie('sid', id, { maxAge: sessions.maxAgeSeconds, secure: config.cookieSecure }), auth.cookie('oidc_state', '', { maxAge: 0, secure: config.cookieSecure })] });
    } catch (e) {
      return page(req, res, 401, '로그인 오류', `<h1>로그인 오류</h1><p>${escapeHtml(e.message)}</p><a class="btn" href="/auth/login">다시 로그인</a>`);
    }
  }
  if (route === 'POST /auth/logout') {
    sessions.destroy(auth.parseCookies(req.headers.cookie).sid);
    return redirect(res, '/auth/login', { 'Set-Cookie': auth.cookie('sid', '', { maxAge: 0, secure: config.cookieSecure }) });
  }

  // 여기부터는 로그인 필요
  const { session, user } = currentUser(req);
  if (!session) {
    if (url.pathname.startsWith('/api/')) return json(req, res, 401, { error: 'login' });
    return redirect(res, '/auth/login');
  }
  if (!user) {
    const msg = '이 계정에는 대시보드 조회 권한이 없습니다. 관리자에게 권한을 요청해 주세요.';
    if (url.pathname.startsWith('/api/')) return json(req, res, 403, { error: msg });
    return page(req, res, 403, '권한 없음', `<h1>권한 없음</h1><p>${escapeHtml(session.email)}</p><p>${msg}</p><form method="post" action="/auth/logout"><button>로그아웃</button></form>`);
  }

  if (route === 'GET /') {
    const nonce = crypto.randomBytes(16).toString('base64');
    securityHeaders(res, nonce);
    const html = indexHtml.replace(/<script>/g, `<script nonce="${nonce}">`);
    let data = Buffer.from(html);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { data = zlib.gzipSync(data); res.setHeader('Content-Encoding', 'gzip'); }
    res.writeHead(200); return res.end(data);
  }
  if (route === 'GET /api/data') {
    const { input, months } = storage.load();
    return json(req, res, 200, { user: { email: user.email, name: session.name, admin: user.admin, all: user.all, bus: user.bus }, input: input && user.admin ? { fileName: input.fileName, updatedAt: input.updatedAt, by: input.by } : null, ...filterFor(user, input, months) });
  }
  if (route === 'GET /api/admin/backup') {
    if (!user.admin) return json(req, res, 403, { error: '관리자만 할 수 있습니다.' });
    storage.audit({ by: user.email, action: 'backup-download' });
    res.setHeader('Content-Disposition', `attachment; filename="dashboard-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return send(req, res, 200, buildBackup(storage.load()), 'application/json; charset=utf-8');
  }
  const adminMatch = url.pathname.match(/^\/api\/admin\/([a-z]+)$/);
  if (req.method === 'POST' && adminMatch && adminRoutes[adminMatch[1]]) {
    if (!user.admin) return json(req, res, 403, { error: '관리자만 할 수 있습니다.' });
    if (!sameOrigin(req)) return json(req, res, 403, { error: '허용하지 않는 요청입니다.' });
    return json(req, res, 200, await adminRoutes[adminMatch[1]](await readJsonBody(req), user));
  }
  return json(req, res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) json(req, res, status, { error: status === 500 ? '서버 오류가 발생했습니다.' : e.message });
  });
});
server.requestTimeout = 5 * 60 * 1000;
scheduleBackups({ ...config.backup, dir: config.backup.dir || path.join(config.dataDir, 'backups'), load: storage.load, log: (m) => console.log(m) });
server.listen(config.port, config.host, () => console.log(`실적 대시보드 서버 ${VERSION}: http://${config.host}:${config.port} (로그인 방식: ${config.authMode})`));
