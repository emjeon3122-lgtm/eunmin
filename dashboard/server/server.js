// 실적 대시보드 서버 — Node.js 기본 모듈만 사용한다(외부 패키지 없음).
// 설정은 모두 환경변수로 받는다(.env.example 참고).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const crypto = require('node:crypto');
const sanitize = require('./lib/sanitize');
const { createStorage } = require('./lib/storage');
const { resolveUser, filterFor } = require('./lib/access');
const auth = require('./lib/auth');
const { buildBackup, scheduleBackups, writeBackupNow } = require('./lib/backup');
const { scheduleAutoLock } = require('./lib/autolock');
const { effectiveMapping, frozenContract, fixLegacyLocks } = require('./lib/mapping');

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
  legacyLockGijang: ['stored', 'input'].includes(env.LEGACY_LOCK_GIJANG) ? env.LEGACY_LOCK_GIJANG : '',
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
const sessions = auth.createSessions(config.sessionHours, config.sessionSecret, { revokedFile: path.join(config.dataDir, 'revoked-sessions.json') });
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
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
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
// 보는 사람 묶음(관리자 / 전체 조회 / 본부 조합)마다 같은 자료를 보내므로, 압축한 응답을 자료가 바뀔 때까지 재사용한다.
const dataCache = new Map(); let dataCacheVersion = -1;
function dataPayload(user) {
  if (dataCacheVersion !== storage.version) { dataCache.clear(); dataCacheVersion = storage.version; }
  const key = user.admin ? 'admin' : user.all ? 'all' : `bu:${JSON.stringify([...new Set(user.bus)].sort())}`; // 본부 이름에 어떤 글자가 있어도 겹치지 않게
  if (!dataCache.has(key)) {
    const { input, months } = storage.load();
    const p = gzip(Buffer.from(JSON.stringify(filterFor(user, input, months))));
    p.catch(() => dataCache.delete(key));
    dataCache.set(key, p);
  }
  return dataCache.get(key);
}
function sendGzipped(req, res, gz) {
  securityHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.setHeader('Content-Encoding', 'gzip'); res.writeHead(200); return res.end(gz); }
  res.writeHead(200); return res.end(zlib.gunzipSync(gz));
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
const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);
async function readJsonBody(req) {
  const buf = await readBody(req, config.maxUploadBytes);
  let raw = buf;
  if (req.headers['content-encoding'] === 'gzip') {
    // 압축을 푼 크기도 올리기 한도 안에서만(압축 폭탄 방지). 깨진 압축은 400.
    try { raw = await gunzip(buf, { maxOutputLength: config.maxUploadBytes }); } catch { throw Object.assign(new Error('올린 자료의 압축이 올바르지 않거나 너무 큽니다.'), { status: 400 }); }
  }
  try { return JSON.parse(raw.toString('utf8')); } catch { throw Object.assign(new Error('JSON 형식이 아닙니다.'), { status: 400 }); }
}
// 역방향 프록시는 실제 접속 주소를 X-Forwarded-For 의 맨 뒤에 붙인다. 앞쪽 값은 접속한 사람이 마음대로 넣을 수 있으므로 쓰지 않는다.
const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',').pop().trim() : req.socket.remoteAddress);

