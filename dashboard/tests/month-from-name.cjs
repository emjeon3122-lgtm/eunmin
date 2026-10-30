// 파일 이름에서 기준월 읽기 확인: node tests/month-from-name.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'model.js'), 'utf8');
const Model = new Function(`${src}\nreturn Model;`)();
const f = Model.monthFromFileName;
assert.equal(f('FY2025.4월 데이터 원본.xlsx'), '2025-04');
assert.equal(f('FY2025.12월 데이터 원본.xlsx'), '2025-12');
assert.equal(f('FY2025.1월 데이터 원본.xlsx'), '2026-01', '회계연도 시작월 이전 달은 다음 해');
assert.equal(f('FY2025.3월 데이터 원본.xlsx'), '2026-03');
assert.equal(f('FY2025.3월.xlsx', 1), '2025-03', '1월 시작 법인');
assert.equal(f('FY2026 실적보고자료(26.08)-data.xlsx'), '2026-08');
assert.equal(f('FY2025 최종 확정 값.xlsx'), null);
console.log('PASS');
