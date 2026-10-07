// 예전 버전 자료 호환(가짜 자료만 사용): node tests/legacy.cjs
// - 2026.10.02-2 이하가 저장한 본부매핑 형식(buMap·buMapFy·buMapReported)을 이력 규칙으로 읽는지
// - 예전 버전에서 확정한 달: -6 이하(입력용 기장추가 따름)·-7/-8(확정 때 고정) 어느 쪽이든 덮어쓰지 않고, 고치기 전에 백업
// 기대값은 예전 버전 화면 계산(git 558f619^ 의 src/model.js)으로 구한 값이다.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createStorage } = require('../lib/storage');
const { fixLegacyLocks } = require('../lib/mapping');
const { writeBackupNow } = require('../lib/backup');
const { filterFor } = require('../lib/access');

const SRC = path.join(__dirname, '..', '..', 'src');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(['org.js', 'model.js'].map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n') + '\n;this.Model=Model;', ctx);
const Model = ctx.Model;

const row = (no, s, cat, c, r) => ({ no, 사업부: s, 계약구분: cat, 상태: '', 회사명: 'X' + no, 보고서명: '', 체결일: '', 신규여부: '', 계약: c, 매출: r });
const cfg = {
  company: '테스트', fyStart: 4, unit: 1000000, catOrder: ['감사', '기타'], yoyReviewMin: 100,
  buOrder: ['1본부', '2본부', '4본부', '6팀'],
  plans: { '*': { '1본부': 1000, '2본부': 1000, '4본부': 1000, '6팀': 500 } }, plansReported: {},
  buMap: [['서울1감사', '1본부'], ['서울2감사', '2본부'], ['서울4감사3', '4본부']],
  buMapFy: [[2025, '서울4감사3', '6팀']],
  buMapReported: [[2025, '서울2감사', '1본부']],
  catMap: [['감사', '감사'], ['기장', '기타']],
  people: {}, fund: { '2025-08': { 자금: 100, 예수금: 10, 전년자금: null, 전년예수금: null } }, prev: {}, arManual: {},
  gijang: [{ month: '2025-08', 사업부: '서울1감사', 계약구분: '기장', 계약: 50000000, 매출: 40000000, 메모: '' }],
  yoyReasons: [], reasons: {},
  access: [{ email: 'bu@test.local', all: false, admin: false, bus: ['6팀', '2본부'] }, { email: 'all@test.local', all: true, admin: false, bus: [] }],
};
const contract = (m, locked, extra = {}) => ({ fileName: `f${m}.xlsx`, sheetName: 's', asOf: null, locked, noId: 1,
  rows: [row('A1', '서울1감사', '감사', 300000000, 100000000), row('B1', '서울2감사', '감사', 200000000, 80000000), row('C1', '서울4감사3', '감사', 150000000, 60000000)],
  manual: [{ 사업부: '서울1감사', 계약구분: '기장', 계약: 10000000, 매출: 5000000, 메모: '' }], ...extra });
const months = {
  '2025-08': { locked: true, contract: contract('2025-08', true), mapping: { bu: [['서울1감사', '1본부'], ['서울2감사', '1본부'], ['서울4감사3', '6팀']], cat: cfg.catMap, at: '2025-09-20T00:00:00Z' }, updatedAt: 'x', by: 'admin' },
  '2026-05': { locked: false, contract: contract('2026-05', false), updatedAt: 'x', by: 'admin' },
};

const dirs = [];
// 예전 형식 자료로 데이터 폴더를 만든다. over: 월 기록 바꾸기, gijang: 입력용 기장추가 바꾸기
function setup({ over = {}, gijang = cfg.gijang } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-legacy-')); dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'months'));
  fs.writeFileSync(path.join(dir, 'input.json'), JSON.stringify({ cfg: { ...cfg, gijang }, fileName: 'old.xlsx' }));
  for (const [m, r] of Object.entries({ ...months, ...over })) fs.writeFileSync(path.join(dir, 'months', `${m}.json`), JSON.stringify(r));
  return { dir, store: createStorage(dir) };
}
const backupTo = (dir, store) => () => writeBackupNow(path.join(dir, 'backups'), store.load);
const view = (store, user, basis = 'current') => { const p = filterFor(user, store.load().input, store.load().months); return Model.build(Model.cfgFromPlain(JSON.parse(JSON.stringify(p.cfg))), p.datasets, { basis }); };
const admin = { admin: true, all: true, bus: [] };
const total = (store, m = '2025-08') => view(store, admin).metric(m, '전체').계약;
const g = (amt) => [{ month: '2025-08', 사업부: '서울1감사', 계약구분: '기장', 계약: amt, 매출: 40000000, 메모: '' }];
const PENDING = /예전 버전에서 확정한 달/;

try {
  // A. 2026.10.06-6 이하에서 확정(manual=파일 수기 행 10, 화면은 입력용 기장추가 50) → 업데이트
  {
    const { dir, store } = setup();
    assert.deepEqual(store.load().input.cfg.orgRules, [
      ['서울1감사', null, '1본부', null],
      ['서울2감사', null, '2본부', '2본부'], ['서울2감사', '2025-04', '1본부', '2본부'], ['서울2감사', '2026-04', '2본부', '2본부'],
      ['서울4감사3', null, '4본부', '4본부'], ['서울4감사3', '2025-04', '6팀', '6팀'], ['서울4감사3', '2026-04', '4본부', '4본부'],
    ], '예전 본부매핑을 이력 규칙으로');
    const before = fs.readFileSync(path.join(dir, 'months', '2025-08.json'), 'utf8');
    const r = fixLegacyLocks(store, { backup: backupTo(dir, store) });
    assert.deepEqual([r.pending, r.backupFile], [['2025-08'], null], 'A 기본: 어느 쪽인지 모르면 바꾸지 않음(백업도 필요 없음)');
    assert.equal(fs.readFileSync(path.join(dir, 'months', '2025-08.json'), 'utf8'), before, 'A 기본: 파일 그대로');
    assert.equal(total(store), 700, 'A 기본: 예전 화면 값(입력용 기장추가 기준) 유지');
    assert.ok(view(store, admin).warnings.some((w) => PENDING.test(w)), 'A 기본: 관리자에게 확인 필요 안내');

    const r2 = fixLegacyLocks(store, { mode: 'input', backup: backupTo(dir, store) });
    assert.deepEqual(r2.input, ['2025-08'], 'A input: 입력용 기장추가로 고정');
    const bk = JSON.parse(fs.readFileSync(r2.backupFile, 'utf8'));
    assert.equal(bk.months['2025-08'].contract.manual[0].계약, 10000000, 'A input: 바꾸기 전 값이 백업에 있음');
    const rec = store.load().months['2025-08'].contract;
    assert.ok(rec.gijangFixed && rec.manual[0].계약 === 50000000 && store.load().months['2025-08'].fileManual[0].계약 === 10000000, 'A input: 원래 파일 행은 월 기록의 fileManual(contract 밖)에 보관');
    assert.deepEqual(fixLegacyLocks(createStorage(dir), { mode: 'input' }).input, [], '재시작 후에는 할 일 없음');
    // 예전 버전 화면 값(백만원). 보고 당시 기준 25.08월은 확정 때 저장한 매핑(서울2감사 → 1본부)을 쓴다.
    const aug = { current: [350, 200, 0, 150, 700], reported: [550, 0, 0, 150, 700] };
    for (const basis of ['current', 'reported']) {
      const v = view(store, admin, basis);
      assert.deepEqual(['1본부', '2본부', '4본부', '6팀', '전체'].map((b) => v.metric('2025-08', b).계약), aug[basis], `25.08월 ${basis}`);
      assert.deepEqual(['1본부', '2본부', '4본부', '6팀', '전체'].map((b) => v.metric('2026-05', b).계약), [310, 200, 150, 0, 660], `26.05월 ${basis}`);
    }
    store.saveInput({ ...store.load().input, cfg: { ...store.load().input.cfg, gijang: [] } });
    assert.equal(total(store), 700, '고정 후에는 기장추가를 바꿔도 그대로');
    assert.equal(view(store, { admin: false, all: false, bus: ['6팀', '2본부'] }).metric('2025-08', '전체').계약, 350, '본부 권한자: 2본부+6팀');
    assert.equal(view(store, { admin: false, all: true, bus: [] }).metric('2025-08', '전체').계약, 700, '전체 조회자');

    // 서버 보관용 칸(fileManual 등)과 다른 본부 자료는 /api/data 응답에 실리지 않는다
    const KEYS = new Set(['kind', 'month', 'locked', 'fileName', 'sheetName', 'rows', 'asOf', 'manual', 'noId', 'gijangFixed', 'mapping']);
    for (const u of [admin, { admin: false, all: true, bus: [] }, { admin: false, all: false, bus: ['2본부'] }]) {
      const p = filterFor(u, store.load().input, store.load().months);
      for (const d of p.datasets) for (const k of Object.keys(d)) assert.ok(KEYS.has(k), `응답에 허용되지 않은 칸: ${k}`);
      assert.ok(!JSON.stringify(p).includes('fileManual'), 'fileManual 은 누구에게도 보내지 않음');
    }
    const p2 = filterFor({ admin: false, all: false, bus: ['2본부'] }, store.load().input, store.load().months);
    const body = JSON.stringify(p2);
    for (const other of ['서울1감사', '서울4감사3', 'XA1', 'XC1']) assert.ok(!body.includes(other), `2본부 사용자 응답에 다른 본부 자료 없음: ${other}`);
    assert.ok(p2.datasets.every((d) => d.kind !== 'contract' || (d.manual.length === 0 && d.noId === 0)), '다른 본부 수기 행·건수도 없음');
    assert.ok(p2.datasets.some((d) => d.rows.some((r) => r.사업부 === '서울2감사')), '자기 본부 자료는 있음');
  }

  // B. 2026.10.06-7·-8 에서 확정(manual=확정 때 기장추가 50으로 고정, 표시 없음) → 입력용 기장추가를 70으로 변경 → 업데이트
  {
    const locked8 = { ...months['2025-08'], contract: { ...months['2025-08'].contract, manual: g(50000000).map(({ month, ...x }) => x) } };
    const { dir, store } = setup({ over: { '2025-08': locked8 }, gijang: g(70000000) });
    const r = fixLegacyLocks(store, { backup: backupTo(dir, store) });
    assert.deepEqual(r.pending, ['2025-08'], 'B 기본: 덮어쓰지 않고 확인 필요');
    assert.equal(store.load().months['2025-08'].contract.manual[0].계약, 50000000, 'B 기본: 고정했던 값 그대로');
    const r2 = fixLegacyLocks(store, { mode: 'stored', backup: backupTo(dir, store) });
    assert.ok(r2.backupFile && r2.stored[0] === '2025-08', 'B stored: 백업 후 저장값 유지');
    assert.equal(store.load().months['2025-08'].contract.manual[0].계약, 50000000, 'B stored: -8 때 고정한 값 유지');
    assert.equal(total(store), 700, 'B stored: -8 화면 값(300+200+150+50) 그대로');
    assert.ok(!view(store, admin).warnings.some((w) => PENDING.test(w)), 'B stored: 안내 사라짐');
  }

  // C. 저장값과 입력용 기장추가가 같으면(어느 버전이든 결과가 같음) 값은 그대로 두고 표시만 붙인다
  {
    const same = { ...months['2025-08'], contract: { ...months['2025-08'].contract, manual: g(50000000).map(({ month, ...x }) => x) } };
    const { dir, store } = setup({ over: { '2025-08': same } });
    const r = fixLegacyLocks(store, { backup: backupTo(dir, store) });
    assert.ok(r.backupFile && r.same[0] === '2025-08' && !r.pending.length, 'C: 표시만 붙임(백업 먼저)');
    assert.equal(total(store), 700);
  }

  // D. 백업을 못 만들면 아무것도 바꾸지 않는다
  {
    const { store } = setup();
    const r = fixLegacyLocks(store, { mode: 'input', backup: () => { throw new Error('disk full'); } });
    assert.ok(r.error && r.pending.includes('2025-08') && !store.load().months['2025-08'].contract.gijangFixed, 'D: 백업 실패 시 변경 없음');
  }
  console.log('PASS');
} finally {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
}