// 다른 사이트에서 보낸 요청(CSRF)을 막는다: 전용 헤더 + 같은 출처 확인
function sameOrigin(req) {
  if (req.headers['x-dashboard'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === expectedOrigin(req);
}
function expectedOrigin(req) { return config.publicUrl || `${config.cookieSecure ? 'https' : 'http'}://${req.headers.host}`; }

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
      const { kind, month, locked, mapping, autoLockHold, ...rest } = d;
      rec[kind] = rest;
      // 마감자료·백업에서 온 확정 자료는 그때 저장한 보고 당시 매핑을 그대로 쓴다.
      if (locked) { rec.locked = true; if (kind === 'contract' && mapping) rec.mapping = mapping; }
      else if (autoLockHold) rec.autoLockHold = true; // 백업 복구: 관리자가 직접 푼 달은 자동 확정에서 계속 제외
      storage.saveMonth(month, stamp(rec, user));
      saved.push({ month, kind, fileName: d.fileName, locked: !!rec.locked });
    }
    storage.audit({ by: user.email, action: 'datasets', saved, skipped });
    return { saved, skipped };
  },
  async lock(body, user) {
    if (!sanitize.isMonth(body.upto)) throw Object.assign(new Error('마감할 월을 골라 주세요.'), { status: 400 });
    const { input, months } = storage.load();
    if (!input) throw Object.assign(new Error('입력용 엑셀을 먼저 올려 주세요(확정할 때 본부매핑을 함께 저장합니다).'), { status: 409 });
    const locked = [];
    for (const [m, rec] of Object.entries(months)) {
      // 확정하는 순간의 본부·중분류 매핑을 '보고 당시 기준'으로 함께 저장한다.
      if (m <= body.upto && rec.contract && !rec.locked) {
        const { autoLockHold, ...keep } = rec; // 직접 확정하면 자동 확정 제외 표시도 지운다
        storage.saveMonth(m, stamp({ ...keep, contract: frozenContract(input.cfg, m, keep.contract), locked: true, mapping: effectiveMapping(input.cfg, m) }, user)); locked.push(m);
      }
    }
    storage.audit({ by: user.email, action: 'lock', upto: body.upto, locked });
    return { locked };
  },
  async unlock(body, user) {
    if (!sanitize.isMonth(body.month) || !storage.load().months[body.month]) throw Object.assign(new Error('없는 월입니다.'), { status: 404 });
    const { mapping, ...rest } = monthRecord(body.month); // 확정을 풀면 보고 당시 매핑도 지운다(다시 확정할 때 새로 저장)
    // 직접 푼 달은 고치는 중일 수 있으므로 자동 확정이 다시 잠그지 않는다(관리자가 직접 확정하면 해제).
    storage.saveMonth(body.month, stamp({ ...rest, locked: false, autoLockHold: true }, user));
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

  // 상태 확인: 본문은 'ok' 만(배포 도구가 그대로 비교), 버전은 X-Dashboard-Version 머리글로 알려 준다.
  if (route === 'GET /healthz') { res.setHeader('X-Dashboard-Version', VERSION); return send(req, res, 200, 'ok', 'text/plain'); }

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
    // 이메일이 틀려도 비밀번호 확인을 똑같이 해서, 응답 시간으로 관리자 이메일을 알아낼 수 없게 한다.
    const passwordOk = await auth.verifyPassword(form.get('password') || '', config.localPasswordHash);
    const ok = passwordOk && email === config.adminEmails[0];
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
    // 다른 사이트에서 보낸 로그아웃 요청은 무시(로그아웃 버튼은 같은 출처의 일반 양식이라 전용 헤더가 없다)
    const origin = req.headers.origin;
    if (origin && origin !== expectedOrigin(req)) return redirect(res, '/');
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
  if (route === 'GET /api/me') {
    const { input } = storage.load();
    return json(req, res, 200, { user: { email: user.email, name: session.name, admin: user.admin, all: user.all, bus: user.bus }, input: input && user.admin ? { fileName: input.fileName, updatedAt: input.updatedAt, by: input.by } : null });
  }
  if (route === 'GET /api/data') return sendGzipped(req, res, await dataPayload(user));
  if (route === 'GET /api/admin/backup') {
    if (!user.admin) return json(req, res, 403, { error: '관리자만 할 수 있습니다.' });
    storage.audit({ by: user.email, action: 'backup-download' });
    res.setHeader('Content-Disposition', `attachment; filename="dashboard-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return send(req, res, 200, buildBackup(storage.load()), 'application/json; charset=utf-8');
  }
  const adminMatch = url.pathname.match(/^\/api\/admin\/([a-z]+)$/);
  if (req.method === 'POST' && adminMatch && Object.hasOwn(adminRoutes, adminMatch[1])) {
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
{ // 예전 버전에서 확정한 달 정리(lib/mapping.js). 바꾸기 전에 백업 폴더에 pre-upgrade-*.json 을 남긴다.
  const backupDir = config.backup.dir || path.join(config.dataDir, 'backups');
  const r = fixLegacyLocks(storage, { mode: config.legacyLockGijang, backup: () => writeBackupNow(backupDir, storage.load) });
  if (r.backupFile) console.log(`업데이트 전 백업: ${r.backupFile}`);
  if (r.error) console.log(r.error);
  for (const k of ['same', 'stored', 'input']) if (r[k].length) console.log(`예전 확정월 기장 수기분 고정(${k}): ${r[k].join(', ')}`);
  if (r.pending.length) console.log(`확인 필요: 예전 확정월 ${r.pending.join(', ')} 은 저장된 기장 수기분과 입력용 기장추가가 다릅니다. 값은 바꾸지 않았습니다(화면은 입력용 기장추가 기준). UPDATE.md 의 LEGACY_LOCK_GIJANG 참고.`);
}
scheduleAutoLock({ storage, log: (m) => console.log(m) });
server.listen(config.port, config.host, () => console.log(`실적 대시보드 서버 ${VERSION}: http://${config.host}:${config.port} (로그인 방식: ${config.authMode})`));
