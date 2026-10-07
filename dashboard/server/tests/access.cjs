// 권한별 /api/data 응답 범위(가짜 자료만 사용): node tests/access.cjs
// 본부 제한 사용자에게 다른 본부의 행·수기 행·사유·파일 이름·서버 보관용 칸이 가지 않는지 확인한다.
'use strict';
const assert = require('node:assert/strict');
const { filterFor } = require('../lib/access');
const { config } = require('../lib/sanitize');

const row = (no, s, amt, why = '') => ({ no, 사업부: s, 계약구분: '감사', 상태: '', 회사명: `고객${no}`, 보고서명: '', 체결일: '', 신규여부: '', 계약: amt, 매출: 0, 사유: why });
const contract = (fileName, rows, extra = {}) => ({ fileName, sheetName: '원본', asOf: null, rows, manual: [], noId: 0, ...extra });
// 사업부 S 는 26.04월부터 A본부 → B본부로 바뀐다(같은 이름이 시기마다 다른 팀). T 는 늘 B본부.
const cfg = config({
  fyStart: 4, buOrder: ['A', 'B'], plans: { '*': { A: 1, B: 2 } },
  orgRules: [['S', null, 'A', 'A'], ['S', '2026-04', 'B', 'B'], ['T', null, 'B', null], ['U', null, 'A', null]],
  gijang: [{ month: '2026-03', 사업부: 'T', 계약구분: '기장', 계약: 5, 매출: 5, 메모: 'B기장' }],
  reasons: {
    '2026-03': [['C1', 'A 사유'], ['T1', 'B 사유 T1']],
    '2026-04': [['C9', 'A 삭제 사유'], ['C1', 'B 사유 C1(4월)']],
    '2026-05': [['C1', 'B 비밀 사유']],
    '2026-06': [['C7', '미리 적은 사유 C7']], // 26.06월 파일은 아직 없음(C7 은 5월에 A본부로 보임)
  },
  access: [],
});
const months = {
  '2026-03': { locked: true, contract: contract('ERP_B본부_대외비(26.03).xlsx', [row('C1', 'S', 10), row('C9', 'S', 3), row('T1', 'T', 7)],
    { manual: [{ 사업부: 'T', 계약구분: '기장', 계약: 9, 매출: 9, 메모: '' }], manualBeforeFix: [{ 사업부: 'T', 계약: 99 }], gijangFixed: true }), fileManual: [{ 사업부: 'T', 계약: 98 }], mapping: { bu: [], cat: [], at: 'x' } },
  '2026-04': { locked: false, contract: contract('ERP(26.04).xlsx', [row('C1', 'S', 11)]) }, // C9 삭제, C1 은 이달부터 B
  '2026-05': { locked: false, contract: contract('ERP(26.05).xlsx', [row('C1', 'S', 12, 'B 파일 사유'), row('C7', 'U', 4)]) },
};
const input = { cfg, fileName: '입력용.xlsx' };
const ALLOWED = new Set(['kind', 'month', 'locked', 'fileName', 'sheetName', 'rows', 'asOf', 'manual', 'noId', 'gijangFixed', 'mapping']);

for (const user of [{ admin: true, all: true, bus: [] }, { admin: false, all: true, bus: [] }, { admin: false, all: false, bus: ['A'] }]) {
  const p = filterFor(user, input, months);
  const body = JSON.stringify(p);
  for (const d of p.datasets) for (const k of Object.keys(d)) assert.ok(ALLOWED.has(k), `허용되지 않은 칸 ${k}`);
  assert.ok(!body.includes('manualBeforeFix') && !body.includes('fileManual'), '서버 보관용 칸은 누구에게도 보내지 않음');
  assert.equal(body.includes('대외비'), user.admin, '올린 파일 이름은 관리자에게만');
  assert.equal(p.datasets.some((d) => d.mapping), user.admin, '확정 때 매핑은 관리자에게만');
}

const a = filterFor({ admin: false, all: false, bus: ['A'] }, input, months);
const body = JSON.stringify(a);
for (const secret of ['T1', '고객T1', 'B 사유 T1', 'B 사유 C1(4월)', 'B 비밀 사유', 'B 파일 사유', 'B기장', '미리 적은 사유 C7']) assert.ok(!body.includes(secret), `A본부 사용자에게 B본부 자료 없음: ${secret}`);
assert.deepEqual(a.datasets.filter((d) => d.rows.length).map((d) => [d.month, d.rows.map((r) => r.no)]), [['2026-03', ['C1', 'C9']], ['2026-05', ['C7']]], '26.03월 S(A본부)·26.05월 U(A본부) 행만');
assert.deepEqual(a.cfg.reasons, { '2026-03': [['C1', 'A 사유']], '2026-04': [['C9', 'A 삭제 사유']], '2026-05': [], '2026-06': [] }, '사유는 달마다 보이는 계약만(전월 대비 삭제 행 포함)');
assert.ok(a.datasets.every((d) => d.kind !== 'contract' || d.manual.every((x) => x.사업부 !== 'T')) && a.datasets[0].noId === 0, '다른 본부 수기 행·건수 없음');
assert.deepEqual(a.cfg.plans, { '*': { A: 1 } });
console.log('PASS');
