// 조회 권한: 누가 어떤 본부를 볼 수 있는지 정하고, 그 범위의 자료만 잘라서 내보낸다.
// 화면에서 숨기는 것이 아니라 권한 밖의 행은 아예 보내지 않는다.
'use strict';
const Org = require('./org');

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
  // 월별 현황: 관리자에게만 파일 이름·건수·변경자를 보낸다(다른 사람에게는 월과 확정 여부만).
  const monthMeta = Object.entries(months).map(([m, r]) => (user.admin ? { month: m, locked: !!r.locked, autoLockHold: !!r.autoLockHold, mappingAt: r.mapping?.at || null, updatedAt: r.updatedAt, by: r.by,
    contract: r.contract ? { fileName: r.contract.fileName, sheetName: r.contract.sheetName, rows: r.contract.rows.length } : null,
    ar: r.ar ? { fileName: r.ar.fileName, sheetName: r.ar.sheetName, rows: r.ar.rows.length } : null } : { month: m, locked: !!r.locked }));
  // 화면에 필요한 칸만 골라 보낸다(허용 목록). 저장 파일에 서버 보관용 칸(예: manualBeforeFix)이 더 있어도 나가지 않는다.
  // 올린 파일·시트 이름은 관리자에게만(파일 이름에 다른 본부·고객 이름이 들어 있을 수 있다).
  const pick = (d, m, locked, kind) => ({ kind, month: m, locked, fileName: user.admin ? d.fileName : '', sheetName: user.admin ? d.sheetName : '', rows: d.rows || [],
    ...(kind === 'contract' ? { asOf: d.asOf || null, manual: d.manual || [], noId: (d.manual || []).length, ...(d.gijangFixed ? { gijangFixed: true } : {}) } : {}) });
  const all = [];
  for (const [m, r] of Object.entries(months)) {
    if (r.contract) all.push({ ...pick(r.contract, m, !!r.locked, 'contract'), ...(r.mapping ? { mapping: r.mapping } : {}) });
    if (r.ar) all.push(pick(r.ar, m, !!r.locked, 'ar'));
  }
  // '보고 당시 기준'은 관리자만 본다. 그 밖의 사람에게는 확정 때 저장한 매핑과 보고 당시 계획을 보내지 않는다.
  const noSnap = (list) => list.map(({ mapping, ...d }) => d);
  if (!input) return { cfg: null, datasets: user.all ? (user.admin ? all : noSnap(all)) : [], months: monthMeta };
  const cfg = input.cfg;
  if (user.all) {
    if (user.admin) return { cfg, datasets: all, months: monthMeta };
    const { access, plansReported, ...out } = cfg;
    return { cfg: { ...out, plansReported: {} }, datasets: noSnap(all), months: monthMeta };
  }

  // 본부 권한자(관리자가 아님)는 현재 조직 기준으로 자기 본부인 행만 받는다.
  const allowed = new Set(user.bus);
  // 본부 판별은 화면 계산과 같은 코드(lib/org.js = src/org.js 사본)를 쓴다.
  const org = Org.compile(cfg.orgRules);
  const inScope = (m) => (r) => allowed.has(org.current(r.사업부, m || r.month));
  const pickBus = (o) => Object.fromEntries(Object.entries(o || {}).filter(([bu]) => allowed.has(bu)));
  const byMonth = (o) => Object.fromEntries(Object.entries(o || {}).map(([m, v]) => [m, pickBus(v)]));

  const datasets = noSnap(all).map((d) => {
    const out = { ...d, rows: d.rows.filter(inScope(d.month)) };
    if (d.manual) { out.manual = d.manual.filter(inScope(d.month)); out.noId = out.manual.length; } // 수기 행 수도 권한 범위 기준
    return out;
  });
  // 사유는 달마다 그 달(과 전월 대비의 '삭제' 행이 쓰는 전월)에 권한 범위로 보이는 계약번호만 보낸다.
  // (같은 계약번호가 다른 달에는 다른 본부일 수 있으므로 모든 달을 합친 목록으로 거르면 안 된다)
  const nosOf = new Map();
  datasets.forEach((d) => { if (d.kind === 'contract') nosOf.set(d.month, new Set(d.rows.map((r) => r.no))); });
  const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
  // 전월에만 보였던 계약은 그 달 전체 자료에 아예 없을 때(진짜 삭제)만 허용한다. 그 달 다른 본부로 옮겨 간 계약의 사유는 보내지 않는다.
  const allNosOf = new Map();
  all.forEach((d) => { if (d.kind === 'contract') allNosOf.set(d.month, new Set(d.rows.map((r) => r.no))); });
  const visibleIn = (m) => (no) => nosOf.get(m)?.has(no) || (nosOf.get(prevMonth(m))?.has(no) && !allNosOf.get(m)?.has(no));
  const out = {
    company: cfg.company, fyStart: cfg.fyStart, unit: cfg.unit, catOrder: cfg.catOrder, catMap: cfg.catMap,
    buOrder: cfg.buOrder.filter((b) => allowed.has(b)),
    plans: Object.fromEntries(Object.entries(cfg.plans).map(([fy, v]) => [fy, pickBus(v)])),
    // 관련된 사업부는 이력 전체를 보낸다(최근 줄이 있어야 현재 조직 기준 계산이 맞다).
    orgRules: (() => { const keep = new Set(cfg.orgRules.filter(([, , bu, cur]) => allowed.has(bu) || allowed.has(cur)).map(([s]) => s)); return cfg.orgRules.filter(([s]) => keep.has(s)); })(),
    plansReported: {},
    people: byMonth(cfg.people), prev: byMonth(cfg.prev), arManual: byMonth(cfg.arManual),
    // 자금·예수금은 법인 전체 값이다. 입력용 '설정'에서 '전체권한자'로 정하면 전체 권한자에게만 보낸다.
    fund: cfg.fundScope === 'all-only' ? {} : cfg.fund, fundScope: cfg.fundScope,
    gijang: cfg.gijang.filter(inScope(null)),
    reasons: Object.fromEntries(Object.entries(cfg.reasons).map(([m, list]) => [m, list.filter(([no]) => visibleIn(m)(no))])),
    access: [],
  };
  return { cfg: out, datasets, months: monthMeta };
}

module.exports = { resolveUser, filterFor, TOTAL };
