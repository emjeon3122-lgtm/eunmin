// 자동 생성: dashboard/src/org.js 사본 — 이 파일을 직접 고치지 말 것 (python build.py)
// 조직(사업부 → 본부) 변경 이력. 화면(브라우저)과 서버(Node)가 이 파일 하나를 같이 쓴다.
// build.py 가 server/lib/org.js 로 복사하므로 서버 쪽 사본은 직접 고치지 않는다.
//
// 규칙 한 줄 = [사업부(공백 제거), 적용시작월('YYYY-MM' 또는 null=처음부터), 본부(당시), 현재 본부(또는 null)]
// - 그 달에 쓰는 줄: 같은 사업부의 줄 중 적용시작월이 그 달 이전인 가장 늦은 줄
//   (그 달보다 이른 줄이 없으면 가장 이른 줄)
// - 보고 당시 기준 본부 = 그 줄의 '본부(당시)'
// - 현재 조직 기준 본부 = 그 줄의 '현재 본부', 비어 있으면 그 사업부의 가장 최근 줄의 본부
//   (같은 이름이 시기마다 다른 팀일 때만 '현재 본부'를 채운다)
(function (root, factory) {
  const Org = factory();
  if (typeof module === 'object' && module.exports) module.exports = Org;
  else root.Org = Org;
}(typeof self !== 'undefined' ? self : this, () => {
  const norm = (s) => (s == null ? '' : String(s)).replace(/\s+/g, '');

  function compile(rules) {
    const by = new Map();
    for (const [s, from, bu, cur] of rules || []) {
      if (!s || !bu) continue;
      if (!by.has(s)) by.set(s, []);
      by.get(s).push({ from: from || null, bu, cur: cur || null });
    }
    for (const list of by.values()) list.sort((a, b) => (a.from || '').localeCompare(b.from || ''));
    const at = (s, m) => {
      const list = by.get(norm(s));
      if (!list) return null;
      let hit = list[0];
      for (const r of list) if (!r.from || (m && r.from <= m)) hit = r;
      return hit;
    };
    return {
      reported: (s, m) => at(s, m)?.bu || null,
      current: (s, m) => {
        const r = at(s, m);
        if (!r) return null;
        const list = by.get(norm(s));
        return r.cur || list[list.length - 1].bu;
      },
      // 그 달의 '보고 당시' 매핑 전체([사업부, 본부] 목록) — 월 확정 때 함께 저장한다.
      snapshot: (m) => [...by.keys()].map((s) => [s, at(s, m).bu]),
      // 이 이력에 등장하는 모든 본부(당시·현재)
      allBus: () => [...new Set([...by.values()].flatMap((l) => l.flatMap((r) => [r.bu, r.cur]).filter(Boolean)))],
      hasHistory: [...by.values()].some((l) => l.length > 1 || l.some((r) => r.cur)),
    };
  }

  // 예전 버전(2026.10.02-2 이전)의 본부매핑 저장 형식을 이력 규칙으로 바꾼다.
  //   buMap: [[사업부, 본부]] 공통 매핑, buMapFy: [[회계연도, 사업부, 본부]] 그 회계연도 전용(현재 조직 기준에도 썼음),
  //   buMapReported: [[회계연도, 사업부, 본부]] 보고 당시 기준 전용.
  // 예전 화면과 같은 본부가 나오도록 회계연도마다 [사업부, 그 해 시작월, 보고 당시 본부, 현재 기준 본부] 줄을 만든다.
  function fromLegacy(cfg) {
    const fyStart = Number(cfg.fyStart) >= 1 && Number(cfg.fyStart) <= 12 ? Number(cfg.fyStart) : 4;
    const pairs = (v) => (Array.isArray(v) ? v.filter((x) => Array.isArray(x) && x.length === 2 && x[0] && x[1]).map(([k, b]) => [norm(k), String(b)]) : []);
    const triples = (v) => (Array.isArray(v) ? v.filter((x) => Array.isArray(x) && x.length === 3 && Number.isInteger(Number(x[0])) && x[1] && x[2])
      .map(([f, k, b]) => [Number(f), norm(k), String(b)]) : []);
    const base = new Map(pairs(cfg.buMap));
    const fyCur = triples(cfg.buMapFy); const fyRep = triples(cfg.buMapReported);
    const start = (fy) => `${fy}-${String(fyStart).padStart(2, '0')}`;
    const rules = [];
    for (const s of new Set([...base.keys(), ...fyCur.map((t) => t[1]), ...fyRep.map((t) => t[1])])) {
      const cur = new Map(fyCur.filter((t) => t[1] === s).map(([f, , b]) => [f, b]));
      const rep = new Map(fyRep.filter((t) => t[1] === s).map(([f, , b]) => [f, b]));
      const b0 = base.get(s);
      if (!cur.size && !rep.size) { rules.push([s, null, b0, null]); continue; }
      if (b0) rules.push([s, null, b0, b0]);
      const fys = [...new Set([...cur.keys(), ...rep.keys()])].sort((x, y) => x - y);
      for (const fy of fys) {
        const c = cur.get(fy) || b0 || rep.get(fy);
        rules.push([s, start(fy), rep.get(fy) || c, c]);
        // 전용 매핑이 없는 다음 해부터는 공통 매핑으로 돌아간다.
        if (b0 && !fys.includes(fy + 1)) rules.push([s, start(fy + 1), b0, b0]);
      }
    }
    return rules;
  }
  // 설정에 이력(orgRules)이 없고 예전 형식만 있으면 바꿔서 쓴다.
  const rulesOf = (cfg) => (Array.isArray(cfg?.orgRules) ? cfg.orgRules : cfg && (cfg.buMap || cfg.buMapFy) ? fromLegacy(cfg) : []);

  return { compile, norm, fromLegacy, rulesOf };
}));
