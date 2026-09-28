// 서버 종단 시험: 관리자 로그인·업로드·확정·재시작 유지, OIDC 로그인과 본부별 권한 필터링.
// 실제 실적 파일이 필요하므로 저장소에는 데이터 없이 스크립트만 둔다.
// 사용법: NODE_PATH=... node server/tests/e2e.cjs <expected.json> <입력용(권한 시트 포함).xlsx> <작업파일.xlsx...>
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { hashPassword } = require('../lib/auth');

const [expectedPath, inputPath, ...dataFiles] = process.argv.slice(2);
const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
const SERVER = path.join(__dirname, '..', 'server.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-'));
const ADMIN = 'admin@test.local';
const PASSWORD = crypto.randomBytes(12).toString('base64url');

const running = new Set();
function startServer(port, extraEnv) {
  const p = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_EMAILS: ADMIN, COOKIE_SECURE: 'false', ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  running.add(p); p.on('exit', () => running.delete(p));
  p.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  return new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => { if (String(d).includes('서버')) resolve(p); });
    p.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
}
const stop = (p) => new Promise((r) => { p.removeAllListeners('exit'); p.on('exit', r); p.kill(); });

async function metricsOf(page, months) {
  return page.evaluate((ms) => { const r = window.__dashboard.state.res; const out = {};
    for (const [m, bus] of Object.entries(ms)) for (const b of Object.keys(bus)) (out[m] ||= {})[b] = r.metric(m, b); return out; }, months);
}
function compare(actual, subset, label) {
  let n = 0;
  for (const [m, bus] of Object.entries(subset)) for (const [b, f] of Object.entries(bus)) for (const [k, want] of Object.entries(f)) {
    const x = actual[m][b]; const got = k.startsWith('cat:') ? x.cats[k.slice(4)] : k.startsWith('people:') ? x.people[k.slice(7)] : x[k];
    assert.ok(got != null && Math.abs(got - want) < 0.01, `${label} ${m} ${b} ${k}: want ${want} got ${got}`); n++;
  }
  return n;
}

// ---- 가짜 OIDC 제공자 (Entra ID 대신) ----
function startIdp(port, clientId) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
  const issuer = `http://127.0.0.1:${port}`;
  const codes = new Map(); let who = null;
  const sign = (claims) => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`;
  };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, issuer);
    if (u.pathname === '/.well-known/openid-configuration') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` })); }
    if (u.pathname === '/jwks') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ keys: [jwk] })); }
    if (u.pathname === '/authorize') {
      const code = crypto.randomBytes(8).toString('hex');
      codes.set(code, { nonce: u.searchParams.get('nonce'), challenge: u.searchParams.get('code_challenge'), who });
      res.writeHead(302, { Location: `${u.searchParams.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(u.searchParams.get('state'))}` }); return res.end();
    }
    if (u.pathname === '/token') {
      let body = ''; for await (const c of req) body += c;
      const f = new URLSearchParams(body); const c = codes.get(f.get('code')); codes.delete(f.get('code'));
      const pkceOk = c && crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') === c.challenge;
      if (!c || !pkceOk || f.get('client_id') !== clientId) { res.writeHead(400); return res.end('{}'); }
      const now = Math.floor(Date.now() / 1000);
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ id_token: sign({ iss: issuer, aud: clientId, exp: now + 600, iat: now, nonce: c.nonce, tid: 'tenant-1', preferred_username: c.who, name: c.who }) }));
    }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({ srv, setUser: (e) => { who = e; }, issuer })));
}

