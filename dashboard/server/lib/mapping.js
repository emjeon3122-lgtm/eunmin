// 확정(🔒)할 때 저장하는 '보고 당시' 매핑. 화면 계산(src/model.js effectiveMapping)과 같은 규칙(lib/org.js 공유).
'use strict';
const Org = require('./org');

function effectiveMapping(cfg, m) {
  return { bu: Org.compile(Org.rulesOf(cfg)).snapshot(m), cat: [...(cfg.catMap || [])], at: new Date().toISOString() };
}

// 확정할 때 그 달 기장 수기분을 고정한다: 입력용 '기장추가'에 그 달이 있으면 그 값, 없으면 파일의 수기 행.
// gijangFixed 표시가 있는 확정월만 고정값을 쓴다(표시가 없는 예전 확정월은 예전처럼 입력용 기장추가를 따른다).
// (src/model.js frozenContract 와 같은 규칙)
function frozenContract(cfg, m, contract) {
  const g = (cfg.gijang || []).filter((x) => x.month === m).map(({ month, ...rest }) => rest);
  return { ...contract, ...(g.length ? { manual: g, noId: g.length } : {}), gijangFixed: true };
}

// 고정 표시(gijangFixed)가 없는 확정월 = 예전 버전에서 확정한 달. 두 가지가 섞여 있고 저장 모양만으로는 구분할 수 없다.
//   2026.10.06-6 이하: manual = 파일의 수기 행. 화면은 입력용 기장추가(있으면)를 그때그때 따랐다.
//   2026.10.06-7·-8 : manual = 확정 때 고정한 값. 화면은 manual 을 썼다.
// 그래서 서버를 켤 때 다음처럼 정리한다.
//   - 그 달 입력용 기장추가가 없거나 manual 과 같으면 두 방식의 결과가 같다 → 값은 그대로 두고 표시만 붙인다.
//   - 다르면(어느 버전에서 확정했는지에 따라 답이 달라짐) 기본은 아무것도 바꾸지 않고 '확인 필요'로 남긴다.
//     LEGACY_LOCK_GIJANG=stored 면 저장된 manual 을 유지, =input 이면 지금 입력용 기장추가로 고정(원래 값은 manualBeforeFix 에 보관).
// 하나라도 바꾸기 전에 backup() 으로 전체 백업을 먼저 만든다. 백업이 실패하면 아무것도 바꾸지 않는다.
const key = (rows) => JSON.stringify((rows || []).map((x) => [x.사업부, x.계약구분, Number(x.계약) || 0, Number(x.매출) || 0]).sort());
function fixLegacyLocks(storage, { mode = '', backup = null } = {}) {
  const { input, months } = storage.load();
  const cfg = input?.cfg || {};
  const plan = []; const pending = [];
  for (const [m, rec] of Object.entries(months)) {
    if (!rec || !rec.locked || !rec.contract || rec.contract.gijangFixed) continue;
    const g = (cfg.gijang || []).filter((x) => x.month === m).map(({ month, ...rest }) => rest);
    if (!g.length || key(g) === key(rec.contract.manual)) plan.push([m, { ...rec, contract: { ...rec.contract, gijangFixed: true } }, 'same']);
    else if (mode === 'stored') plan.push([m, { ...rec, contract: { ...rec.contract, gijangFixed: true } }, 'stored']);
    else if (mode === 'input') plan.push([m, { ...rec, contract: { ...rec.contract, manual: g, noId: g.length, manualBeforeFix: rec.contract.manual || [], gijangFixed: true } }, 'input']);
    else pending.push(m);
  }
  const result = { backupFile: null, same: [], stored: [], input: [], pending };
  if (!plan.length) return result;
  if (backup) {
    try { result.backupFile = backup(); } catch (e) { return { ...result, error: `업데이트 전 백업 실패로 확정월 정리를 건너뜀: ${e.message}`, pending: [...pending, ...plan.map(([m]) => m)] }; }
  }
  for (const [m, rec, how] of plan) { storage.saveMonth(m, rec); result[how].push(m); }
  storage.audit({ by: '업데이트', action: 'fix-gijang', backupFile: result.backupFile, same: result.same, stored: result.stored, input: result.input, pending });
  return result;
}

module.exports = { effectiveMapping, frozenContract, fixLegacyLocks };
