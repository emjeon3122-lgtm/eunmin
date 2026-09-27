// 데이터 모델 — 엑셀 시트를 읽어 월 × 본부 실적을 계산한다.
// 금액: ERP 원본은 원 단위, 입력용 엑셀과 화면은 '금액 단위'(기본 백만원) 기준.
const Model = (() => {
  const TOTAL = '전체';
  const UNMAPPED = '미분류';
  const PEOPLE = ['KICPA', 'AICPA', '세무사', '기타'];
  const CONTRACT_HEADERS = ['계약번호', '사업부', '발행예정금액', '조정매출액', '조정후매출액', '등록일자'];
  const AR_HEADERS = ['계약번호', '사업부', '1년이상'];

  const norm = (s) => (s == null ? '' : String(s)).replace(/\s+/g, '');
  const text = (v) => (v == null ? '' : String(v).trim());
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = parseFloat(text(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const numOrNull = (v) => (v == null || text(v) === '' ? null : num(v));

  // ---- 월 계산 -------------------------------------------------------------
  const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const splitKey = (k) => k.split('-').map(Number);
  function addMonths(k, n) {
    const [y, m] = splitKey(k);
    const t = y * 12 + (m - 1) + n;
    return monthKey(Math.floor(t / 12), (t % 12) + 1);
  }
  const monthLabel = (k) => `${k.slice(2, 4)}.${k.slice(5, 7)}월`;

  function excelSerialToDate(n) {
    const d = new Date(Math.round((n - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // '2026/08/31', '2026-08-31', 엑셀 날짜 일련번호 → 'YYYY-MM-DD'
  function parseDate(v) {
    if (typeof v === 'number' && v > 20000) return excelSerialToDate(v);
    const m = text(v).match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
  }

  // '26.08월', '2026-08', '2026.08', 날짜 → 'YYYY-MM'
  function parseMonth(v) {
    if (typeof v === 'number' && v > 20000) return excelSerialToDate(v).slice(0, 7);
    const m = text(v).match(/(\d{4}|\d{2})\s*[.\-/년]\s*(\d{1,2})/);
    if (!m) return null;
    const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
    const mo = Number(m[2]);
    return mo >= 1 && mo <= 12 ? monthKey(y, mo) : null;
  }

  // ---- 표 읽기 -------------------------------------------------------------
  // 처음 몇 줄 안에서 필수 헤더가 모두 있는 줄을 헤더로 본다.
  function findHeader(rows, required, scan = 6) {
    for (let r = 0; r < Math.min(scan, rows.length); r++) {
      const idx = new Map();
      (rows[r] || []).forEach((v, i) => { const k = norm(v); if (k && !idx.has(k)) idx.set(k, i); });
      if (required.every((h) => idx.has(norm(h)))) return { row: r, idx };
    }
    return null;
  }

  function table(rows, required) {
    const h = findHeader(rows, required);
    if (!h) return null;
    const out = [];
    for (let r = h.row + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (!row.some((v) => text(v) !== '')) continue;
      const get = (name) => { const i = h.idx.get(norm(name)); return i === undefined ? null : row[i]; };
      out.push({ get, rowNo: r + 1 });
    }
    return out;
  }

  // ---- 입력용 엑셀 ---------------------------------------------------------
  const isInputBook = (book) => book.sheetNames.includes('본부매핑');

  async function readInput(book) {
    const t = async (name, req) => (book.sheetNames.includes(name) ? table(await book.rows(name), req) || [] : []);
    const cfg = {
      company: '', fyStart: 4, unit: 1000000, catOrder: [],
      buOrder: [], plan: {}, buMap: new Map(), catMap: new Map(),
      people: {}, fund: {}, prev: {}, arManual: {}, gijang: [], reasons: {},
      problems: [],
    };
    for (const r of await t('설정', ['항목', '값'])) {
      const k = norm(r.get('항목')); const v = r.get('값');
      if (k === '회사명') cfg.company = text(v);
      else if (k === '회계연도시작월' && num(v) >= 1 && num(v) <= 12) cfg.fyStart = num(v);
      else if (k.startsWith('금액단위') && num(v) > 0) cfg.unit = num(v);
      else if (k === '중분류순서') cfg.catOrder = text(v).split(',').map((s) => s.trim()).filter(Boolean);
    }
    for (const r of await t('사업계획', ['본부', '사업계획'])) {
      const bu = text(r.get('본부'));
      if (!bu || bu === TOTAL) continue;
      if (!cfg.buOrder.includes(bu)) cfg.buOrder.push(bu);
      cfg.plan[bu] = num(r.get('사업계획'));
    }
    for (const r of await t('본부매핑', ['사업부', '본부'])) {
      if (text(r.get('사업부'))) cfg.buMap.set(norm(r.get('사업부')), text(r.get('본부')));
    }
    for (const r of await t('중분류매핑', ['계약구분', '중분류'])) {
      const c = text(r.get('중분류'));
      if (text(r.get('계약구분'))) cfg.catMap.set(norm(r.get('계약구분')), c);
      if (c && !cfg.catOrder.includes(c)) cfg.catOrder.push(c);
    }
    const monthOf = (r, sheet) => {
      const m = parseMonth(r.get('월'));
      if (!m) cfg.problems.push(`입력용 '${sheet}' 시트 ${r.rowNo}행: 월 형식을 알 수 없습니다 (${text(r.get('월'))})`);
      return m;
    };
    const put = (obj, m, bu, val) => { (obj[m] ||= {})[bu] = val; };
    for (const r of await t('인원', ['월', '본부', ...PEOPLE])) {
      const m = monthOf(r, '인원'); if (!m) continue;
      put(cfg.people, m, text(r.get('본부')), Object.fromEntries(PEOPLE.map((p) => [p, numOrNull(r.get(p))])));
    }
    for (const r of await t('자금', ['월', '자금', '예수금'])) {
      const m = monthOf(r, '자금'); if (!m) continue;
      cfg.fund[m] = { 자금: numOrNull(r.get('자금')), 예수금: numOrNull(r.get('예수금')),
        전년자금: numOrNull(r.get('전년자금')), 전년예수금: numOrNull(r.get('전년예수금')) };
    }
    for (const r of await t('전년실적', ['월', '본부', '계약', '매출'])) {
      const m = monthOf(r, '전년실적'); if (!m) continue;
      const o = { 계약: numOrNull(r.get('계약')), 매출: numOrNull(r.get('매출')), 미수금: numOrNull(r.get('미수금')) };
      PEOPLE.forEach((p) => { o[p] = numOrNull(r.get(p)); });
      put(cfg.prev, m, text(r.get('본부')), o);
    }
    for (const r of await t('미수금', ['월', '본부', '미수금'])) {
      const m = monthOf(r, '미수금'); if (!m) continue;
      put(cfg.arManual, m, text(r.get('본부')), numOrNull(r.get('미수금')));
    }
    for (const r of await t('기장추가', ['월', '사업부', '계약금액'])) {
      const m = monthOf(r, '기장추가'); if (!m) continue;
      cfg.gijang.push({ month: m, 사업부: text(r.get('사업부')), 계약구분: text(r.get('계약구분')) || '기장',
        계약: num(r.get('계약금액')), 매출: num(r.get('매출금액')), 메모: text(r.get('메모')) });
    }
    for (const r of await t('사유', ['월', '계약번호', '사유'])) {
      const m = monthOf(r, '사유'); if (!m) continue;
      (cfg.reasons[m] ||= new Map()).set(text(r.get('계약번호')), text(r.get('사유')));
    }
    if (!cfg.buOrder.length) cfg.problems.push("입력용 '사업계획' 시트에 본부가 없습니다.");
    return cfg;
  }

  // ---- ERP / 작업 파일 -----------------------------------------------------
  // 한 통합 문서 안에서 계약·매출 원본 시트와 미수금 시트를 찾아낸다.
  async function readDataBook(book, fileName) {
    const found = [];
    for (const name of book.sheetNames) {
      const rows = await book.rows(name);
      const ct = table(rows, CONTRACT_HEADERS);
      if (ct) {
        let asOf = null; let noId = 0;
        const list = [];
        for (const r of ct) {
          const no = text(r.get('계약번호'));
          if (!no) {
            if (text(r.get('사업부')) || num(r.get('발행예정금액')) || num(r.get('조정후매출액'))) noId++;
            continue;
          }
          const reg = parseDate(r.get('등록일자'));
          if (reg && (!asOf || reg > asOf)) asOf = reg;
          list.push({
            no, 사업부: text(r.get('사업부')),
            계약구분: text(r.get('계약구분')) || text(r.get('계약종류')),
            상태: text(r.get('계약상태')), 회사명: text(r.get('회사명')), 보고서명: text(r.get('보고서명')),
            담당이사: text(r.get('담당이사')), 체결일: parseDate(r.get('계약체결일자')), 신규여부: text(r.get('신규여부')),
            계약: num(r.get('발행예정금액')) + num(r.get('조정매출액')),
            매출: num(r.get('조정후매출액')),
          });
        }
        found.push({ kind: 'contract', fileName, sheetName: name, rows: list, asOf, noId,
          month: asOf ? asOf.slice(0, 7) : parseMonth(fileName) });
        continue;
      }
      const at = table(rows, AR_HEADERS);
      if (at) {
        const list = [];
        for (const r of at) {
          if (!text(r.get('계약번호')) || !text(r.get('사업부'))) continue;
          list.push({ no: text(r.get('계약번호')), 사업부: text(r.get('사업부')), 회사명: text(r.get('회사명')),
            금액: num(r.get('1년이상')) + num(r.get('2년이상')) });
        }
        found.push({ kind: 'ar', fileName, sheetName: name, rows: list, month: null });
      }
    }
    // 미수금 시트는 같은 파일의 계약 시트 기준월을 따른다.
    const cMonth = found.find((d) => d.kind === 'contract' && d.month)?.month || parseMonth(fileName);
    found.filter((d) => d.kind === 'ar').forEach((d) => { d.month = cMonth; });
    return found;
  }

  // ---- 집계 ---------------------------------------------------------------
  function build(cfg, datasets) {
    const warnings = [];
    const contracts = new Map();
    const ars = new Map();
    for (const d of datasets) {
      if (!d.month) { warnings.push(`'${d.fileName}' › ${d.sheetName}: 기준월을 알 수 없어 제외했습니다. 검증 탭에서 월을 지정하세요.`); continue; }
      const target = d.kind === 'contract' ? contracts : ars;
      if (target.has(d.month)) {
        const old = target.get(d.month);
        warnings.push(`${monthLabel(d.month)} ${d.kind === 'contract' ? '계약·매출' : '미수금'} 자료가 여러 개입니다. 나중에 올린 '${d.fileName}' › ${d.sheetName} 을(를) 사용하고 '${old.fileName}' › ${old.sheetName} 은(는) 무시합니다.`);
      }
      target.set(d.month, d);
    }
    const loaded = [...contracts.keys()].sort();
    if (!loaded.length) return { empty: true, warnings };

    const latest = loaded[loaded.length - 1];
    const [ly, lm] = splitKey(latest);
    const fyYear = lm >= cfg.fyStart ? ly : ly - 1;
    const fyFirst = monthKey(fyYear, cfg.fyStart);
    const months = Array.from({ length: 12 }, (_, i) => addMonths(fyFirst, i));
    const fyLast = months[11];
    const buOf = (s) => cfg.buMap.get(norm(s)) || UNMAPPED;
    const catOf = (s) => cfg.catMap.get(norm(s)) || UNMAPPED;

    const unmappedBu = new Map();
    const unmappedCat = new Map();
    const agg = {};
    for (const m of months) {
      const d = contracts.get(m);
      if (!d) continue;
      const a = {};
      const add = (사업부, 계약구분, c, r) => {
        const bu = buOf(사업부); const cat = catOf(계약구분);
        if (bu === UNMAPPED) unmappedBu.set(사업부, (unmappedBu.get(사업부) || 0) + c);
        if (cat === UNMAPPED) unmappedCat.set(계약구분, (unmappedCat.get(계약구분) || 0) + c);
        const x = (a[bu] ||= { 계약: 0, 매출: 0, cats: {} });
        x.계약 += c; x.매출 += r; x.cats[cat] = (x.cats[cat] || 0) + c;
      };
      d.rows.forEach((row) => add(row.사업부, row.계약구분, row.계약, row.매출));
      cfg.gijang.filter((g) => g.month === m).forEach((g) => add(g.사업부, g.계약구분, g.계약, g.매출));
      agg[m] = a;
    }
    if (unmappedBu.size) warnings.push(`본부매핑에 없는 사업부 ${unmappedBu.size}개가 '${UNMAPPED}'으로 집계됩니다: ${[...unmappedBu.keys()].join(', ')}`);
    if (unmappedCat.size) warnings.push(`중분류매핑에 없는 계약구분 ${unmappedCat.size}개가 '${UNMAPPED}'으로 집계됩니다: ${[...unmappedCat.keys()].join(', ')}`);

    const arAgg = {};
    for (const m of months) {
      const d = ars.get(m);
      if (d) {
        const a = {};
        d.rows.forEach((r) => { const bu = buOf(r.사업부); a[bu] = (a[bu] || 0) + r.금액 / cfg.unit; });
        arAgg[m] = a;
      } else if (cfg.arManual[m]) {
        arAgg[m] = cfg.arManual[m];
      }
    }

    const extraBu = new Set();
    Object.values(agg).forEach((a) => Object.keys(a).forEach((b) => { if (!cfg.buOrder.includes(b)) extraBu.add(b); }));
    const buList = [...cfg.buOrder, ...extraBu];
    const cats = [...cfg.catOrder, ...(unmappedCat.size ? [UNMAPPED] : [])];

    const sumOver = (b, f) => {
      if (b !== TOTAL) return f(b);
      let s = null;
      for (const x of buList) { const v = f(x); if (v != null) s = (s || 0) + v; }
      return s;
    };
    const U = cfg.unit;
    const cVal = (m, b) => (agg[m] ? sumOver(b, (x) => (agg[m][x] ? agg[m][x].계약 / U : 0)) : null);
    const rVal = (m, b) => (agg[m] ? sumOver(b, (x) => (agg[m][x] ? agg[m][x].매출 / U : 0)) : null);
    const catVal = (m, b, cat) => (agg[m] ? sumOver(b, (x) => (agg[m][x] ? (agg[m][x].cats[cat] || 0) / U : 0)) : null);
    const prevVal = (m, b, k) => sumOver(b, (x) => cfg.prev[m]?.[x]?.[k] ?? null);
    const peopleVal = (m, b, k) => sumOver(b, (x) => cfg.people[m]?.[x]?.[k] ?? null);
    const arVal = (m, b) => (arAgg[m] ? sumOver(b, (x) => arAgg[m][x] ?? 0) : null);
    const planVal = (b) => (b === TOTAL ? cfg.buOrder.reduce((s, x) => s + (cfg.plan[x] || 0), 0) : cfg.plan[b] ?? null);
    const diff = (a, b) => (a == null || b == null ? null : a - b);
    const isFirst = (m) => m === fyFirst;
    const before = (m) => addMonths(m, -1);

    // 전월 값: 회계연도 첫 달은 누적이 새로 시작하므로 계약·매출은 0,
    // 인원·자금·미수금은 전년 마지막 달(전년실적의 회계연도 마지막 월) 값과 비교한다.
    function metric(m, b) {
      const c = cVal(m, b); const r = rVal(m, b); const plan = planVal(b);
      const cPrevM = isFirst(m) ? 0 : cVal(before(m), b);
      const rPrevM = isFirst(m) ? 0 : rVal(before(m), b);
      const kicpa = peopleVal(m, b, 'KICPA');
      const kicpaPrevM = isFirst(m) ? prevVal(fyLast, b, 'KICPA') : peopleVal(before(m), b, 'KICPA');
      const f = cfg.fund[m] || {};
      const fPrevM = isFirst(m) ? cfg.fund[fyLast]?.전년자금 : cfg.fund[before(m)]?.자금;
      const ar = arVal(m, b);
      const arPrevM = isFirst(m) ? prevVal(fyLast, b, '미수금') : arVal(before(m), b);
      return {
        month: m, bu: b, hasData: c != null, asOf: contracts.get(m)?.asOf || null,
        plan, planPyAnnual: prevVal(fyLast, b, '계약'),
        계약: c, 매출: r,
        달성률계약: c != null && plan ? c / plan : null,
        달성률매출: r != null && plan ? r / plan : null,
        cats: Object.fromEntries(cats.map((k) => [k, catVal(m, b, k)])),
        계약전년: prevVal(m, b, '계약'), 매출전년: prevVal(m, b, '매출'),
        계약증감년: diff(c, prevVal(m, b, '계약')), 계약증감월: diff(c, cPrevM),
        매출증감년: diff(r, prevVal(m, b, '매출')), 매출증감월: diff(r, rPrevM),
        people: Object.fromEntries(PEOPLE.map((p) => [p, peopleVal(m, b, p)])),
        회계사증감년: diff(kicpa, prevVal(m, b, 'KICPA')), 회계사증감월: diff(kicpa, kicpaPrevM),
        자금: f.자금 ?? null, 예수금: f.예수금 ?? null,
        자금증감년: diff(f.자금, f.전년자금), 자금증감월: diff(f.자금, fPrevM),
        미수금: ar, 미수금증감년: diff(ar, prevVal(m, b, '미수금')), 미수금증감월: diff(ar, arPrevM),
      };
    }

    // 전월 대비 계약 건별 증감 (계약 = 발행예정금액 + 조정매출액)
    function momDetail(m) {
      if (isFirst(m)) return { ok: false, why: '회계연도 첫 달은 누적이 새로 시작되어 전월 비교를 하지 않습니다.' };
      const cur = contracts.get(m); const prv = contracts.get(before(m));
      if (!cur) return { ok: false, why: `${monthLabel(m)} 자료가 없습니다.` };
      if (!prv) return { ok: false, why: `전월(${monthLabel(before(m))}) 자료를 함께 올리면 계약 건별 증감을 볼 수 있습니다.` };
      const reasons = cfg.reasons[m] || new Map();
      const prevMap = new Map(prv.rows.map((r) => [r.no, r]));
      const seen = new Set();
      const rows = [];
      const push = (r, before_, after, kind) => {
        const d = after - before_;
        if (Math.abs(d) < 0.5) return;
        rows.push({ 본부: buOf(r.사업부), 사업부: r.사업부, no: r.no, 회사명: r.회사명, 보고서명: r.보고서명,
          계약구분: r.계약구분, 중분류: catOf(r.계약구분), 전월: before_ / U, 당월: after / U, 증감: d / U,
          구분: kind || (d > 0 ? '증가' : '감소'), 사유: reasons.get(r.no) || (kind === '신규' ? '신규' : '') });
      };
      for (const r of cur.rows) {
        const p = prevMap.get(r.no); seen.add(r.no);
        push(r, p ? p.계약 : 0, r.계약, p ? null : '신규');
      }
      for (const p of prv.rows) if (!seen.has(p.no)) push(p, p.계약, 0, '삭제');
      // 기장 수기분은 사업부별 합계로 비교
      const gSum = (mm) => {
        const s = new Map();
        cfg.gijang.filter((g) => g.month === mm).forEach((g) => s.set(g.사업부, (s.get(g.사업부) || 0) + g.계약));
        return s;
      };
      const gc = gSum(m); const gp = gSum(before(m));
      for (const k of new Set([...gc.keys(), ...gp.keys()])) {
        push({ 사업부: k, no: '(기장 수기분)', 회사명: '', 보고서명: '', 계약구분: '기장' }, gp.get(k) || 0, gc.get(k) || 0, '기장수기');
      }
      rows.sort((a, b) => Math.abs(b.증감) - Math.abs(a.증감));
      return { ok: true, rows, prevMonth: before(m) };
    }

    // 전년 동월 대비: 작년 같은 달 ERP 원본이 있으면 중분류·고객별로 비교한다.
    // 계약번호는 해마다 새로 매겨지므로 고객(회사명) 기준으로 묶는다. 작년 자료에도 현재 본부매핑을 적용한다.
    const clientKey = (name) => norm(name).replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, '') || '(회사명 없음)';
    function yoyRows(m) {
      const d = contracts.get(m);
      if (!d) return null;
      const rows = d.rows.map((r) => ({ 본부: buOf(r.사업부), 사업부: r.사업부, 회사명: r.회사명, 중분류: catOf(r.계약구분), 계약: r.계약 / U, 매출: r.매출 / U }));
      cfg.gijang.filter((g) => g.month === m).forEach((g) => rows.push({ 본부: buOf(g.사업부), 사업부: g.사업부, 회사명: '(기장 수기분)', 중분류: catOf(g.계약구분), 계약: g.계약 / U, 매출: g.매출 / U }));
      return rows;
    }
    function yoyDetail(m) {
      const pm = addMonths(m, -12);
      const cur = yoyRows(m);
      if (!cur) return { ok: false, prevMonth: pm, why: `${monthLabel(m)} 자료가 없습니다.` };
      const prv = yoyRows(pm);
      if (!prv) return { ok: false, prevMonth: pm, why: `작년 같은 달(${monthLabel(pm)}) ERP 파일을 함께 올리면 중분류·고객별로 어디서 차이가 났는지 볼 수 있습니다.` };
      return { ok: true, prevMonth: pm, cur, prv };
    }
    // 두 해의 행을 key 별로 묶어 비교한다. field: '계약' | '매출'
    function yoyGroup(cur, prv, keyOf, field) {
      const g = new Map();
      const add = (r, side) => {
        const k = keyOf(r);
        const x = g.get(k) || { key: k, 본부: r.본부, 이름: r.회사명, 중분류: new Map(), 전년: 0, 당년: 0, n전년: 0, n당년: 0 };
        x[side] += r[field]; x[side === '당년' ? 'n당년' : 'n전년']++;
        x.중분류.set(r.중분류, (x.중분류.get(r.중분류) || 0) + Math.abs(r[field]));
        g.set(k, x);
      };
      cur.forEach((r) => add(r, '당년'));
      prv.forEach((r) => add(r, '전년'));
      return [...g.values()].map((x) => {
        const 증감 = x.당년 - x.전년;
        const 구분 = !x.n전년 ? '신규' : !x.n당년 ? '이탈' : 증감 > 0 ? '증가' : 증감 < 0 ? '감소' : '변동 없음';
        const 주중분류 = [...x.중분류].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        return { ...x, 증감, 구분, 주중분류 };
      }).filter((x) => Math.abs(x.증감) >= 0.5 / U || x.구분 === '변동 없음')
        .sort((a, b) => Math.abs(b.증감) - Math.abs(a.증감));
    }
    const yoyByClient = (cur, prv, field) => yoyGroup(cur, prv, (r) => `${r.본부}|${clientKey(r.회사명)}`, field);
    const yoyByCat = (cur, prv, field) => yoyGroup(cur, prv, (r) => r.중분류, field);

    const summaryRows = [];
    for (const m of months) {
      for (const b of [...buList, TOTAL]) {
        const x = metric(m, b);
        summaryRows.push(x);
      }
    }

    return {
      empty: false, warnings, months, fyYear, fyFirst, fyLast, latest, buList, cats,
      loadedMonths: new Set(loaded), contracts, ars, metric, momDetail, yoyDetail, yoyByClient, yoyByCat, summaryRows,
      unmappedBu, unmappedCat,
    };
  }

  return { TOTAL, UNMAPPED, PEOPLE, isInputBook, readInput, readDataBook, build, monthLabel, parseMonth, addMonths };
})();
