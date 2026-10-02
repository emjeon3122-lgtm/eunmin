// 조회 권한: 누가 어떤 본부를 볼 수 있는지 정하고, 그 범위의 자료만 잘라서 내보낸다.
// 화면에서 숨기는 것이 아니라 권한 밖의 행은 아예 보내지 않는다.
'use strict';
const Org = require('./org');

const norm = (s) => (s == null ? '' : String(s)).replace(/\s+/g, '');
const TOTAL = '전체';

// 관리자: 환경변수 ADMIN_EMAILS, 또는 Entra 앱 역할(OIDC_ADMIN_ROLE, 예: Admin)을 받은 계정.
// 그 밖의 사람은 입력용 '권한' 시트를 따른다.
function resolveUser(email, input, { adminEmails = [], roles = [], adminRole = '' } = {}) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  if (adminEmails.includes(e) || (adminRole && roles.includes(adminRole))) return { email: e, admin: true, all: true, bus: [] };
  const a = (input?.cfg?.access || []).find((x) => x.email === e);
  if (!a) return null;
  return { email: e, admin: a.admin, all: a.all || a.admin, bus: a.bus };
}

function filterFor(user, input, months) {
  const monthMeta = Object.entries(months).map(([m, r]) => ({ month: m, locked: !!r.locked, mappingAt: r.mapping?.at || null, updatedAt: r.updatedAt, by: user.admin ? r.by : undefined,
    contract: r.contract ? { fileName: r.contract.fileName, sheetName: r.contract.sheetName, rows: r.contract.rows.length } : null,
    ar: r.ar ? { fileName: r.ar.fileName, sheetName: r.ar.sheetName, rows: r.ar.rows.length } : null }));
  const all = [];
  for (const [m, r] of Object.entries(months)) {
    if (r.contract) all.push({ ...r.contract, kind: 'contract', month: m, locked: !!r.locked, ...(r.mapping ? { mapping: r.mapping } : {}) });
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
  // 본부 판별은 화면 계산과 같은 코드(lib/org.js = src/org.js 사본)를 쓴다.
  const org = Org.compile(cfg.orgRules);
  // 보고 당시 매핑으로 그 본부였던 행도 함께 보낸다(보고 당시 기준 화면용).
  const snap = new Map(Object.entries(months).filter(([, r]) => r.mapping).map(([m, r]) => [m, new Map(r.mapping.bu)]));
  const inScope = (m) => (r) => {
    const mm = m || r.month;
    // 현재 조직 기준, 보고 당시 기준, 확정 때 저장한 매핑 중 하나라도 이 사람의 본부면 보낸다.
    return allowed.has(org.current(r.사업부, mm)) || allowed.has(org.reported(r.사업부, mm)) || allowed.has(snap.get(mm)?.get(norm(r.사업부)));
  };
  const pickBus = (o) => Object.fromEntries(Object.entries(o || {}).filter(([bu]) => allowed.has(bu)));
  const byMonth = (o) => Object.fromEntries(Object.entries(o || {}).map(([m, v]) => [m, pickBus(v)]));

  const datasets = all.map((d) => ({ ...d, rows: d.rows.filter(inScope(d.month)), ...(d.manual ? { manual: d.manual.filter(inScope(d.month)) } : {}),
    ...(d.mapping ? { mapping: { ...d.mapping, bu: d.mapping.bu.filter(([, bu]) => allowed.has(bu)) } } : {}) }));
  const visibleNos = new Set();
  datasets.forEach((d) => { if (d.kind === 'contract') d.rows.forEach((r) => visibleNos.add(r.no)); });
  const out = {
    company: cfg.company, fyStart: cfg.fyStart, unit: cfg.unit, yoyReviewMin: cfg.yoyReviewMin, catOrder: cfg.catOrder, catMap: cfg.catMap,
    buOrder: cfg.buOrder.filter((b) => allowed.has(b)),
    plans: Object.fromEntries(Object.entries(cfg.plans).map(([fy, v]) => [fy, pickBus(v)])),
    // 관련된 사업부는 이력 전체를 보낸다(최근 줄이 있어야 현재 조직 기준 계산이 맞다).
    orgRules: (() => { const keep = new Set(cfg.orgRules.filter(([, , bu, cur]) => allowed.has(bu) || allowed.has(cur)).map(([s]) => s)); return cfg.orgRules.filter(([s]) => keep.has(s)); })(),
    plansReported: Object.fromEntries(Object.entries(cfg.plansReported || {}).map(([fy, v]) => [fy, pickBus(v)])),
    people: byMonth(cfg.people), prev: byMonth(cfg.prev), arManual: byMonth(cfg.arManual),
    // 자금·예수금은 법인 전체 값이다. 입력용 '설정'에서 '전체권한자'로 정하면 전체 권한자에게만 보낸다.
    fund: cfg.fundScope === 'all-only' ? {} : cfg.fund, fundScope: cfg.fundScope,
    gijang: cfg.gijang.filter(inScope(null)),
    reasons: Object.fromEntries(Object.entries(cfg.reasons).map(([m, list]) => [m, list.filter(([no]) => visibleNos.has(no))])),
    yoyReasons: cfg.yoyReasons.filter(([k]) => allowed.has(k.split('|')[1])),
    access: [],
  };
  return { cfg: out, datasets, months: monthMeta };
}

module.exports = { resolveUser, filterFor, TOTAL };
