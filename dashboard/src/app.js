// 화면 — 파일 올리기, 대시보드, 전월 대비 분석, 데이터 요약, 검증
(() => {
  const { TOTAL, PEOPLE, monthLabel } = Model;
  const state = { cfg: null, datasets: [], res: null, errors: [], sel: { month: null, bu: TOTAL }, tab: 'dash', mom: { kind: '전체', q: '' }, yoy: { field: '계약', kind: '전체', q: '', all: false } };
  const charts = [];
  const pendingCharts = []; // 캔버스가 화면에 붙은 뒤에 그려야 크기가 맞는다
  const app = document.getElementById('app');
  Chart.register(ChartDataLabels);

  // ---- 작은 도우미 ----------------------------------------------------------
  // 엑셀 내용은 항상 textContent 로만 넣는다(HTML 로 해석하지 않음).
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = (v, digits = 0) => {
    if (v == null) return '-';
    const r = Math.round(Number(v) * 10 ** digits) / 10 ** digits;
    return (r === 0 ? 0 : r).toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  };
  const pct = (v) => (v == null ? '-' : `${Math.round(v * 100)}%`);
  const series = (i) => css(`--s${(i % 8) + 1}`);
  const alpha = (hex, a) => {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${a})`;
  };

  function delta(v, { goodWhenUp = true, digits = 0 } = {}) {
    if (v == null) return el('span', { class: 'delta none', text: '자료 없음' });
    const r = Math.round(v * 10 ** digits) / 10 ** digits;
    if (r === 0) return el('span', { class: 'delta flat', text: '– 0' });
    const up = r > 0;
    const good = up === goodWhenUp;
    return el('span', { class: `delta ${good ? 'good' : 'bad'}`, title: up ? '증가' : '감소', text: `${up ? '▲' : '▼'} ${fmt(Math.abs(r), digits)}` });
  }
  const kvDelta = (label, v, opt) => el('div', { class: 'kv' }, el('div', { class: 'k', text: label }), delta(v, opt));

  function download(name, text) {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    const a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // 엑셀 수식 주입 방지: =, +, -, @ 로 시작하는 문자열 앞에 ' 를 붙인다.
  function toCsv(header, rows) {
    const cell = (v) => {
      if (v == null) return '';
      if (typeof v === 'number') return String(v);
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  }

  // ---- 파일 읽기 -----------------------------------------------------------
  async function loadFiles(files) {
    state.errors = [];
    for (const f of files) {
      try {
        const book = await XlsxReader.open(await f.arrayBuffer());
        if (Model.isInputBook(book)) {
          state.cfg = await Model.readInput(book);
        } else {
          const found = await Model.readDataBook(book, f.name);
          if (!found.length) state.errors.push(`'${f.name}': 계약·매출(ERP) 시트나 미수금 시트를 찾지 못했습니다.`);
          state.datasets.push(...found);
        }
      } catch (e) {
        state.errors.push(`'${f.name}': ${e.message}`);
      }
    }
    rebuild();
  }

  function rebuild() {
    state.res = state.cfg && state.datasets.length ? Model.build(state.cfg, state.datasets) : null;
    if (state.res && !state.res.empty) {
      if (!state.sel.month || !state.res.months.includes(state.sel.month) || !state.res.loadedMonths.has(state.sel.month)) state.sel.month = state.res.latest;
      if (state.sel.bu !== TOTAL && !state.res.buList.includes(state.sel.bu)) state.sel.bu = TOTAL;
    }
    render();
  }

  function pickFiles() {
    const input = el('input', { type: 'file', accept: '.xlsx,.xlsm', multiple: true, class: 'hidden' });
    input.addEventListener('change', () => { if (input.files.length) loadFiles([...input.files]); input.remove(); });
    document.body.append(input); input.click();
  }

  // ---- 렌더링 -------------------------------------------------------------
  function render() {
    charts.splice(0).forEach((c) => c.destroy());
    app.replaceChildren();
    const ready = state.res && !state.res.empty;
    if (!ready) { app.append(dropScreen()); return; }
    const res = state.res; const cfg = state.cfg;
    const cur = res.metric(state.sel.month, state.sel.bu);
    app.append(...[
      el('div', { class: 'top' },
        el('h1', { text: `${cfg.company ? cfg.company + ' ' : ''}FY${res.fyYear} 사업계획 및 실적` }),
        el('span', { class: 'asof', text: cur.asOf ? `기준일 ${cur.asOf} (ERP 등록일자 기준)` : '' }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn', onclick: pickFiles, text: '파일 추가' }),
        el('button', { class: 'btn', onclick: () => { Object.assign(state, { cfg: null, datasets: [], res: null }); render(); }, text: '처음으로' })),
      tabs(),
      warnings([...state.errors, ...(cfg.problems || []), ...res.warnings]),
      filters(res),
    ].filter(Boolean));
    const view = { dash: dashboard, mom: momView, yoy: yoyView, summary: summaryView, check: checkView }[state.tab];
    app.append(view(res, cur));
    pendingCharts.splice(0).forEach((draw) => draw());
  }

  function tabs() {
    const t = [['dash', '대시보드'], ['mom', '전월 대비 분석'], ['yoy', '전년 대비 분석'], ['summary', '데이터 요약'], ['check', '검증']];
    return el('div', { class: 'tabs', role: 'tablist' }, t.map(([k, label]) => el('button', {
      class: 'tab', role: 'tab', 'aria-selected': String(state.tab === k),
      onclick: () => { state.tab = k; render(); }, text: label })));
  }

  function warnings(list) {
    if (!list.length) return null;
    return el('div', { class: 'warnings', role: 'status' }, el('strong', { text: `확인이 필요합니다 (${list.length})` }),
      el('ul', {}, list.map((w) => el('li', { text: w }))));
  }

  function filters(res) {
    const bus = [...res.buList, TOTAL];
    return el('div', { class: 'filters' },
      el('div', { class: 'seg', role: 'group', 'aria-label': '본부 선택' }, bus.map((b) => el('button', {
        'aria-pressed': String(state.sel.bu === b), onclick: () => { state.sel.bu = b; render(); }, text: b }))),
      el('div', { class: 'seg', role: 'group', 'aria-label': '월 선택' }, res.months.map((m) => el('button', {
        'aria-pressed': String(state.sel.month === m), disabled: !res.loadedMonths.has(m),
        title: res.loadedMonths.has(m) ? '' : '이 달 자료를 아직 올리지 않았습니다',
        onclick: () => { state.sel.month = m; render(); }, text: monthLabel(m) }))));
  }

  function dropScreen() {
    const box = el('div', { class: 'drop' },
      el('h1', { text: '실적 대시보드' }),
      el('div', { text: '엑셀 파일을 이 상자에 끌어다 놓거나 아래 버튼으로 선택하세요. 여러 개를 한 번에 올려도 됩니다.' }),
      el('ol', {},
        el('li', { text: '입력용.xlsx: 사업계획, 인원, 자금, 전년실적, 매핑표, 사유' }),
        el('li', { text: '월별 ERP 계약·매출 다운로드 파일 또는 기존 작업 파일 (전월 비교를 하려면 지난달 파일도 함께)' }),
        el('li', { text: '미수금 시트가 들어 있는 파일(선택)' })),
      el('div', {}, el('button', { class: 'btn primary', onclick: pickFiles, text: '파일 선택' })),
      warnings([...state.errors, ...(state.cfg ? [] : state.datasets.length ? ['입력용.xlsx 를 함께 올려 주세요.'] : []),
        ...(state.cfg && !state.datasets.length ? ['ERP 계약·매출 파일을 함께 올려 주세요.'] : []),
        ...(state.res?.empty ? state.res.warnings : [])]),
      el('div', { class: 'note', text: '파일은 이 PC의 브라우저 안에서만 읽습니다. 인터넷으로 전송되지 않으며, 창을 닫으면 사라집니다.' }));
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('over'); loadFiles([...e.dataTransfer.files]); });
    return box;
  }
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { if (!e.target.closest?.('.drop')) { e.preventDefault(); if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]); } });

  // ---- 차트 공통 ------------------------------------------------------------
  function chart(canvas, config) {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = css('--ink-2');
    // 애니메이션을 끄면 requestAnimationFrame 없이 즉시 그린다.
    // (일부 PC·미리보기 창에서는 애니메이션 프레임이 돌지 않아 그래프가 빈칸으로 남았다)
    Chart.defaults.animation = false;
    pendingCharts.push(() => {
      try {
        charts.push(new Chart(canvas, config));
      } catch (e) {
        canvas.replaceWith(emptyNote(`그래프를 그리지 못했습니다: ${e.message}`));
      }
    });
  }
  const emptyNote = (msg) => el('div', { class: 'empty-note', text: msg });
  const baseOpts = (extra = {}) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, datalabels: { display: false },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label || ctx.label}: ${fmt(ctx.parsed?.y ?? ctx.parsed?.x ?? ctx.parsed)}` } } },
    ...extra,
  });
  function donut(canvas, labels, values, colors, { cutout = '62%', label = true, gauge = false, empty = '자료 없음' } = {}) {
    const total = values.reduce((s, v) => s + (v || 0), 0);
    if (!gauge && !(total > 0)) { canvas.replaceWith(emptyNote(empty)); return; }
    chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: css('--surface'), borderWidth: 2 }] },
      options: baseOpts({
        cutout,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: !gauge, callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.parsed)}` } },
          datalabels: {
            display: (ctx) => label && total > 0 && ctx.dataset.data[ctx.dataIndex] / total >= 0.04,
            color: '#fff', font: { weight: 600, size: 11 }, formatter: (v) => fmt(v),
          },
        },
      }),
    });
  }
  const legend = (items) => el('div', { class: 'legend' }, items.map(([t, c]) => el('span', {}, el('i', { style: `background:${c}` }), t)));
  function card(title, unit, ...kids) {
    return el('div', { class: 'card' }, el('div', { class: 'head' }, el('h2', { text: title }), unit ? el('span', { class: 'unit', text: `(단위: ${unit})` }) : null), ...kids);
  }

  // ---- 대시보드 ------------------------------------------------------------
  function dashboard(res, cur) {
    const unit = state.cfg.unit === 1000000 ? '백만원' : `${fmt(state.cfg.unit)}원`;
    const grid = el('div', { class: 'grid' });

    // 사업계획
    const planBus = [...state.cfg.buOrder];
    const planCv = el('canvas', { 'aria-label': '본부별 사업계획 막대그래프', role: 'img' });
    grid.append(card('사업계획', unit, el('div', { class: 'body' },
      el('div', { class: 'chart' }, planCv),
      el('div', { class: 'side' },
        el('div', { class: 'kv' }, el('div', { class: 'k', text: state.sel.bu }), el('div', { class: 'v', text: fmt(cur.plan) })),
        el('div', { class: 'kv' }, el('div', { class: 'k', text: '전년 실적' }), el('div', { class: 'v', style: 'font-size:16px', text: fmt(cur.planPyAnnual) })),
        kvDelta('전년 실적 대비', cur.plan != null && cur.planPyAnnual != null ? cur.plan - cur.planPyAnnual : null)))));
    const planVals = planBus.map((b) => res.metric(state.sel.month, b).plan);
    chart(planCv, {
      type: 'bar',
      data: { labels: planBus, datasets: [{ label: '사업계획', data: planVals, borderRadius: 4, barPercentage: 0.7,
        backgroundColor: planBus.map((b) => (state.sel.bu === TOTAL || b === state.sel.bu ? series(0) : alpha(series(0), 0.35))) }] },
      options: baseOpts({
        indexAxis: 'y',
        scales: { x: { display: false, grid: { display: false } }, y: { grid: { display: false }, border: { display: false } } },
        layout: { padding: { right: 48 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `사업계획: ${fmt(c.parsed.x)}` } },
          datalabels: { display: true, anchor: 'end', align: 'end', color: css('--ink-2'), font: { size: 11 }, formatter: (v) => fmt(v) } },
      }),
    });

    // 달성률(계약) — 중분류 구성
    const catCv = el('canvas', { role: 'img', 'aria-label': '중분류별 계약 구성' });
    const catColors = res.cats.map((_, i) => series(i));
    grid.append(card('달성률(계약)', unit, el('div', { class: 'body' },
      el('div', { class: 'chart' }, catCv, el('div', { class: 'center' }, el('div', { class: 'big', text: fmt(cur.계약) }), el('div', { class: 'sub', text: pct(cur.달성률계약) }))),
      el('div', { class: 'side' }, kvDelta('전년대비', cur.계약증감년), kvDelta('전월대비', cur.계약증감월))),
    legend(res.cats.map((c, i) => [`${c} ${fmt(cur.cats[c])}`, catColors[i]]))));
    donut(catCv, res.cats, res.cats.map((c) => cur.cats[c]), catColors, { empty: '계약 자료 없음' });

    // 달성률(매출) — 게이지
    const revCv = el('canvas', { role: 'img', 'aria-label': '매출 달성률 게이지' });
    const rate = Math.max(0, Math.min(1, cur.달성률매출 || 0));
    grid.append(card('달성률(매출)', unit, el('div', { class: 'body' },
      el('div', { class: 'chart' }, revCv, el('div', { class: 'center' }, el('div', { class: 'big', text: fmt(cur.매출) }), el('div', { class: 'sub', text: pct(cur.달성률매출) }))),
      el('div', { class: 'side' }, kvDelta('전년대비', cur.매출증감년), kvDelta('전월대비', cur.매출증감월)))));
    donut(revCv, ['달성', '남은 계획'], [rate, 1 - rate], [series(1), css('--grid')], { label: false, gauge: true, cutout: '70%' });

    // 인원현황
    const pplCv = el('canvas', { role: 'img', 'aria-label': '자격별 인원 구성' });
    const pplColors = PEOPLE.map((_, i) => series(i));
    grid.append(card('인원현황', '명', el('div', { class: 'body' },
      el('div', { class: 'chart' }, pplCv),
      el('div', { class: 'side' }, el('div', { class: 'k muted', text: '<KICPA>' }),
        kvDelta('전년대비', cur.회계사증감년), kvDelta('전월대비', cur.회계사증감월))),
    legend(PEOPLE.map((p, i) => [`${p} ${fmt(cur.people[p])}`, pplColors[i]]))));
    donut(pplCv, PEOPLE, PEOPLE.map((p) => cur.people[p]), pplColors, { cutout: '45%', empty: `${monthLabel(state.sel.month)} 인원이 입력용 엑셀 '인원' 시트에 없습니다` });

    // 계약 및 매출(누적)
    const cumCv = el('canvas', { role: 'img', 'aria-label': '월별 누적 계약·매출과 사업계획' });
    const cum = el('div', { class: 'card span2' },
      el('div', { class: 'head' }, el('h2', { text: '계약 및 매출(누적)' }), el('span', { class: 'unit', text: `(단위: ${unit})` })),
      el('div', { class: 'chart tall' }, cumCv),
      legend([['계약', series(0)], ['매출', series(1)], [`계획 ${fmt(cur.plan)}`, css('--muted')]]));
    grid.append(cum);
    const ms = res.months.map((m) => res.metric(m, state.sel.bu));
    const hi = (i, c) => (res.months[i] === state.sel.month ? c : alpha(c, 0.4));
    chart(cumCv, {
      data: {
        labels: res.months.map(monthLabel),
        datasets: [
          { type: 'bar', label: '계약', data: ms.map((x) => x.계약), backgroundColor: ms.map((_, i) => hi(i, series(0))), borderRadius: 4, categoryPercentage: 0.7 },
          { type: 'bar', label: '매출', data: ms.map((x) => x.매출), backgroundColor: ms.map((_, i) => hi(i, series(1))), borderRadius: 4, categoryPercentage: 0.7 },
          { type: 'line', label: '계획', data: ms.map((x) => x.plan), borderColor: css('--muted'), borderWidth: 2, borderDash: [4, 4], pointRadius: 0 },
        ],
      },
      options: baseOpts({
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: window.innerWidth < 700, font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: css('--grid') }, border: { display: false }, ticks: { callback: (v) => fmt(v) } } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
          datalabels: {
            display: (ctx) => ctx.dataset.type === 'bar' && res.months[ctx.dataIndex] === state.sel.month,
            anchor: 'end', align: 'end', color: css('--ink'), font: { weight: 600, size: 12 }, formatter: (v) => fmt(v),
          },
        },
      }),
    });

    // 자금현황(법인전체)
    const fundCv = el('canvas', { role: 'img', 'aria-label': '자금과 예수금' });
    grid.append(card('자금현황(법인전체)', unit, el('div', { class: 'body' },
      el('div', { class: 'chart' }, fundCv),
      el('div', { class: 'side' }, el('div', { class: 'k muted', text: '<자금>' }), kvDelta('전년대비', cur.자금증감년), kvDelta('전월대비', cur.자금증감월))),
    legend([[`자금 ${fmt(cur.자금)}`, series(0)], [`예수금 ${fmt(cur.예수금)}`, series(1)]])));
    donut(fundCv, ['자금', '예수금'], [cur.자금, cur.예수금], [series(0), series(1)], { cutout: '45%', empty: `${monthLabel(state.sel.month)} 자금이 입력용 엑셀 '자금' 시트에 없습니다` });

    // 장기채권(1년 이상)
    grid.append(card('장기채권(1년 이상)', unit,
      el('div', { class: 'hero', text: fmt(cur.미수금) }),
      el('div', { class: 'side', style: 'flex-direction:row;justify-content:center;gap:32px' },
        kvDelta('전년대비', cur.미수금증감년, { goodWhenUp: false }), kvDelta('전월대비', cur.미수금증감월, { goodWhenUp: false }))));

    return grid;
  }

  // ---- 전월 대비 분석 ------------------------------------------------------
  function momView(res, cur) {
    const d = res.momDetail(state.sel.month);
    const box = el('div');
    if (!d.ok) { box.append(el('p', { class: 'muted', text: d.why })); return box; }
    const inBu = (r) => state.sel.bu === TOTAL || r.본부 === state.sel.bu;
    const rows = d.rows.filter(inBu);
    const sum = (list) => list.reduce((s, r) => s + r.증감, 0);
    const by = (k) => rows.filter((r) => r.구분 === k);
    const check = sum(rows) - (cur.계약증감월 || 0);
    box.append(el('div', { class: 'cards-row' },
      stat(`전월대비 계약 증감 (${monthLabel(d.prevMonth)} → ${monthLabel(state.sel.month)})`, fmt(cur.계약증감월)),
      ...['신규', '증가', '감소', '삭제', '기장수기'].map((k) => stat(`${k} ${by(k).length}건`, fmt(sum(by(k))))),
      stat('건별 합계 대사', Math.abs(check) < 0.001 ? '일치 ✓' : `차이 ${fmt(check, 3)}`)));

    // 본부별 요약
    const bus = [...res.buList];
    const t = el('table', {}, el('thead', {}, el('tr', {}, ['본부', '전월 계약', '당월 계약', '증감', '신규', '증가', '감소', '삭제·기장'].map((h, i) => el('th', { class: i ? 'num' : '', text: h })))));
    const tb = el('tbody');
    for (const b of [...bus, TOTAL]) {
      const m = res.metric(state.sel.month, b); const p = res.metric(d.prevMonth, b);
      const rs = d.rows.filter((r) => b === TOTAL || r.본부 === b);
      const s = (k) => sum(rs.filter((r) => (Array.isArray(k) ? k.includes(r.구분) : r.구분 === k)));
      tb.append(el('tr', { class: b === TOTAL ? 'total' : '', style: 'cursor:pointer', onclick: () => { state.sel.bu = b; render(); } },
        el('td', { text: b }), ...[p.계약, m.계약, m.계약증감월, s('신규'), s('증가'), s('감소'), s(['삭제', '기장수기'])].map((v) => el('td', { class: 'num', text: fmt(v) }))));
    }
    t.append(tb);
    box.append(el('section', { class: 'block' }, el('h3', { text: '본부별 요약 (행을 누르면 그 본부만 봅니다)' }), el('div', { class: 'table-wrap' }, t)));

    // 계약 건별 목록
    const kinds = ['전체', '신규', '증가', '감소', '삭제', '기장수기', '사유 미입력'];
    const q = state.mom.q.trim().toLowerCase();
    const shown = rows.filter((r) => (state.mom.kind === '전체' || (state.mom.kind === '사유 미입력' ? !r.사유 : r.구분 === state.mom.kind))
      && (!q || [r.no, r.회사명, r.보고서명, r.사유, r.사업부].some((s) => String(s).toLowerCase().includes(q))));
    const header = ['본부', '사업부', '계약번호', '회사명', '보고서명', '중분류', '전월', '당월', '증감', '구분', '사유'];
    const search = el('input', { type: 'search', placeholder: '회사명·계약번호·사유 검색', value: state.mom.q, 'aria-label': '검색' });
    search.addEventListener('change', () => { state.mom.q = search.value; render(); });
    box.append(el('section', { class: 'block' },
      el('h3', { text: `계약 건별 증감 (${shown.length}건, 증감 금액이 큰 순)` }),
      el('div', { class: 'toolbar' },
        el('div', { class: 'seg' }, kinds.map((k) => el('button', { 'aria-pressed': String(state.mom.kind === k), onclick: () => { state.mom.kind = k; render(); }, text: k }))),
        search,
        el('button', { class: 'btn', text: 'CSV 다운로드', onclick: () => download(`전월대비_${monthLabel(state.sel.month)}_${state.sel.bu}.csv`,
          toCsv(['월', ...header], shown.map((r) => [monthLabel(state.sel.month), r.본부, r.사업부, r.no, r.회사명, r.보고서명, r.중분류, r.전월, r.당월, r.증감, r.구분, r.사유]))) })),
      el('p', { class: 'muted', text: "사유는 입력용.xlsx의 '사유' 시트에 월·계약번호·사유를 적으면 여기에 표시됩니다. '사유 미입력'만 골라 CSV로 받아서 채운 뒤 붙여 넣으면 편합니다." }),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, header.map((h, i) => el('th', { class: i >= 6 && i <= 8 ? 'num' : '', text: h })))),
        el('tbody', {}, shown.map((r) => el('tr', {},
          el('td', { text: r.본부 }), el('td', { text: r.사업부 }), el('td', { text: r.no }), el('td', { text: r.회사명 }),
          el('td', { class: 'wrap-text', text: r.보고서명 }), el('td', { text: r.중분류 }),
          el('td', { class: 'num', text: fmt(r.전월, 1) }), el('td', { class: 'num', text: fmt(r.당월, 1) }),
          el('td', { class: 'num' }, delta(r.증감, { digits: 1 })), el('td', {}, el('span', { class: 'pill', text: r.구분 })),
          el('td', { class: 'wrap-text', text: r.사유 }))))))));
    return box;
  }
  const stat = (k, v) => el('div', { class: 'stat' }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }));
  const rate = (now, before) => (now == null || !before ? null : (now - before) / Math.abs(before));
  const pctSigned = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);

  // ---- 전년 대비 분석 ------------------------------------------------------
  const YOY_LIMIT = 100; // 고객 목록은 처음에 증감이 큰 순서로 이만큼만 보여준다
  // 합계는 입력용 '전년실적'(공식 값) 기준, 중분류·고객별 내역은 작년 같은 달 ERP 원본 기준.
  function yoyView(res, cur) {
    const F = state.yoy.field;
    const box = el('div');
    const pyKey = F === '계약' ? '계약전년' : '매출전년';
    const m = state.sel.month; const pm = Model.addMonths(m, -12);
    box.append(el('div', { class: 'toolbar' },
      el('span', { class: 'muted', text: '비교 기준' }),
      el('div', { class: 'seg' }, ['계약', '매출'].map((k) => el('button', { 'aria-pressed': String(F === k), onclick: () => { state.yoy.field = k; render(); }, text: k })))));
    box.append(el('div', { class: 'cards-row' },
      stat(`${F} ${monthLabel(m)} 누적 · ${state.sel.bu}`, fmt(cur[F])),
      stat(`전년 동월 (${monthLabel(pm)})`, fmt(cur[pyKey])),
      stat('증감', fmt(cur[F] != null && cur[pyKey] != null ? cur[F] - cur[pyKey] : null)),
      stat('증감률', pctSigned(rate(cur[F], cur[pyKey])))));

    // 월별 누적 추이: 올해 vs 작년
    const trend = el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-bottom:12px' });
    const ms = res.months.map((x) => res.metric(x, state.sel.bu));
    for (const k of ['계약', '매출']) {
      const cv = el('canvas', { role: 'img', 'aria-label': `월별 누적 ${k} 올해와 작년 비교` });
      trend.append(el('div', { class: 'card' },
        el('div', { class: 'head' }, el('h2', { text: `월별 누적 ${k}` }), el('span', { class: 'unit', text: '(단위: 백만원)' })),
        el('div', { class: 'chart' }, cv),
        legend([[`FY${res.fyYear}`, series(0)], [`FY${res.fyYear - 1}`, css('--muted')]])));
      chart(cv, {
        type: 'line',
        data: { labels: res.months.map(monthLabel), datasets: [
          { label: `FY${res.fyYear}`, data: ms.map((x) => x[k]), borderColor: series(0), backgroundColor: series(0), borderWidth: 2, pointRadius: 4, spanGaps: false },
          { label: `FY${res.fyYear - 1}`, data: ms.map((x) => x[k === '계약' ? '계약전년' : '매출전년']), borderColor: css('--muted'), backgroundColor: css('--muted'), borderWidth: 2, borderDash: [4, 4], pointRadius: 3 },
        ] },
        options: baseOpts({
          interaction: { mode: 'index', intersect: false },
          scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, font: { size: 11 } } },
            y: { beginAtZero: true, grid: { color: css('--grid') }, border: { display: false }, ticks: { callback: (v) => fmt(v) } } },
          plugins: { legend: { display: false }, datalabels: { display: false },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)}` } } },
        }),
      });
    }
    box.append(trend);

    // 본부별 표
    const head = ['본부', '전년 계약', '당년 계약', '증감', '증감률', '전년 매출', '당년 매출', '증감', '증감률'];
    box.append(el('section', { class: 'block' }, el('h3', { text: `본부별 전년 동월 대비 (${monthLabel(pm)} → ${monthLabel(m)}, 행을 누르면 그 본부만 봅니다)` }),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i ? 'num' : '', text: h })))),
        el('tbody', {}, [...res.buList, TOTAL].map((b) => {
          const x = res.metric(m, b);
          return el('tr', { class: b === TOTAL ? 'total' : '', style: 'cursor:pointer', onclick: () => { state.sel.bu = b; render(); } },
            el('td', { text: b }),
            el('td', { class: 'num', text: fmt(x.계약전년) }), el('td', { class: 'num', text: fmt(x.계약) }),
            el('td', { class: 'num' }, delta(x.계약증감년)), el('td', { class: 'num', text: pctSigned(rate(x.계약, x.계약전년)) }),
            el('td', { class: 'num', text: fmt(x.매출전년) }), el('td', { class: 'num', text: fmt(x.매출) }),
            el('td', { class: 'num' }, delta(x.매출증감년)), el('td', { class: 'num', text: pctSigned(rate(x.매출, x.매출전년)) }));
        }))))));

    const d = res.yoyDetail(m);
    if (!d.ok) { box.append(el('p', { class: 'muted', text: d.why })); return box; }
    const inBu = (r) => state.sel.bu === TOTAL || r.본부 === state.sel.bu;
    const curRows = d.cur.filter(inBu); const prvRows = d.prv.filter(inBu);
    const total = (rows) => rows.reduce((s2, r) => s2 + r[F], 0);
    const gap = total(prvRows) - (cur[pyKey] ?? total(prvRows));
    if (Math.abs(gap) >= 0.5) {
      box.append(el('div', { class: 'warnings', text: `작년 ${monthLabel(pm)} 원본 합계(${fmt(total(prvRows))})와 입력용 '전년실적'(${fmt(cur[pyKey])})이 ${fmt(gap)}만큼 다릅니다. 조직개편 조정이나 원본에 없는 수기분 때문일 수 있습니다. 아래 내역은 원본 기준입니다.` }));
    }

    // 중분류별
    const cats = res.yoyByCat(curRows, prvRows, F);
    box.append(el('section', { class: 'block' }, el('h3', { text: `중분류별 ${F} (작년 같은 달 원본 기준)` }),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['중분류', '전년', '당년', '증감', '증감률'].map((h, i) => el('th', { class: i ? 'num' : '', text: h })))),
        el('tbody', {}, cats.map((x) => el('tr', {}, el('td', { text: x.key }), el('td', { class: 'num', text: fmt(x.전년) }), el('td', { class: 'num', text: fmt(x.당년) }),
          el('td', { class: 'num' }, delta(x.증감)), el('td', { class: 'num', text: pctSigned(rate(x.당년, x.전년)) }))))))));

    // 고객별
    const clients = res.yoyByClient(curRows, prvRows, F);
    const kinds = ['전체', '신규', '이탈', '증가', '감소'];
    const byKind = (k) => clients.filter((x) => x.구분 === k);
    const sumD = (list) => list.reduce((s2, x) => s2 + x.증감, 0);
    box.append(el('div', { class: 'cards-row' }, ['신규', '이탈', '증가', '감소'].map((k) => stat(`${k} 고객 ${byKind(k).length}곳`, fmt(sumD(byKind(k)))))));
    const q = state.yoy.q.trim().toLowerCase();
    const shown = clients.filter((x) => x.구분 !== '변동 없음' && (state.yoy.kind === '전체' || x.구분 === state.yoy.kind)
      && (!q || String(x.이름).toLowerCase().includes(q)));
    const header = ['본부', '회사명', '주 중분류', '전년 건수', '당년 건수', '전년', '당년', '증감', '구분'];
    const search = el('input', { type: 'search', placeholder: '회사명 검색', value: state.yoy.q, 'aria-label': '회사명 검색' });
    search.addEventListener('change', () => { state.yoy.q = search.value; render(); });
    box.append(el('section', { class: 'block' },
      el('h3', { text: `고객별 ${F} 증감 (${shown.length}곳, 증감 금액이 큰 순)` }),
      el('div', { class: 'toolbar' },
        el('div', { class: 'seg' }, kinds.map((k) => el('button', { 'aria-pressed': String(state.yoy.kind === k), onclick: () => { state.yoy.kind = k; render(); }, text: k }))),
        search,
        el('button', { class: 'btn', text: 'CSV 다운로드', onclick: () => download(`전년대비_${F}_${monthLabel(m)}_${state.sel.bu}.csv`,
          toCsv(['기준월', '전년 동월', ...header], shown.map((x) => [monthLabel(m), monthLabel(pm), x.본부, x.이름, x.주중분류, x.n전년, x.n당년, x.전년, x.당년, x.증감, x.구분]))) })),
      el('p', { class: 'muted', text: '계약번호는 해마다 새로 매겨지므로 회사명으로 묶어 비교합니다. (주)·주식회사 표기와 띄어쓰기 차이는 같은 회사로 봅니다.' }),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, header.map((h, i) => el('th', { class: i >= 3 && i <= 7 ? 'num' : '', text: h })))),
        el('tbody', {}, (state.yoy.all ? shown : shown.slice(0, YOY_LIMIT)).map((x) => el('tr', {},
          el('td', { text: x.본부 }), el('td', { text: x.이름 }), el('td', { text: x.주중분류 }),
          el('td', { class: 'num', text: fmt(x.n전년) }), el('td', { class: 'num', text: fmt(x.n당년) }),
          el('td', { class: 'num', text: fmt(x.전년, 1) }), el('td', { class: 'num', text: fmt(x.당년, 1) }),
          el('td', { class: 'num' }, delta(x.증감, { digits: 1 })), el('td', {}, el('span', { class: 'pill', text: x.구분 }))))))),
      shown.length > YOY_LIMIT ? el('div', { class: 'toolbar' }, el('button', { class: 'btn', onclick: () => { state.yoy.all = !state.yoy.all; render(); },
        text: state.yoy.all ? `상위 ${YOY_LIMIT}곳만 보기` : `전체 ${fmt(shown.length)}곳 보기 (지금은 상위 ${YOY_LIMIT}곳)` })) : null));
    return box;
  }

  // ---- 데이터 요약 ---------------------------------------------------------
  const SUMMARY_COLS = [
    ['월', (x) => monthLabel(x.month)], ['본부', (x) => x.bu], ['사업계획', (x) => x.plan], ['계약', (x) => x.계약], ['매출', (x) => x.매출],
    ['달성률(계약)', (x) => x.달성률계약, pct], ['달성률(매출)', (x) => x.달성률매출, pct],
  ];
  function summaryCols(res) {
    return [...SUMMARY_COLS,
      ...res.cats.map((c) => [c, (x) => x.cats[c]]),
      ...PEOPLE.map((p) => [`${p}(명)`, (x) => x.people[p]]),
      ['자금', (x) => x.자금], ['예수금', (x) => x.예수금], ['미수금', (x) => x.미수금],
      ['전년계약', (x) => x.계약전년], ['전년매출', (x) => x.매출전년],
      ['계약증감(년)', (x) => x.계약증감년], ['계약증감(월)', (x) => x.계약증감월],
      ['매출증감(년)', (x) => x.매출증감년], ['매출증감(월)', (x) => x.매출증감월],
      ['회계사증감(년)', (x) => x.회계사증감년], ['회계사증감(월)', (x) => x.회계사증감월],
      ['자금증감(년)', (x) => x.자금증감년], ['자금증감(월)', (x) => x.자금증감월],
      ['미수금증감(년)', (x) => x.미수금증감년], ['미수금증감(월)', (x) => x.미수금증감월]];
  }
  function summaryView(res) {
    const cols = summaryCols(res);
    const rows = res.summaryRows.filter((x) => x.hasData && (state.sel.bu === TOTAL || x.bu === state.sel.bu || x.bu === TOTAL));
    return el('div', {},
      el('div', { class: 'toolbar' },
        el('span', { class: 'muted', text: '지금 쓰시는 \'데이터요약\' 시트와 같은 표입니다. CSV로 받아 기존 보고용 파일에 붙여 넣을 수도 있습니다.' }),
        el('button', { class: 'btn', text: 'CSV 다운로드', onclick: () => download(`데이터요약_FY${res.fyYear}.csv`, toCsv(cols.map((c) => c[0]), rows.map((x) => cols.map((c) => c[1](x))))) })),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, cols.map((c, i) => el('th', { class: i > 1 ? 'num' : '', text: c[0] })))),
        el('tbody', {}, rows.map((x) => el('tr', { class: x.bu === TOTAL ? 'total' : '' },
          cols.map((c, i) => el('td', { class: i > 1 ? 'num' : '', text: i > 1 ? (c[2] || fmt)(c[1](x)) : c[1](x) }))))))));
  }

  // ---- 검증 ---------------------------------------------------------------
  function checkView(res) {
    const box = el('div');
    // 불러온 파일
    const monthOptions = (() => { const out = []; const first = Model.addMonths(res.fyFirst, -12); for (let i = 0; i < 36; i++) out.push(Model.addMonths(first, i)); return out; })();
    box.append(el('section', { class: 'block' }, el('h3', { text: '불러온 파일' }),
      el('p', { class: 'muted', text: '기준월은 ERP 등록일자 중 가장 늦은 날짜로 자동 판단합니다. 틀리면 여기서 바꾸세요.' }),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['파일', '시트', '종류', '기준월', '기준일', '건수', '계약번호 없어 제외한 행'].map((h, i) => el('th', { class: i >= 5 ? 'num' : '', text: h })))),
        el('tbody', {}, state.datasets.map((d) => {
          const sel = el('select', { 'aria-label': '기준월' }, el('option', { value: '', text: '(미지정)' }),
            monthOptions.map((m) => el('option', { value: m, selected: d.month === m, text: monthLabel(m) })));
          sel.addEventListener('change', () => { d.month = sel.value || null; rebuild(); });
          return el('tr', {}, el('td', { text: d.fileName }), el('td', { text: d.sheetName }), el('td', { text: d.kind === 'contract' ? '계약·매출' : '미수금' }),
            el('td', {}, sel), el('td', { text: d.asOf || '-' }), el('td', { class: 'num', text: fmt(d.rows.length) }), el('td', { class: 'num', text: d.noId ? fmt(d.noId) : '-' }));
        }))))));

    // 월별 합계(원) — 손익계산서 대사용
    box.append(el('section', { class: 'block' }, el('h3', { text: '월별 합계 (원 단위, 기장 수기분 포함) — 손익계산서 매출과 대사하세요' }),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['월', '계약', '매출', '기장 수기분(계약)'].map((h, i) => el('th', { class: i ? 'num' : '', text: h })))),
        el('tbody', {}, res.months.filter((m) => res.loadedMonths.has(m)).map((m) => {
          const x = res.metric(m, TOTAL); const g = state.cfg.gijang.filter((z) => z.month === m).reduce((s, z) => s + z.계약, 0);
          return el('tr', {}, el('td', { text: monthLabel(m) }), el('td', { class: 'num', text: fmt(x.계약 * state.cfg.unit) }),
            el('td', { class: 'num', text: fmt(x.매출 * state.cfg.unit) }), el('td', { class: 'num', text: fmt(g) }));
        }))))));

    // 해약 건
    const d = res.contracts.get(state.sel.month);
    const cancelled = d ? d.rows.filter((r) => r.상태 === '해약') : [];
    box.append(el('section', { class: 'block' }, el('h3', { text: `${monthLabel(state.sel.month)} 계약상태 '해약' 건 (${cancelled.length}건) — 실적에 포함되어 있습니다` }),
      cancelled.length ? el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['계약번호', '사업부', '회사명', '계약구분', '계약(원)', '매출(원)'].map((h, i) => el('th', { class: i >= 4 ? 'num' : '', text: h })))),
        el('tbody', {}, cancelled.map((r) => el('tr', {}, el('td', { text: r.no }), el('td', { text: r.사업부 }), el('td', { text: r.회사명 }), el('td', { text: r.계약구분 }),
          el('td', { class: 'num', text: fmt(r.계약) }), el('td', { class: 'num', text: fmt(r.매출) })))))) : el('p', { class: 'muted', text: '없음' })));

    // 미분류
    const unm = [...res.unmappedBu].map(([k, v]) => ['사업부', k, v]).concat([...res.unmappedCat].map(([k, v]) => ['계약구분', k, v]));
    box.append(el('section', { class: 'block' }, el('h3', { text: `매핑표에 없는 값 (${unm.length}개)` }),
      unm.length ? el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['종류', '값', '계약 금액(원, 전체 월 합계)'].map((h, i) => el('th', { class: i === 2 ? 'num' : '', text: h })))),
        el('tbody', {}, unm.map(([a, b, c]) => el('tr', {}, el('td', { text: a }), el('td', { text: b }), el('td', { class: 'num', text: fmt(c) }))))))
        : el('p', { class: 'muted', text: '없음 — 모든 사업부와 계약구분이 매핑되었습니다.' })));

    // 브라우저 정보 (문제 신고용)
    box.append(el('section', { class: 'block' }, el('h3', { text: '브라우저 정보 (화면이 이상하면 이 부분을 캡처해 주세요)' }),
      el('ul', {},
        el('li', { text: `브라우저: ${navigator.userAgent}` }),
        el('li', { text: `화면: ${window.innerWidth}×${window.innerHeight}, 배율 ${window.devicePixelRatio}` }),
        el('li', { text: `그래프 라이브러리: ${typeof Chart === 'function' ? 'Chart.js ' + Chart.version : '불러오지 못함'} · 그려진 그래프 ${charts.length}개` }))));

    // 입력용 누락
    const missing = [];
    for (const m of res.months.filter((x) => res.loadedMonths.has(x))) {
      if (!state.cfg.people[m]) missing.push(`${monthLabel(m)}: 인원 입력 없음`);
      if (state.cfg.fund[m]?.자금 == null) missing.push(`${monthLabel(m)}: 자금 입력 없음`);
      if (!res.ars.has(m) && !state.cfg.arManual[m]) missing.push(`${monthLabel(m)}: 미수금 자료 없음`);
      if (!state.cfg.prev[m]) missing.push(`${monthLabel(m)}: 전년실적 입력 없음`);
    }
    box.append(el('section', { class: 'block' }, el('h3', { text: '입력용 엑셀 확인' }),
      missing.length ? el('ul', {}, missing.map((t) => el('li', { text: t }))) : el('p', { class: 'muted', text: '자료가 있는 모든 달의 입력값이 채워져 있습니다.' })));
    return box;
  }

  render();
  window.__dashboard = { state, loadFiles };
})();
