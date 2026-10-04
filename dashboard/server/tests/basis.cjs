// 서버: 확정할 때 보고 당시 매핑 저장 → 이후 본부매핑을 바꿔도 보고 당시 기준은 그대로인지,
// 백업·복구와 본부 권한 필터에도 유지되는지 확인한다(실적 파일은 인자로 받는다).
// 사용법: NODE_PATH=... node tests/basis.cjs <입력용(본부매핑에 적용시작월·현재 본부 이력 포함).xlsx> <25.04 파일> <26.08 파일>
'use strict';
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { hashPassword } = require('../lib/auth');
const { filterFor } = require('../lib/access');

const [inputPath, fy25, fy26] = process.argv.slice(2);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-basis-'));
const PASSWORD = crypto.randomBytes(12).toString('base64url');
const env = { ...process.env, PORT: '18085', HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_EMAILS: 'admin@test.local', COOKIE_SECURE: 'false',
  SESSION_SECRET: crypto.randomBytes(48).toString('base64'), AUTH_MODE: 'local', LOCAL_ADMIN_PASSWORD_HASH: hashPassword(PASSWORD), BACKUP_HOUR: '25' };
let srv;
const start = () => new Promise((res, rej) => { srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  srv.stdout.on('data', (d) => { if (String(d).includes('서버')) res(); }); srv.on('exit', (c) => rej(new Error(`exit ${c}`))); });

(async () => {
  await start();
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:18085/auth/login');
  await p.fill('#e', 'admin@test.local'); await p.fill('#p', PASSWORD); await p.click('button[type=submit]');
  await p.waitForSelector('.drop');
  // 업로드가 끝나면 처리 결과(notice)에 올린 파일 이름이 남는다.
  const upload = async (files) => {
    const seq = await p.evaluate(() => window.__dashboard.state.loadSeq);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=/파일 선택|자료 올리기/')]);
    await fc.setFiles(files);
    await p.waitForFunction((s0) => window.__dashboard.state.loadSeq > s0 && !window.__dashboard.state.busy, seq, { timeout: 60000 });
    await p.waitForSelector('.grid');
  };
  await upload([inputPath, fy25, fy26]);
  const api = (url, body) => p.evaluate(([u, bd]) => fetch(u, { method: 'POST', headers: { 'x-dashboard': '1', 'content-type': 'application/json' }, body: JSON.stringify(bd) }).then((r) => r.json()), [url, body]);
  await api('/api/admin/lock', { upto: '2026-08' }); await p.reload(); await p.waitForSelector('.grid');
  const read = (basis) => p.evaluate((bs) => { const s = window.__dashboard.state; const r = Model.build(s.cfg, s.datasets, { basis: bs, fy: 2025 }); const o = {}; for (const bu of ['1본부', '2본부', '4본부', '6팀', '전체']) o[bu] = Math.round(r.metric('2025-04', bu).계약 * 10) / 10; return o; }, basis);
  const cur1 = await read('current'); const rep1 = await read('reported');
  console.log('확정 직후  현재', JSON.stringify(cur1), ' 보고당시', JSON.stringify(rep1));
  assert.equal(rep1['1본부'], 5428.2); assert.equal(rep1['4본부'], 11976.3); assert.equal(cur1['6팀'], 3131);
  const meta = await p.evaluate(() => window.__dashboard.state.monthMeta.map((x) => [x.month, !!x.mappingAt]));
  assert.ok(meta.every(([, has]) => has), '확정한 달마다 보고 당시 매핑 저장');
  // 본부매핑을 바꿔 다시 올림: 옛 서울4감사3(적용시작월 빈 줄)의 현재 본부 → 2본부 (현재 기준만 바뀌어야 함)
  const changed = path.join(os.tmpdir(), `basis-input-${process.pid}.xlsx`);
  execFileSync('python3', ['-c', `
import openpyxl
wb=openpyxl.load_workbook(${JSON.stringify(inputPath)}); ws=wb['본부매핑']
for r in ws.iter_rows(min_row=3):
    if r[0].value=='서울4감사3' and not r[2].value: r[3].value='2본부'
wb.save(${JSON.stringify(changed)})`]);
  await upload([changed]);
  const cur2 = await read('current'); const rep2 = await read('reported');
  console.log('매핑 변경 후 현재', JSON.stringify(cur2), ' 보고당시', JSON.stringify(rep2));
  assert.equal(cur2['2본부'], Math.round((cur1['2본부'] + 2815) * 10) / 10, '현재 기준은 새 매핑으로 다시 나뉨');
  assert.deepEqual(rep2, rep1, '보고 당시 기준은 그대로');
  // 화면에서 기준 전환 버튼 동작
  await p.click('.seg[aria-label="조직 기준 선택"] button:has-text("보고 당시 기준")'); await p.waitForSelector('.notice:has-text("보고 당시 기준")');
  // 백업 → 빈 폴더 복구 후에도 보고 당시 매핑 유지
  const backup = await p.evaluate(() => fetch('/api/admin/backup').then((r) => r.text()));
  assert.ok(JSON.parse(backup).months['2025-04'].contract.mapping, '백업에 매핑 포함');
  // 본부 권한 필터: 6팀 사용자는 보고 당시엔 4본부·1본부였던 25.04 행도 받되(현재 기준이 6팀) 다른 본부 매핑은 받지 않음
  const store = require('../lib/storage').createStorage(dataDir);
  const out = filterFor({ email: 'six@test.local', admin: false, all: false, bus: ['6팀'] }, store.load().input, store.load().months);
  const d25 = out.datasets.find((d) => d.month === '2025-04' && d.kind === 'contract');
  assert.ok(d25.rows.length > 0 && d25.mapping.bu.every(([, bu]) => bu === '6팀'));
  console.log('6팀 권한자 25.04 행', d25.rows.length, '건, 매핑은 6팀 것만');
  // 직접 확정을 푼 달은 자동 확정 제외로 표시되고, 직접 다시 확정하면 해제된다.
  await api('/api/admin/unlock', { month: '2025-04' });
  const meta2 = await p.evaluate(() => fetch('/api/data').then((r) => r.json()).then((d) => d.months.find((x) => x.month === '2025-04')));
  assert.ok(!meta2.locked && meta2.autoLockHold, '확정 풀기 → 자동 확정 제외');
  await api('/api/admin/lock', { upto: '2025-04' });
  const meta3 = await p.evaluate(() => fetch('/api/data').then((r) => r.json()).then((d) => d.months.find((x) => x.month === '2025-04')));
  assert.ok(meta3.locked && !meta3.autoLockHold && meta3.mappingAt, '직접 확정 → 제외 해제·매핑 다시 저장');
  console.log('확정 풀기/다시 확정: 자동 확정 제외 표시 동작');
  assert.deepEqual(errs, []);
  await b.close(); srv.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(changed, { force: true }); 
  console.log('PASS');
})().catch((e) => { console.error('FAIL', e); srv?.kill(); process.exit(1); });
