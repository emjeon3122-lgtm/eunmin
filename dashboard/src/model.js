// 데이터 모델 — 엑셀 시트를 읽어 월 × 본부 실적을 계산한다.
// 금액: ERP 원본은 원 단위, 입력용 엑셀과 화면은 '금액 단위'(기본 백만원) 기준.
const Model = (() => {
  const TOTAL = '전체';
  const UNMAPPED = '미분류';
  const PEOPLE = ['KICPA', 'AICPA', '세무사', '기타'];
  const CONTRACT_HEADERS = ['계약번호', '사업부', '발행예정금액', '조정매출액', '조정후매출액', '등록일자'];
  const AR_HEADERS = ['계약번호', '사업부', '1년이상'];
  // 1차 가공 파일의 '계약및매출(간략)'처럼 등록일자는 없지만 계약 금액 칸이 있는 시트 — 수기 추가 행(기장 등)을 여기서 읽는다.
  const SUMMARY_HEADERS = ['계약번호', '사업부', '발행예정금액', '조정매출액', '조정후매출액'];

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

  // 'FY2026', 2026, '26' → 2026
  function parseFy(v) {
    const m = text(v).match(/(\d{4}|\d{2})/);
    if (!m) return null;
    return m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
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
      company: '', fyStart: 4, unit: 1000000, catOrder: [], yoyReviewMin: 100, fundScope: 'everyone',
      buOrder: [], plans: {}, buMap: new Map(), catMap: new Map(),
      people: {}, fund: {}, prev: {}, arManual: {}, gijang: [], reasons: {}, yoyReasons: new Map(), access: [],
      problems: [],
    };
    for (const r of await t('설정', ['항목', '값'])) {
      const k = norm(r.get('항목')); const v = r.get('값');
      if (k === '회사명') cfg.company = text(v);
      else if (k === '회계연도시작월' && num(v) >= 1 && num(v) <= 12) cfg.fyStart = num(v);
      else if (k.startsWith('금액단위') && num(v) > 0) cfg.unit = num(v);
      // 자금·예수금 공개 범위: '모두'(기본) 또는 '전체권한자'(전체 권한이 있는 사람만)
      else if (k.startsWith('자금')) cfg.fundScope = norm(v).includes('전체권한') ? 'all-only' : 'everyone';
      else if (k.startsWith('전년대비검토기준') && num(v) >= 0) cfg.yoyReviewMin = num(v);
      else if (k === '중분류순서') cfg.catOrder = text(v).split(',').map((s) => s.trim()).filter(Boolean);
    }
    // '연도' 칸(예: FY2026)이 있으면 회계연도별 계획, 없으면 모든 연도에 같은 계획을 쓴다.
    for (const r of await t('사업계획', ['본부', '사업계획'])) {
      const bu = text(r.get('본부'));
      if (!bu || bu === TOTAL) continue;
      if (!cfg.buOrder.includes(bu)) cfg.buOrder.push(bu);
      (cfg.plans[parseFy(r.get('연도')) ?? '*'] ||= {})[bu] = num(r.get('사업계획'));
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
    // 전년 대비 사유: 본부·중분류 단위 (비워 두면 전체)
    for (const r of await t('전년대비사유', ['월', '본부', '중분류', '사유'])) {
      const m = monthOf(r, '전년대비사유'); if (!m || !text(r.get('사유'))) continue;
      const c = text(r.get('중분류'));
      cfg.yoyReasons.set(`${m}|${text(r.get('본부')) || TOTAL}|${!c || c === '합계' ? TOTAL : c}`, text(r.get('사유')));
    }
    // 서버 버전 조회 권한: 이메일 · 본부(쉼표로 여러 개, '전체'는 모든 본부) · 역할(관리자/조회)
    for (const r of await t('권한', ['이메일', '본부'])) {
      const email = text(r.get('이메일')).toLowerCase();
      if (!email) continue;
      const bus = text(r.get('본부')).split(',').map((x) => x.trim()).filter(Boolean);
      cfg.access.push({ email, all: bus.includes(TOTAL), bus: bus.filter((x) => x !== TOTAL), admin: text(r.get('역할')) === '관리자' });
    }
    if (!cfg.buOrder.length) cfg.problems.push("입력용 '사업계획' 시트에 본부가 없습니다.");
    return cfg;
  }

  // ---- ERP / 작업 파일 -----------------------------------------------------
  // 한 통합 문서 안에서 계약·매출 원본 시트와 미수금 시트를 찾아낸다.
  // 계약번호 없이 사업부와 금액만 있는 행 = 손으로 추가한 행(기장 수기분 등)
  function manualRow(r) {
    if (text(r.get('계약번호')) || !text(r.get('사업부'))) return null;
    const 계약 = num(r.get('발행예정금액')) + num(r.get('조정매출액'));
    const 매출 = num(r.get('조정후매출액'));
    if (!계약 && !매출) return null;
    return { 사업부: text(r.get('사업부')), 계약구분: text(r.get('계약구분')) || text(r.get('계약종류')) || '기장', 계약, 매출, 메모: text(r.get('사유')) };
  }

  async function readDataBook(book, fileName) {
    const found = [];
    let summaryManual = [];
    for (const name of book.sheetNames) {
      const rows = await book.rows(name);
      const ct = table(rows, CONTRACT_HEADERS);
      if (ct) {
        let asOf = null;
        const list = []; const manual = [];
        for (const r of ct) {
          const no = text(r.get('계약번호'));
          if (!no) {
            const mr = manualRow(r);
            if (mr) manual.push(mr);
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
        found.push({ kind: 'contract', fileName, sheetName: name, rows: list, asOf, manual, noId: manual.length,
          month: asOf ? asOf.slice(0, 7) : parseMonth(fileName) });
        continue;
      }
      const st = table(rows, SUMMARY_HEADERS);
      if (st) {
        const manual = st.map(manualRow).filter(Boolean);
        if (manual.length) summaryManual = manual;
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
    // 간략 시트의 수기 행은 같은 파일에서 수기 행이 없는 계약 시트에 붙인다.
    if (summaryManual.length) {
      found.filter((d) => d.kind === 'contract' && !d.manual.length).forEach((d) => { d.manual = summaryManual; d.noId = summaryManual.length; });
    }
    // 미수금 시트는 같은 파일의 계약 시트 기준월을 따른다.
    const cMonth = found.find((d) => d.kind === 'contract' && d.month)?.month || parseMonth(fileName);
    found.filter((d) => d.kind === 'ar').forEach((d) => { d.month = cMonth; });
    return found;
  }

  // ---- 집계 ---------------------------------------------------------------
  // 월·종류별로 쓸 자료를 하나씩 고른다. 마감(확정) 자료가 있는 달은 다른 자료로 덮어쓰지 않는다.
  function pickActive(datasets) {
    const warnings = [];
    const contracts = new Map();
    const ars = new Map();
    const kindName = (d) => (d.kind === 'contract' ? '계약·매출' : '미수금');
    for (const d of datasets) {
      if (!d.month) { warnings.push(`'${d.fileName}' › ${d.sheetName}: 기준월을 알 수 없어 제외했습니다. 검증 탭에서 월을 지정하세요.`); continue; }
      const target = d.kind === 'contract' ? contracts : ars;
      const old = target.get(d.month);
      if (old && old.locked && !d.locked) {
        warnings.push(`${monthLabel(d.month)}은(는) 마감(확정)된 달이라 '${d.fileName}' › ${d.sheetName} ${kindName(d)} 자료를 쓰지 않았습니다.`);
        continue;
      }
      if (old && !(d.locked && !old.locked)) {
        warnings.push(`${monthLabel(d.month)} ${kindName(d)} 자료가 여러 개입니다. 나중에 올린 '${d.fileName}' › ${d.sheetName} 을(를) 사용하고 '${old.fileName}' › ${old.sheetName} 은(는) 무시합니다.`);
      }
      target.set(d.month, d);
    }
    return { contracts, ars, warnings };
  }
  const fyOfMonth = (k, fyStart) => { const [y, m] = splitKey(k); return m >= fyStart ? y : y - 1; };

  function build(cfg, datasets, opts = {}) {
    const { contracts, ars, warnings } = pickActive(datasets);
    const loaded = [...contracts.keys()].sort();
    if (!loaded.length) return { empty: true, warnings };

    const fys = [...new Set(loaded.map((k) => fyOfMonth(k, cfg.fyStart)))].sort();
    const fyYear = fys.includes(opts.fy) ? opts.fy : fys[fys.length - 1];
    const latest = loaded.filter((k) => fyOfMonth(k, cfg.fyStart) === fyYear).pop();
    const fyFirst = monthKey(fyYear, cfg.fyStart);
    const months = Array.from({ length: 12 }, (_, i) => addMonths(fyFirst, i));
    const fyLast = months[11];
    const buOf = (s) => cfg.buMap.get(norm(s)) || UNMAPPED;
    const catOf = (s) => cfg.catMap.get(norm(s)) || UNMAPPED;

    // 기장 수기분: 입력용 '기장추가'에 그 달이 있으면 그 값, 없으면 올린 파일의 수기 행(계약번호 없는 행)을 쓴다.
    const gijangFor = (m) => {
      const g = cfg.gijang.filter((x) => x.month === m);
      return g.length ? g : (contracts.get(m)?.manual || []).map((x) => ({ ...x, month: m }));
    };
    const gijangSource = (m) => (cfg.gijang.some((x) => x.month === m) ? '입력용 기장추가' : contracts.get(m)?.manual?.length ? '파일의 수기 행' : '');
    const unmappedBu = new Map();
    const unmappedCat = new Map();
    const agg = {};
    for (const m of loaded) {
      const d = contracts.get(m);
      const a = {};
      const add = (사업부, 계약구분, c, r) => {
        const bu = buOf(사업부); const cat = catOf(계약구분);
        if (bu === UNMAPPED) unmappedBu.set(사업부, (unmappedBu.get(사업부) || 0) + c);
        if (cat === UNMAPPED) unmappedCat.set(계약구분, (unmappedCat.get(계약구분) || 0) + c);
        const x = (a[bu] ||= { 계약: 0, 매출: 0, cats: {}, catsR: {} });
        x.계약 += c; x.매출 += r;
        x.cats[cat] = (x.cats[cat] || 0) + c; x.catsR[cat] = (x.catsR[cat] || 0) + r;
      };
      d.rows.forEach((row) => add(row.사업부, row.계약구분, row.계약, row.매출));
      gijangFor(m).forEach((g) => add(g.사업부, g.계약구분, g.계약, g.매출));
      agg[m] = a;
    }
    if (unmappedBu.size) warnings.push(`본부매핑에 없는 사업부 ${unmappedBu.size}개가 '${UNMAPPED}'으로 집계됩니다: ${[...unmappedBu.keys()].join(', ')}`);
    if (unmappedCat.size) warnings.push(`중분류매핑에 없는 계약구분 ${unmappedCat.size}개가 '${UNMAPPED}'으로 집계됩니다: ${[...unmappedCat.keys()].join(', ')}`);

    const arAgg = {};
    for (const m of new Set([...ars.keys(), ...Object.keys(cfg.arManual)])) {
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
    const catVal = (m, b, cat, key = 'cats') => (agg[m] ? sumOver(b, (x) => (agg[m][x] ? (agg[m][x][key][cat] || 0) / U : 0)) : null);
    const peopleVal = (m, b, k) => sumOver(b, (x) => cfg.people[m]?.[x]?.[k] ?? null);
    const arVal = (m, b) => (arAgg[m] ? sumOver(b, (x) => arAgg[m][x] ?? 0) : null);
    // 전년 동월 값: 입력용 '전년실적'에 그 달이 있으면 그 값(공식 값), 없으면 작년 같은 달 자료로 계산한다.
    const prevFromRaw = (m, b, k) => {
      const pm = addMonths(m, -12);
      if (k === '계약') return cVal(pm, b);
      if (k === '매출') return rVal(pm, b);
      if (k === '미수금') return arVal(pm, b);
      return peopleVal(pm, b, k);
    };
    const prevVal = (m, b, k) => (cfg.prev[m] ? sumOver(b, (x) => cfg.prev[m]?.[x]?.[k] ?? null) : prevFromRaw(m, b, k));
    const planOf = (x) => cfg.plans[fyYear]?.[x] ?? cfg.plans['*']?.[x];
    const planVal = (b) => (b === TOTAL ? cfg.buOrder.reduce((s, x) => s + (planOf(x) || 0), 0) : planOf(b) ?? null);
    const fundAt = (m) => cfg.fund[m]?.자금 ?? null;
    const fundPy = (m) => cfg.fund[m]?.전년자금 ?? fundAt(addMonths(m, -12));
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
      const kicpaPrevM = peopleVal(before(m), b, 'KICPA') ?? (isFirst(m) ? prevVal(fyLast, b, 'KICPA') : null);
      const f = cfg.fund[m] || {};
      const fPrevM = fundAt(before(m)) ?? (isFirst(m) ? fundPy(fyLast) : null);
      const ar = arVal(m, b);
      const arPrevM = arVal(before(m), b) ?? (isFirst(m) ? prevVal(fyLast, b, '미수금') : null);
      return {
        month: m, bu: b, hasData: c != null, asOf: contracts.get(m)?.asOf || null,
        plan, planPyAnnual: prevVal(fyLast, b, '계약'),
        계약: c, 매출: r,
        달성률계약: c != null && plan ? c / plan : null,
        달성률매출: r != null && plan ? r / plan : null,
        cats: Object.fromEntries(cats.map((k) => [k, catVal(m, b, k)])),
        catsR: Object.fromEntries(cats.map((k) => [k, catVal(m, b, k, 'catsR')])),
        계약전년: prevVal(m, b, '계약'), 매출전년: prevVal(m, b, '매출'), 전년출처: cfg.prev[m] ? '전년실적' : '작년 자료',
        계약증감년: diff(c, prevVal(m, b, '계약')), 계약증감월: diff(c, cPrevM),
        매출증감년: diff(r, prevVal(m, b, '매출')), 매출증감월: diff(r, rPrevM),
        people: Object.fromEntries(PEOPLE.map((p) => [p, peopleVal(m, b, p)])),
        회계사증감년: diff(kicpa, prevVal(m, b, 'KICPA')), 회계사증감월: diff(kicpa, kicpaPrevM),
        자금: f.자금 ?? null, 예수금: f.예수금 ?? null,
        자금증감년: diff(f.자금, fundPy(m)), 자금증감월: diff(f.자금, fPrevM),
        미수금: ar, 미수금증감년: diff(ar, prevVal(m, b, '미수금')), 미수금증감월: diff(ar, arPrevM),
      };
    }

    // 전월 대비 계약 건별 증감. field: '계약'(발행예정금액 + 조정매출액) | '매출'(조정후매출액)
    function momDetail(m, field = '계약') {
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
          계약구분: r.계약구분, 중분류: catOf(r.계약구분), 신규여부: r.신규여부 || '', 전월: before_ / U, 당월: after / U, 증감: d / U,
          구분: kind || (d > 0 ? '증가' : '감소'), 사유: reasons.get(r.no) || (kind === '신규' ? '신규' : '') });
      };
      for (const r of cur.rows) {
        const p = prevMap.get(r.no); seen.add(r.no);
        // 같은 계약이라도 사업부·계약구분이 바뀌면 이전 분류에서 빼고 새 분류에 더한다(중분류·본부별 합계가 맞도록).
        if (p && (buOf(p.사업부) !== buOf(r.사업부) || catOf(p.계약구분) !== catOf(r.계약구분))) {
          push(p, p[field], 0, '분류변경');
          push(r, 0, r[field], '분류변경');
          continue;
        }
        push(r, p ? p[field] : 0, r[field], p ? null : '신규');
      }
      for (const p of prv.rows) if (!seen.has(p.no)) push(p, p[field], 0, '삭제');
      // 기장 수기분은 사업부별 합계로 비교
      const gSum = (mm) => {
        const s = new Map();
        gijangFor(mm).forEach((g) => s.set(g.사업부, (s.get(g.사업부) || 0) + g[field]));
        return s;
      };
      const gc = gSum(m); const gp = gSum(before(m));
      for (const k of new Set([...gc.keys(), ...gp.keys()])) {
        push({ 사업부: k, no: '(기장 수기분)', 회사명: '', 보고서명: '', 계약구분: '기장' }, gp.get(k) || 0, gc.get(k) || 0, '기장수기');
      }
      rows.sort((a, b) => Math.abs(b.증감) - Math.abs(a.증감));
      return { ok: true, rows, prevMonth: before(m) };
    }

    // 전년 동월 대비: 작년 같은 달 ERP 원본이 있으면 중분류별로 비교하고 주요 계약을 보여준다.
    // 계약번호는 해마다 새로 매겨지므로 계약끼리 짝을 짓지 않는다. 작년 자료에도 현재 본부매핑을 적용한다.
    function yoyRows(m) {
      const d = contracts.get(m);
      if (!d) return null;
      const rows = d.rows.map((r) => ({ no: r.no, 본부: buOf(r.사업부), 사업부: r.사업부, 회사명: r.회사명, 보고서명: r.보고서명,
        중분류: catOf(r.계약구분), 신규여부: r.신규여부 || '', 체결일: r.체결일 || '', 계약: r.계약 / U, 매출: r.매출 / U }));
      gijangFor(m).forEach((g) => rows.push({ no: '(기장 수기분)', 본부: buOf(g.사업부), 사업부: g.사업부,
        회사명: '', 보고서명: g.메모, 중분류: catOf(g.계약구분), 신규여부: '', 체결일: '', 계약: g.계약 / U, 매출: g.매출 / U }));
      return rows;
    }
    function yoyDetail(m) {
      const pm = addMonths(m, -12);
      const cur = yoyRows(m);
      if (!cur) return { ok: false, prevMonth: pm, why: `${monthLabel(m)} 자료가 없습니다.` };
      const prv = yoyRows(pm);
      if (!prv) return { ok: false, prevMonth: pm, why: `작년 같은 달(${monthLabel(pm)}) ERP 파일을 함께 올리면 중분류별 전년 대비와 작년 주요 계약을 볼 수 있습니다.` };
      return { ok: true, prevMonth: pm, cur, prv };
    }
    const sumByCat = (rows, field) => {
      const out = Object.fromEntries(cats.map((c) => [c, 0]));
      rows.forEach((r) => { out[r.중분류] = (out[r.중분류] || 0) + r[field]; });
      return out;
    };
    const yoyReason = (m, b, cat) => cfg.yoyReasons.get(`${m}|${b}|${cat || TOTAL}`) || '';
    const needsReview = (d) => d != null && Math.abs(d) >= cfg.yoyReviewMin;

    // 사유 작성용 목록: 본부 × 중분류(합계 포함) 전년 동월 대비 변화와 참고 정보.
    // 입력용 '전년대비사유' 시트에 그대로 붙여 넣을 수 있게 월·본부·중분류·사유를 앞에 둔다.
    function yoyReviewList(m) {
      const y = yoyDetail(m);
      if (!y.ok) return null;
      const out = [];
      for (const b of [...buList, TOTAL]) {
        const inB = (r) => b === TOTAL || r.본부 === b;
        for (const c of [...cats, null]) {
          const pick = (rows) => rows.filter((r) => inB(r) && (!c || r.중분류 === c));
          const cur = pick(y.cur); const prv = pick(y.prv);
          if (!cur.length && !prv.length) continue;
          const tot = (rows, f) => rows.reduce((s, r) => s + r[f], 0);
          const newOf = (rows) => rows.filter((r) => r.신규여부 === 'Y');
          const top = newOf(cur).sort((a, b2) => b2.계약 - a.계약).slice(0, 2)
            .map((r) => `${r.no} ${r.회사명} ${Math.round(r.계약 * 10) / 10}`);
          const row = {
            월: monthLabel(m), 본부: b, 중분류: c || '합계', 사유: yoyReason(m, b, c),
            전년계약: tot(prv, '계약'), 당년계약: tot(cur, '계약'), 전년매출: tot(prv, '매출'), 당년매출: tot(cur, '매출'),
            참고: `신규수임 올해 ${newOf(cur).length}건 ${Math.round(tot(newOf(cur), '계약'))} / 작년 ${newOf(prv).length}건 ${Math.round(tot(newOf(prv), '계약'))}`
              + (top.length ? ` · 올해 큰 신규수임: ${top.join(', ')}` : ''),
          };
          row.계약증감 = row.당년계약 - row.전년계약; row.매출증감 = row.당년매출 - row.전년매출;
          row.검토 = needsReview(row.계약증감) || needsReview(row.매출증감);
          out.push(row);
        }
      }
      return { prevMonth: y.prevMonth, rows: out };
    }

    const summaryRows = [];
    for (const m of months) {
      for (const b of [...buList, TOTAL]) {
        const x = metric(m, b);
        summaryRows.push(x);
      }
    }

    return {
      empty: false, warnings, gijangFor, gijangSource, months, fys, fyYear, fyFirst, fyLast, latest, buList, cats,
      loadedMonths: new Set(loaded), contracts, ars, metric, momDetail, yoyDetail, sumByCat, yoyReason, needsReview, yoyReviewList, isFirst, before, summaryRows,
      unmappedBu, unmappedCat,
    };
  }

  // ---- 설정값 주고받기(서버 버전) -----------------------------------------
  // Map 은 JSON 으로 보낼 수 없으므로 [키, 값] 배열로 바꾼다.
  function cfgToPlain(cfg) {
    return { ...cfg, buMap: [...cfg.buMap], catMap: [...cfg.catMap], yoyReasons: [...cfg.yoyReasons],
      reasons: Object.fromEntries(Object.entries(cfg.reasons).map(([m, mp]) => [m, [...mp]])) };
  }
  function cfgFromPlain(p) {
    const pairs = (v) => (Array.isArray(v) ? v.filter((x) => Array.isArray(x) && x.length === 2) : []);
    return { company: '', fyStart: 4, unit: 1000000, catOrder: [], yoyReviewMin: 100, buOrder: [], plans: {}, people: {}, fund: {},
      prev: {}, arManual: {}, gijang: [], access: [], problems: [], ...p,
      buMap: new Map(pairs(p.buMap)), catMap: new Map(pairs(p.catMap)), yoyReasons: new Map(pairs(p.yoyReasons)),
      reasons: Object.fromEntries(Object.entries(p.reasons || {}).map(([m, v]) => [m, new Map(pairs(v))])) };
  }

  // ---- 마감(확정) 자료 ----------------------------------------------------
  // 불러온 월별 자료 중 필요한 칸만 JSON 한 파일로 묶는다. 다시 올리면 그 달들은 확정(locked)으로 취급한다.
  const SNAP_TYPE = '실적대시보드-마감자료';
  const C_FIELDS = ['no', '사업부', '계약구분', '상태', '회사명', '보고서명', '체결일', '신규여부', '계약', '매출'];
  const A_FIELDS = ['no', '사업부', '회사명', '금액'];
  const NUM_FIELDS = new Set(['계약', '매출', '금액']);
  const MAX_ROWS = 200000;

  function exportSnapshot(datasets, upto) {
    const { contracts, ars } = pickActive(datasets);
    const months = {};
    const pack = (d, fields) => ({ fileName: d.fileName, sheetName: d.sheetName, asOf: d.asOf || null, noId: d.noId || 0,
      fields, rows: d.rows.map((r) => fields.map((f) => r[f] ?? null)), manual: d.manual || [] });
    for (const [m, d] of contracts) if (m <= upto) (months[m] ||= {}).contract = pack(d, C_FIELDS);
    for (const [m, d] of ars) if (m <= upto) (months[m] ||= {}).ar = pack(d, A_FIELDS);
    return JSON.stringify({ type: SNAP_TYPE, version: 1, createdAt: new Date().toISOString(), upto, months });
  }

  // 외부 파일이므로 형식을 엄격히 확인하고, 값은 문자열·숫자로만 받아들인다.
  function readSnapshot(textIn, fileName) {
    let o;
    try { o = JSON.parse(textIn); } catch { throw new Error('마감자료 파일 형식이 아닙니다.'); }
    if (!o || o.type !== SNAP_TYPE || o.version !== 1 || typeof o.months !== 'object' || !o.months) throw new Error('마감자료 파일 형식이 아닙니다.');
    const out = [];
    const unpack = (p, fields) => {
      if (!p || !Array.isArray(p.rows) || !Array.isArray(p.fields) || p.rows.length > MAX_ROWS) return null;
      const idx = fields.map((f) => p.fields.indexOf(f));
      return p.rows.filter(Array.isArray).map((a) => Object.fromEntries(fields.map((f, i) => {
        const v = idx[i] < 0 ? null : a[idx[i]];
        return [f, NUM_FIELDS.has(f) ? num(v) : text(v)];
      })));
    };
    for (const [m, v] of Object.entries(o.months)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || !v || typeof v !== 'object') continue;
      const c = unpack(v.contract, C_FIELDS);
      const manual = (Array.isArray(v.contract?.manual) ? v.contract.manual : []).filter((x) => x && typeof x === 'object')
        .map((x) => ({ 사업부: text(x.사업부), 계약구분: text(x.계약구분) || '기장', 계약: num(x.계약), 매출: num(x.매출), 메모: text(x.메모) }));
      if (c) out.push({ kind: 'contract', fileName, sheetName: `마감 ${monthLabel(m)} (${text(v.contract.fileName)})`, rows: c, month: m,
        asOf: parseDate(v.contract.asOf), manual, noId: manual.length, locked: true });
      const a = unpack(v.ar, A_FIELDS);
      if (a) out.push({ kind: 'ar', fileName, sheetName: `마감 ${monthLabel(m)} 미수금`, rows: a, month: m, locked: true });
    }
    return { datasets: out, upto: parseMonth(o.upto), createdAt: text(o.createdAt) };
  }

  return { TOTAL, UNMAPPED, PEOPLE, isInputBook, readInput, readDataBook, build, exportSnapshot, readSnapshot, cfgToPlain, cfgFromPlain, norm, monthLabel, parseMonth, addMonths };
})();
