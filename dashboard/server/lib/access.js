// 조회 권한: 누가 어떤 본부를 볼 수 있는지 정하고, 그 범위의 자료만 잘라서 내보낸다.
// 화면에서 숨기는 것이 아니라 권한 밖의 행은 아예 보내지 않는다.
'use strict';

const norm = (s) => (s == null ? '' : String(s)).replace(/\s+/g, '');
const TOTAL = '전체';

// adminEmails: 환경변수로 지정한 관리자(처음 설정용). 그 밖에는 입력용 '권한' 시트를 따른다.
function resolveUser(email, input, adminEmails) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  if (adminEmails.includes(e)) return { email: e, admin: true, all: true, bus: [] };
  const a = (input?.cfg?.access || []).find((x) => x.email === e);
  if (!a) return null;
  return { email: e, admin: a.admin, all: a.all || a.admin, bus: a.bus };
}

function filterFor(user, input, months) {
  const monthMeta = Object.entries(months).map(([m, r]) => ({ month: m, locked: !!r.locked, updatedAt: r.updatedAt, by: user.admin ? r.by : undefined,
    contract: r.contract ? { fileName: r.contract.fileName, sheetName: r.contract.sheetName, rows: r.contract.rows.length } : null,
    ar: r.ar ? { fileName: r.ar.fileName, sheetName: r.ar.sheetName, rows: r.ar.rows.length } : null }));
  const all = [];
  for (const [m, r] of Object.entries(months)) {
    if (r.contract) all.push({ ...r.contract, kind: 'contract', month: m, locked: !!r.locked });
    if (r.ar) all.push({ ...r.ar, kind: 'ar', month: m, locked: !!r.locked });
  }
  if (!input) return { cfg: null, datasets: user.all ? all : [], months: monthMeta };
  const cfg = input.cfg;
  if (user.all) {
    const out = { ...cfg };
    if (!user.admin) delete out.access;
    return { cfg: out, datasets: all, months: monthMeta };
  }

  const allowed = new Set(user.bus);
  const buMap = new Map(cfg.buMap);
  const buOf = (사업부) => buMap.get(norm(사업부));
  const inScope = (r) => allowed.has(buOf(r.사업부));
  const pickBus = (o) => Object.fromEntries(Object.entries(o || {}).filter(([bu]) => allowed.has(bu)));
  const byMonth = (o) => Object.fromEntries(Object.entries(o || {}).map(([m, v]) => [m, pickBus(v)]));

  const datasets = all.map((d) => ({ ...d, rows: d.rows.filter(inScope), ...(d.manual ? { manual: d.manual.filter(inScope) } : {}) }));
  const visibleNos = new Set();
  datasets.forEach((d) => { if (d.kind === 'contract') d.rows.forEach((r) => visibleNos.add(r.no)); });
  const out = {
    company: cfg.company, fyStart: cfg.fyStart, unit: cfg.unit, yoyReviewMin: cfg.yoyReviewMin, catOrder: cfg.catOrder, catMap: cfg.catMap,
    buOrder: cfg.buOrder.filter((b) => allowed.has(b)),
    plans: Object.fromEntries(Object.entries(cfg.plans).map(([fy, v]) => [fy, pickBus(v)])),
    buMap: cfg.buMap.filter(([, bu]) => allowed.has(bu)),
    people: byMonth(cfg.people), prev: byMonth(cfg.prev), arManual: byMonth(cfg.arManual),
    fund: {}, // 자금·예수금은 법인 전체 자료이므로 전체 권한이 있는 사람에게만 보낸다
    gijang: cfg.gijang.filter(inScope),
    reasons: Object.fromEntries(Object.entries(cfg.reasons).map(([m, list]) => [m, list.filter(([no]) => visibleNos.has(no))])),
    yoyReasons: cfg.yoyReasons.filter(([k]) => allowed.has(k.split('|')[1])),
    access: [],
  };
  return { cfg: out, datasets, months: monthMeta };
}

module.exports = { resolveUser, filterFor, TOTAL };
