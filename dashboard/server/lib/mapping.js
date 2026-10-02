// 확정(🔒)할 때 저장하는 '보고 당시' 매핑. 화면 계산(src/model.js effectiveMapping)과 같은 규칙(lib/org.js 공유).
'use strict';
const Org = require('./org');

function effectiveMapping(cfg, m) {
  return { bu: Org.compile(cfg.orgRules).snapshot(m), cat: [...(cfg.catMap || [])], at: new Date().toISOString() };
}

module.exports = { effectiveMapping };