(async () => {
  const browser = await chromium.launch();
  let ok = 0;
  // 1) 임시 관리자 로그인 + 업로드
  let srv = await startServer(18080, { AUTH_MODE: 'local', LOCAL_ADMIN_PASSWORD_HASH: hashPassword(PASSWORD) });
  let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:18080/');
  assert.match(page.url(), /\/auth\/login$/);
  await page.fill('#e', ADMIN); await page.fill('#p', 'wrong-password'); await page.click('button[type=submit]');
  assert.ok(await page.locator('.err').count(), '틀린 비밀번호는 거절');
  await page.fill('#e', ADMIN); await page.fill('#p', PASSWORD); await page.click('button[type=submit]');
  await page.waitForSelector('.drop');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=파일 선택')]);
  await fc.setFiles([inputPath, ...dataFiles]);
  await page.waitForSelector('.grid', { timeout: 60000 }).catch(async (e) => {
    console.error(await page.evaluate(() => JSON.stringify({ cfg: !!window.__dashboard.state.cfg, ds: window.__dashboard.state.datasets.map((d) => [d.kind, d.month, d.rows.length]), res: window.__dashboard.state.res && Object.keys(window.__dashboard.state.res).slice(0, 5), errors: window.__dashboard.state.errors, notice: window.__dashboard.state.notice, busy: window.__dashboard.state.busy })), errs);
    throw e;
  });
  ok += compare(await metricsOf(page, expected), expected, 'admin'); console.log('관리자 업로드 후 숫자 일치', ok);

  // 2) 확정 후 같은 달 다시 올리기 → 저장 안 됨
  await page.evaluate(() => fetch('/api/admin/lock', { method: 'POST', headers: { 'x-dashboard': '1', 'content-type': 'application/json' }, body: JSON.stringify({ upto: '2026-08' }) }));
  const csrf = await page.evaluate(() => fetch('/api/admin/lock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"upto":"2026-08"}' }).then((r) => r.status));
  assert.equal(csrf, 403, '전용 헤더 없는 요청 거절(CSRF)');
  await page.reload(); await page.waitForSelector('.grid');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=자료 올리기')]);
  await fc2.setFiles([dataFiles[dataFiles.length - 1]]);
  await page.waitForFunction(() => window.__dashboard.state.errors.some((e) => e.includes('확정된 달')), null, { timeout: 60000 });
  console.log('확정된 달 보호 확인');
  await stop(srv);

  // 3) 재시작 후에도 자료 유지 + OIDC 로그인 + 권한 필터
  const idp = await startIdp(18090, 'client-1');
  srv = await startServer(18081, { AUTH_MODE: 'oidc', OIDC_ISSUER: idp.issuer, OIDC_CLIENT_ID: 'client-1', OIDC_CLIENT_SECRET: 'secret', OIDC_TENANT_ID: 'tenant-1', PUBLIC_URL: 'http://127.0.0.1:18081' });
  for (const [email, bu] of [[ADMIN, null], ['busan@test.local', '부산']]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    idp.setUser(email);
    await p.goto('http://127.0.0.1:18081/'); await p.waitForSelector('.grid', { timeout: 30000 });
    const data = await p.evaluate(() => fetch('/api/data').then((r) => r.json()));
    if (!bu) {
      ok += compare(await metricsOf(p, expected), expected, 'oidc-admin'); console.log('재시작·SSO 관리자 숫자 일치');
    } else {
      const buMap = new Map(data.cfg.buMap);
      const bad = data.datasets.flatMap((d) => d.rows).filter((r) => buMap.get(String(r.사업부).replace(/\s+/g, '')) !== bu);
      assert.equal(bad.length, 0, '권한 밖 행이 내려오지 않아야 함');
      assert.deepEqual(data.cfg.buOrder, [bu]); assert.ok(Object.keys(data.cfg.fund).length > 0, '자금·예수금은 기본적으로 모두 공개'); assert.deepEqual(data.cfg.access, []);
      assert.equal(await p.locator('.tab:has-text("검증")').count(), 0, '조회자는 관리 탭 없음');
      assert.equal(await p.locator('.seg[aria-label="본부 선택"] button').allInnerTexts().then((t) => t.join(',')), bu);
      const sub = Object.fromEntries(Object.entries(expected).map(([m, v]) => [m, { [bu]: Object.fromEntries(Object.entries(v[bu])) }]));
      ok += compare(await metricsOf(p, sub), sub, 'oidc-busan');
      const adminCall = await p.evaluate(() => fetch('/api/admin/lock', { method: 'POST', headers: { 'x-dashboard': '1', 'content-type': 'application/json' }, body: '{"upto":"2026-08"}' }).then((r) => r.status));
      assert.equal(adminCall, 403, '조회자는 관리 기능 불가');
      console.log('부산 권한: 부산 자료만 수신, 숫자 일치');
    }
    await ctx.close();
  }
  // 권한 없는 계정
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  idp.setUser('nobody@test.local'); await p.goto('http://127.0.0.1:18081/');
  assert.ok((await p.content()).includes('권한 없음'), '권한 없는 계정 차단');
  assert.equal(await p.evaluate(() => fetch('/api/data').then((r) => r.status)), 403);
  console.log('권한 없는 계정 차단');
  await stop(srv); idp.srv.close(); await browser.close();
  assert.deepEqual(errs, []);
  console.log(`PASS (${ok} values)`);
  fs.rmSync(dataDir, { recursive: true, force: true });
})().catch((e) => { console.error('FAIL', e); running.forEach((p) => p.kill()); process.exit(1); });
