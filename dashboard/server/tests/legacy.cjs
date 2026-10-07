// 예전 버전 자료 호환(가짜 자료만 사용): node tests/legacy.cjs
// - 2026.10.02-2 이하가 저장한 본부매핑 형식(buMap·buMapFy·buMapReported)을 이력 규칙으로 읽는지
// - 예전 버전에서 확정한 달의 합계가 업데이트 전후로 같은지(기장추가 고정)
// 기대값은 예전 버전 화면 계산(git 558f619^ 의 src/model.js)으로 구한 값이다.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createStorage } = require('../lib/storage');
const { fixLegacyLocks } = require('../lib/mapping');
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-legacy-'));
try {
  fs.mkdirSync(path.join(dir, 'months'));
  fs.writeFileSync(path.join(dir, 'input.json'), JSON.stringify({ cfg, fileName: 'old.xlsx' }));
  for (const [m, r] of Object.entries(months)) fs.writeFileSync(path.join(dir, 'months', `${m}.json`), JSON.stringify(r));

  const store = createStorage(dir);
  assert.deepEqual(store.load().input.cfg.orgRules, [
    ['서울1감사', null, '1본부', null],
    ['서울2감사', null, '2본부', '2본부'], ['서울2감사', '2025-04', '1본부', '2본부'], ['서울2감사', '2026-04', '2본부', '2본부'],
    ['서울4감사3', null, '4본부', '4본부'], ['서울4감사3', '2025-04', '6팀', '6팀'], ['서울4감사3', '2026-04', '4본부', '4본부'],
  ], '예전 본부매핑을 이력 규칙으로');
  assert.deepEqual(fixLegacyLocks(store), ['2025-08'], '예전 확정월만 고정');
  const rec = store.load().months['2025-08'];
  assert.ok(rec.contract.gijangFixed && rec.contract.manual[0].계약 === 50000000, '그때 보이던 입력용 기장추가 값으로 고정');
  assert.deepEqual(fixLegacyLocks(createStorage(dir)), [], '재시작 후에는 할 일 없음');

  const view = (user, basis) => { const p = filterFor(user, store.load().input, store.load().months); return Model.build(Model.cfgFromPlain(JSON.parse(JSON.stringify(p.cfg))), p.datasets, { basis }); };
  const admin = { admin: true, all: true, bus: [] };
  // 예전 버전 화면 값(백만원). 보고 당시 기준 25.08월은 확정 때 저장한 매핑(서울2감사 → 1본부)을 쓴다.
  const aug = { current: [350, 200, 0, 150, 700], reported: [550, 0, 0, 150, 700] };
  for (const basis of ['current', 'reported']) {
    const r = view(admin, basis);
    assert.deepEqual(['1본부', '2본부', '4본부', '6팀', '전체'].map((b) => r.metric('2025-08', b).계약), aug[basis], `25.08월 ${basis}`);
    assert.deepEqual(['1본부', '2본부', '4본부', '6팀', '전체'].map((b) => r.metric('2026-05', b).계약), [310, 200, 150, 0, 660], `26.05월 ${basis}`);
  }
  // 입력용을 다시 올려 기장추가를 바꿔도 확정월은 그대로
  store.saveInput({ ...store.load().input, cfg: { ...store.load().input.cfg, gijang: [] } });
  assert.equal(view(admin, 'current').metric('2025-08', '전체').계약, 700, '확정월은 기장추가를 바꿔도 그대로');
  // 본부 권한자·전체 조회자도 오류 없이 자기 범위를 본다
  const bu = view({ admin: false, all: false, bus: ['6팀', '2본부'] }, 'current');
  assert.equal(bu.metric('2025-08', '전체').계약, 350, '본부 권한자: 2본부+6팀');
  assert.equal(view({ admin: false, all: true, bus: [] }, 'current').metric('2025-08', '전체').계약, 700, '전체 조회자');
  console.log('PASS');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
