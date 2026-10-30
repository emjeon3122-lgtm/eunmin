// 자동 확정 규칙 확인(가짜 자료만 사용): node tests/autolock.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createStorage } = require('../lib/storage');
const { dueMonth, autoLock } = require('../lib/autolock');

// 기한 계산: 20일 전에는 지지난달, 20일부터 지난달, 1월이면 전년 12월
assert.equal(dueMonth(new Date(2026, 9, 19, 23), 20), '2026-08');
assert.equal(dueMonth(new Date(2026, 9, 20, 0), 20), '2026-09');
assert.equal(dueMonth(new Date(2027, 0, 25), 20), '2026-12');
assert.equal(dueMonth(new Date(2027, 0, 5), 20), '2026-11');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-autolock-'));
try {
  const store = createStorage(dir);
  const contract = { fileName: 'x.xlsx', sheetName: 's', rows: [], manual: [] };
  const cfg = { orgRules: [['A', null, '1본부', null]], catMap: [], autoLockDay: null };
  store.saveInput({ cfg });
  for (const m of ['2026-07', '2026-08', '2026-09']) store.saveMonth(m, { locked: false, contract });
  store.saveMonth('2026-06', { locked: false }); // 자료가 없는 달
  store.saveMonth('2026-05', { locked: false, contract, autoLockHold: true }); // 관리자가 직접 푼 달

  assert.deepEqual(autoLock(store, new Date(2026, 9, 25)).locked, [], '자동 확정일이 없으면 꺼짐');
  store.saveInput({ cfg: { ...cfg, autoLockDay: 20 } });
  assert.deepEqual(autoLock(store, new Date(2026, 9, 4)).locked.sort(), ['2026-07', '2026-08'], '20일 전: 8월까지');
  const months = store.load().months;
  assert.ok(months['2026-08'].locked && months['2026-08'].mapping?.bu?.length === 1, '확정할 때 보고 당시 매핑 저장');
  assert.equal(months['2026-08'].by, '자동 확정');
  assert.ok(!months['2026-09'].locked && !months['2026-06'].locked && !months['2026-05'].locked, '9월·자료 없는 달·직접 푼 달은 그대로');
  assert.deepEqual(autoLock(store, new Date(2026, 9, 20, 1)).locked, ['2026-09'], '20일부터 9월');
  assert.deepEqual(autoLock(store, new Date(2026, 9, 21)).locked, [], '두 번째 확인은 할 일 없음');
  const log = fs.readFileSync(path.join(dir, 'audit.log'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(log.filter((e) => e.by === '자동 확정' && e.action === 'lock').length, 2, '변경 기록');
  console.log('PASS');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
