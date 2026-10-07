// 실제 서버 경로로 확정·풀기·권한별 숫자 확인(가짜 자료만 사용): node tests/lifecycle.cjs
// - 확정하면 기장추가로 고정, 풀면 파일의 수기 행·고정 표시를 되돌림(되돌린 뒤 기장추가를 지우면 파일 수기 행이 보임)
// - 본부 제한 사용자의 본부 숫자 = 관리자 화면의 같은 본부 숫자(기장추가가 다른 본부에만 있는 달 포함)
// - 서버 보관용 칸(fileManual)은 응답에 실리지 않음, 확정 아닌 자료의 고정 표시는 저장하지 않음
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { createSessions } = require('../lib/auth');

const SRC = path.join(__dirname, '..', '..', 'src');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(['org.js', 'model.js'].map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n') + '\n;this.Model=Model;', ctx);
const Model = ctx.Model;

const SECRET = crypto.randomBytes(48).toString('base64');
const ADMIN = 'admin@test.local'; const BU = 'bu2@test.local';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-life-'));
const PORT = 18090; const BASE = `http://127.0.0.1:${PORT}`;
const sid = (email) => `sid=${createSessions(8, SECRET).create(email, email)}`;
const row = (no, s, c) => ({ no, 사업부: s, 계약구분: '감사', 상태: '', 회사명: `고객${no}`, 보고서명: '', 체결일: '', 신규여부: '', 계약: c, 매출: 0, 사유: '' });
const cfgWith = (gijang) => ({ fyStart: 4, unit: 1000000, buOrder: ['1본부', '2본부'], plans: { '*': { '1본부': 1, '2본부': 1 } },
  orgRules: [['서울1감사', null, '1본부', null], ['서울2감사', null, '2본부', null]], catMap: [['감사', '감사'], ['기장', '기타']], gijang,
  access: [{ email: BU, all: false, admin: false, bus: ['2본부'] }] });

async function call(method, p, body, who = ADMIN) {
  const res = await fetch(BASE + p, { method, headers: { cookie: sid(who), 'x-dashboard': '1', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); if (!res.ok) throw new Error(`${method} ${p} ${res.status} ${t}`); return JSON.parse(t);
}
const view = async (who) => { const d = await call('GET', '/api/data', null, who); return { d, r: Model.build(Model.cfgFromPlain(d.cfg), d.datasets, {}) }; };
const disk = (m) => JSON.parse(fs.readFileSync(path.join(dir, 'months', `${m}.json`), 'utf8'));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dir,
    ADMIN_EMAILS: ADMIN, COOKIE_SECURE: 'false', SESSION_SECRET: SECRET, AUTH_MODE: 'local', LOCAL_ADMIN_PASSWORD_HASH: 'x', BACKUP_HOUR: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((ok, no) => { srv.stdout.on('data', (b) => { if (String(b).includes('서버')) ok(); }); srv.on('exit', no); });
    const G31 = [{ month: '2026-05', 사업부: '서울1감사', 계약구분: '기장', 계약: 31000000, 매출: 0, 메모: '' }];
    await call('POST', '/api/admin/input', { fileName: 'in.xlsx', cfg: cfgWith(G31) });
    const fileManual = [{ 사업부: '서울1감사', 계약구분: '기장', 계약: 7000000, 매출: 0, 메모: '' }, { 사업부: '서울2감사', 계약구분: '기장', 계약: 4000000, 매출: 0, 메모: '' }];
    await call('POST', '/api/admin/datasets', { datasets: [{ kind: 'contract', month: '2026-05', fileName: 'f.xlsx', sheetName: 's', rows: [row('A', '서울1감사', 100000000), row('B', '서울2감사', 50000000)], manual: fileManual, gijangFixed: true }] });
    assert.ok(!disk('2026-05').contract.gijangFixed, '확정 아닌 자료의 고정 표시는 저장하지 않음');

    // 기장추가가 1본부에만 있는 달: 2본부 사용자 = 관리자 화면의 2본부(파일 수기 행 4 는 쓰지 않음)
    let a = await view(ADMIN); let b = await view(BU);
    assert.deepEqual([a.r.metric('2026-05', '1본부').계약, a.r.metric('2026-05', '2본부').계약], [131, 50]);
    assert.equal(b.r.metric('2026-05', '2본부').계약, a.r.metric('2026-05', '2본부').계약, '본부 사용자 숫자 = 관리자 화면');

    await call('POST', '/api/admin/lock', { upto: '2026-05' });
    let rec = disk('2026-05');
    assert.ok(rec.locked && rec.contract.gijangFixed && rec.contract.manual[0].계약 === 31000000 && rec.fileManual.length === 2, '확정: 기장추가로 고정, 파일 행은 fileManual');
    for (const who of [ADMIN, BU]) assert.ok(!JSON.stringify((await view(who)).d).includes('fileManual'), 'fileManual 은 응답에 없음');
    b = await view(BU); a = await view(ADMIN);
    assert.equal(b.r.metric('2026-05', '2본부').계약, a.r.metric('2026-05', '2본부').계약, '확정 후에도 같은 숫자');

    await call('POST', '/api/admin/unlock', { month: '2026-05' });
    rec = disk('2026-05');
    assert.ok(!rec.locked && rec.autoLockHold && !rec.contract.gijangFixed && !rec.fileManual && rec.contract.manual.length === 2, '풀기: 파일 수기 행·표시 되돌림');
    await call('POST', '/api/admin/input', { fileName: 'in.xlsx', cfg: cfgWith([]) }); // 기장추가에서 5월을 지움
    a = await view(ADMIN); b = await view(BU);
    assert.deepEqual([a.r.metric('2026-05', '1본부').계약, a.r.metric('2026-05', '2본부').계약], [107, 54], '파일의 수기 행(7·4)이 다시 보임');
    assert.equal(b.r.metric('2026-05', '2본부').계약, 54);

    // 확정 → 새 파일을 올리려면 풀어야 한다. 다시 확정했다가 같은 달 새 파일(풀린 상태) 올리면 예전 fileManual 은 남지 않는다.
    await call('POST', '/api/admin/input', { fileName: 'in.xlsx', cfg: cfgWith(G31) });
    await call('POST', '/api/admin/lock', { upto: '2026-05' });
    await call('POST', '/api/admin/unlock', { month: '2026-05' });
    await call('POST', '/api/admin/datasets', { datasets: [{ kind: 'contract', month: '2026-05', fileName: 'g.xlsx', sheetName: 's', rows: [row('A', '서울1감사', 1)], manual: [] }] });
    assert.ok(!disk('2026-05').fileManual, '새 파일이 예전 수기 행을 대신함');
    console.log('PASS');
  } finally {
    srv.kill(); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
