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

// 예전 버전에서 확정한 달은 기장 수기분이 고정되어 있지 않다. 서버를 켤 때 지금 화면에 보이는 값
// (= 지금 입력용 기장추가, 없으면 파일의 수기 행)으로 한 번 고정해 업데이트 전후 합계가 같게 한다.
function fixLegacyLocks(storage) {
  const { input, months } = storage.load();
  const cfg = input?.cfg || {};
  const fixed = [];
  for (const [m, rec] of Object.entries(months)) {
    if (!rec || !rec.locked || !rec.contract || rec.contract.gijangFixed) continue;
    storage.saveMonth(m, { ...rec, contract: frozenContract(cfg, m, rec.contract) });
    fixed.push(m);
  }
  if (fixed.length) storage.audit({ by: '업데이트', action: 'fix-gijang', months: fixed });
  return fixed;
}

module.exports = { effectiveMapping, frozenContract, fixLegacyLocks };
