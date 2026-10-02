// 확정(🔒)할 때 저장하는 '보고 당시' 매핑. 화면 계산(src/model.js effectiveMapping)과 같은 규칙:
// 공통 본부매핑 + 그 회계연도 전용 매핑 + 본부매핑(보고당시), 그리고 중분류매핑.
'use strict';

const fyOf = (m, fyStart) => { const [y, mo] = m.split('-').map(Number); return mo >= fyStart ? y : y - 1; };

function effectiveMapping(cfg, m) {
  const fy = fyOf(m, cfg.fyStart);
  const bu = new Map(cfg.buMap);
  for (const [f, k, b] of cfg.buMapFy || []) if (f === fy) bu.set(k, b);
  for (const [f, k, b] of cfg.buMapReported || []) if (f === fy) bu.set(k, b);
  return { bu: [...bu], cat: [...(cfg.catMap || [])], at: new Date().toISOString() };
}

module.exports = { effectiveMapping, fyOf };
