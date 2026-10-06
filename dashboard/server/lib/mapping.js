// 확정(🔒)할 때 저장하는 '보고 당시' 매핑. 화면 계산(src/model.js effectiveMapping)과 같은 규칙(lib/org.js 공유).
'use strict';
const Org = require('./org');

function effectiveMapping(cfg, m) {
  return { bu: Org.compile(cfg.orgRules).snapshot(m), cat: [...(cfg.catMap || [])], at: new Date().toISOString() };
}

// 확정할 때 그 달 기장 수기분을 고정한다: 입력용 '기장추가'에 그 달이 있으면 그 값, 없으면 파일의 수기 행.
// (src/model.js frozenContract 와 같은 규칙)
function frozenContract(cfg, m, contract) {
  const g = (cfg.gijang || []).filter((x) => x.month === m).map(({ month, ...rest }) => rest);
  return g.length ? { ...contract, manual: g, noId: g.length } : contract;
}

module.exports = { effectiveMapping, frozenContract };
