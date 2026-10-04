// 브라우저에서 올라온 자료를 저장하기 전에 모양과 값을 검사한다.
// 값은 문자열·숫자·불리언으로만 받아들이고, 위험한 객체 키(__proto__ 등)는 버린다.
'use strict';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_ROWS = 200000;
const MAX_STR = 2000;

// 잘못된 자료는 400 오류로 돌려보낸다.
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const isMonth = (v) => typeof v === 'string' && MONTH_RE.test(v);
const str = (v, max = MAX_STR) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : 0);
const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : num(v));
const arr = (v, max = MAX_ROWS) => (Array.isArray(v) ? v.slice(0, max) : []);
const okKey = (k) => typeof k === 'string' && k.length <= 300 && !BAD_KEYS.has(k);

// { key: value } 객체를 검사하며 새로 만든다.
function obj(v, keyOk, valFn) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v)) if (okKey(k) && keyOk(k)) out[k] = valFn(x);
  return out;
}
const anyKey = () => true;
const pairs = (v) => arr(v).filter((p) => Array.isArray(p) && p.length === 2).map(([a, b]) => [str(a), str(b)]);

const C_STR = ['no', '사업부', '계약구분', '상태', '회사명', '보고서명', '체결일', '신규여부'];
const C_NUM = ['계약', '매출'];
const A_STR = ['no', '사업부', '회사명'];
const A_NUM = ['금액'];
const row = (r, strs, nums) => {
  const o = {};
  for (const k of strs) o[k] = str(r && r[k]);
  for (const k of nums) o[k] = num(r && r[k]);
  return o;
};
const manualRow = (r) => ({ 사업부: str(r && r.사업부), 계약구분: str(r && r.계약구분) || '기장', 계약: num(r && r.계약), 매출: num(r && r.매출), 메모: str(r && r.메모) });

// 보고 당시 매핑: { bu: [[사업부, 본부]], cat: [[계약구분, 중분류]], at }
const mapping = (m) => ({ bu: pairs(arr(m.bu, 5000)), cat: pairs(arr(m.cat, 5000)), at: str(m.at, 40) });

function dataset(d) {
  if (!d || typeof d !== 'object') throw bad('자료 형식이 올바르지 않습니다.');
  if (d.kind !== 'contract' && d.kind !== 'ar') throw bad('자료 종류를 알 수 없습니다.');
  if (!isMonth(d.month)) throw bad('기준월이 없는 자료는 저장할 수 없습니다.');
  if (!Array.isArray(d.rows) || d.rows.length > MAX_ROWS) throw bad('행 수가 너무 많거나 형식이 올바르지 않습니다.');
  const out = { kind: d.kind, month: d.month, fileName: str(d.fileName, 300), sheetName: str(d.sheetName, 300), locked: d.locked === true };
  if (d.kind === 'contract') {
    out.rows = d.rows.map((r) => row(r, C_STR, C_NUM));
    out.manual = arr(d.manual, 10000).map(manualRow);
    out.noId = out.manual.length;
    out.asOf = typeof d.asOf === 'string' && DATE_RE.test(d.asOf) ? d.asOf : null;
    if (d.mapping && typeof d.mapping === 'object') out.mapping = mapping(d.mapping);
  } else {
    out.rows = d.rows.map((r) => row(r, A_STR, A_NUM));
  }
  return out;
}

const PEOPLE = ['KICPA', 'AICPA', '세무사', '기타'];
function config(p) {
  if (!p || typeof p !== 'object') throw bad('입력용 자료 형식이 올바르지 않습니다.');
  const fyStart = Math.trunc(num(p.fyStart));
  const numMap = (v) => obj(v, anyKey, numOrNull);
  return {
    company: str(p.company, 200),
    fyStart: fyStart >= 1 && fyStart <= 12 ? fyStart : 4,
    unit: num(p.unit) > 0 ? num(p.unit) : 1000000,
    yoyReviewMin: num(p.yoyReviewMin) >= 0 ? num(p.yoyReviewMin) : 100,
    fundScope: p.fundScope === 'all-only' ? 'all-only' : 'everyone',
    autoLockDay: Number.isInteger(p.autoLockDay) && p.autoLockDay >= 1 && p.autoLockDay <= 28 ? p.autoLockDay : null,
    catOrder: arr(p.catOrder, 100).map((x) => str(x, 100)),
    buOrder: arr(p.buOrder, 200).map((x) => str(x, 100)),
    plans: obj(p.plans, (k) => k === '*' || /^\d{4}$/.test(k), (v) => obj(v, anyKey, num)),
    // 본부매핑 이력: [사업부, 적용시작월|null, 본부(당시), 현재 본부|null]
    orgRules: arr(p.orgRules, 10000).filter((t) => Array.isArray(t) && t.length === 4)
      .map(([s, from, bu, cur]) => [str(s, 300), isMonth(from) ? from : null, str(bu, 100), cur ? str(cur, 100) : null]).filter((t) => t[0] && t[2]),
    plansReported: obj(p.plansReported, (k) => k === '*' || /^\d{4}$/.test(k), (v) => obj(v, anyKey, num)),
    catMap: pairs(p.catMap),
    people: obj(p.people, isMonth, (v) => obj(v, anyKey, (x) => Object.fromEntries(PEOPLE.map((k) => [k, numOrNull(x && x[k])])))),
    fund: obj(p.fund, isMonth, (x) => ({ 자금: numOrNull(x && x.자금), 예수금: numOrNull(x && x.예수금), 전년자금: numOrNull(x && x.전년자금), 전년예수금: numOrNull(x && x.전년예수금) })),
    prev: obj(p.prev, isMonth, (v) => obj(v, anyKey, (x) => Object.fromEntries(['계약', '매출', '미수금', ...PEOPLE].map((k) => [k, numOrNull(x && x[k])])))),
    arManual: obj(p.arManual, isMonth, numMap),
    gijang: arr(p.gijang, 10000).filter((g) => g && isMonth(g.month)).map((g) => ({ month: g.month, ...manualRow(g) })),
    reasons: obj(p.reasons, isMonth, pairs),
    yoyReasons: pairs(p.yoyReasons),
    access: arr(p.access, 5000).map((a) => ({
      email: str(a && a.email, 320).trim().toLowerCase(), all: a && a.all === true, admin: a && a.admin === true,
      bus: arr(a && a.bus, 200).map((x) => str(x, 100)),
    })).filter((a) => a.email),
  };
}

module.exports = { dataset, config, isMonth, okKey, mapping };
