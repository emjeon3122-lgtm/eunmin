// 화면 — 파일 올리기, 대시보드, 전월 대비 분석, 데이터 요약, 검증
(() => {
  const { TOTAL, PEOPLE, monthLabel } = Model;
  const state = { cfg: null, datasets: [], files: [], persist: false, savedAt: null, res: null, errors: [], sel: { month: null, bu: TOTAL, cat: null }, tab: 'dash', mom: { kind: '전체', q: '' }, field: '계약', yoyList: '올해' };
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
  // files: File 또는 { name, arrayBuffer() }. 같은 이름의 파일을 다시 올리면 이전 것을 대신한다.
  async function loadFiles(files, { restoring = false, months = null } = {}) {
    state.errors = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const book = await XlsxReader.open(buf);
        if (Model.isInputBook(book)) {
          state.cfg = await Model.readInput(book);
          state.files = state.files.filter((x) => !x.input);
          state.files.push({ name: f.name, buf, input: true });
        } else {
          const found = await Model.readDataBook(book, f.name);
          if (!found.length) state.errors.push(`'${f.name}': 계약·매출(ERP) 시트나 미수금 시트를 찾지 못했습니다.`);
          state.datasets = state.datasets.filter((d) => d.fileName !== f.name);
          state.datasets.push(...found);
          state.files = state.files.filter((x) => x.name !== f.name);
          state.files.push({ name: f.name, buf, input: false });
        }
      } catch (e) {
        state.errors.push(`'${f.name}': ${e.message}`);
      }
    }
    if (months) state.datasets.forEach((d) => { const k = `${d.fileName}|${d.sheetName}`; if (k in months) d.month = months[k]; });
    rebuild();
    if (state.persist && !restoring) await persist();
  }

  // ---- 이 PC에 저장 --------------------------------------------------------
  async function persist() {
    try {
      const months = Object.fromEntries(state.datasets.map((d) => [`${d.fileName}|${d.sheetName}`, d.month]));
      state.savedAt = new Date().toLocaleString('ko-KR');
      await Store.save({ savedAt: state.savedAt, files: state.files.map(({ name, buf, input }) => ({ name, buf, input })), months });
    } catch (e) {
      state.persist = false;
      state.errors.push(`이 PC에 저장하지 못했습니다: ${e.message || e}`);
    }
    render();
  }
  async function forget() {
    try { await Store.clear(); } catch { /* 저장소를 쓸 수 없으면 지울 것도 없다 */ }
    state.persist = false; state.savedAt = null;
  }
  function saveButton() {
    if (!Store.available()) return null;
    if (!state.persist) {
      return el('button', { class: 'btn', title: '다음에 열 때 파일을 다시 올리지 않아도 되도록 이 PC의 브라우저에 저장합니다',
        onclick: () => { state.persist = true; persist(); }, text: '이 PC에 저장' });
    }
    return el('button', { class: 'btn', title: `${state.savedAt || ''} 저장 · 누르면 저장한 자료를 지웁니다`,
      onclick: async () => { if (confirm('이 PC에 저장한 자료를 지울까요? 지금 화면은 그대로 유지됩니다.')) { await forget(); render(); } },
      text: `저장됨 ✓ ${state.savedAt || ''} (지우기)` });
  }
  async function restore() {
    if (!Store.available()) return;
    try {
      const saved = await Store.load();
      if (!saved?.files?.length) return;
      state.persist = true; state.savedAt = saved.savedAt;
      const files = [...saved.files].sort((a, b) => b.input - a.input);
      await loadFiles(files.map((f) => ({ name: f.name, arrayBuffer: async () => f.buf })), { restoring: true, months: saved.months });
    } catch {
      // 저장소가 막혀 있거나 손상되었으면 빈 화면에서 시작한다.
    }
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
        saveButton(),
        el('button', { class: 'btn', onclick: async () => {
          if (state.persist && !confirm('처음 화면으로 돌아가면 이 PC에 저장한 자료도 함께 지웁니다. 계속할까요?')) return;
          await forget();
          Object.assign(state, { cfg: null, datasets: [], files: [], res: null, errors: [] }); render();
        }, text: '처음으로' })),
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
      el('div', { class: 'note', text: "파일은 이 PC의 브라우저 안에서만 읽고 인터넷으로 보내지 않습니다. 창을 닫으면 사라지며, 화면 위쪽 '이 PC에 저장'을 켜면 다음에 열 때 자동으로 다시 불러옵니다." }));
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

  // ---- 분석 탭 공통 --------------------------------------------------------
  const stat = (k, v, sub) => el('div', { class: 'stat' }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }), sub ? el('div', { class: 'k', text: sub }) : null);
  const rate = (now, before) => (now == null || !before ? null : (now - before) / Math.abs(before));
  const pctSigned = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
  const sumD = (list) => list.reduce((s, r) => s + r.증감, 0);
  // 계약/매출, 중분류(없으면 합계) 기준 값
  const valOf = (x, F, cat) => (!x || !x.hasData ? null : cat ? (F === '계약' ? x.cats[cat] : x.catsR[cat]) : x[F]);
  const setCat = (c) => { state.sel.cat = state.sel.cat === c ? null : c; render(); };

  function fieldToggle(extra) {
    return el('div', { class: 'toolbar' },
      el('span', { class: 'muted', text: '비교 기준' }),
      el('div', { class: 'seg' }, ['계약', '매출'].map((k) => el('button', { 'aria-pressed': String(state.field === k), onclick: () => { state.field = k; render(); }, text: k }))),
      state.sel.cat ? el('button', { class: 'btn', onclick: () => setCat(state.sel.cat), text: `중분류: ${state.sel.cat} ✕` }) : null,
      extra || null);
  }
  function simpleTable(header, rows, numFrom = 1) {
    return el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, header.map((h, i) => el('th', { class: i >= numFrom ? 'num' : '', text: h })))),
      el('tbody', {}, rows)));
  }
  // 계약 건별 증감 표 (전월 대비)
  function momRowsTable(rows) {
    const header = ['본부', '사업부', '계약번호', '회사명', '보고서명', '중분류', '전월', '당월', '증감', '구분', '사유'];
    return el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, header.map((h, i) => el('th', { class: i >= 6 && i <= 8 ? 'num' : '', text: h })))),
      el('tbody', {}, rows.map((r) => el('tr', {},
        el('td', { text: r.본부 }), el('td', { text: r.사업부 }), el('td', { text: r.no }), el('td', { text: r.회사명 }),
        el('td', { class: 'wrap-text', text: r.보고서명 }), el('td', { text: r.중분류 }),
        el('td', { class: 'num', text: fmt(r.전월, 1) }), el('td', { class: 'num', text: fmt(r.당월, 1) }),
        el('td', { class: 'num' }, delta(r.증감, { digits: 1 })), el('td', {}, el('span', { class: 'pill', text: r.구분 })),
        el('td', { class: 'wrap-text', text: r.사유 }))))));
  }
  const kindSums = (rows) => ['신규', '증가', '감소', '삭제', '기장수기', '분류변경'].map((k) => { const l = rows.filter((r) => r.구분 === k); return stat(`${k} ${l.length}건`, fmt(sumD(l))); });

  // ---- 전월 대비 분석 ------------------------------------------------------
  function momView(res, cur) {
    const F = state.field; const m = state.sel.month; const cat = state.sel.cat;
    const box = el('div', {}, fieldToggle());
    const d = res.momDetail(m, F);
    if (!d.ok) { box.append(el('p', { class: 'muted', text: d.why })); return box; }
    const inBu = (r, b = state.sel.bu) => b === TOTAL || r.본부 === b;
    const inCat = (r, c = cat) => !c || r.중분류 === c;
    const rows = d.rows.filter((r) => inBu(r) && inCat(r));
    const prevX = (b) => res.metric(d.prevMonth, b);
    const expect = (valOf(cur, F, cat) ?? 0) - (valOf(prevX(state.sel.bu), F, cat) ?? 0);
    const check = sumD(rows) - expect;
    box.append(el('div', { class: 'cards-row' },
      stat(`전월대비 ${F} 증감 · ${state.sel.bu}${cat ? ' · ' + cat : ''}`, fmt(expect), `${monthLabel(d.prevMonth)} → ${monthLabel(m)}`),
      ...kindSums(rows),
      stat('건별 합계 대사', Math.abs(check) < 0.001 ? '일치 ✓' : `차이 ${fmt(check, 3)}`)));

    // 중분류별 요약
    const catRow = (c) => {
      const rs = d.rows.filter((r) => inBu(r) && inCat(r, c));
      const s = (k) => sumD(rs.filter((r) => k.includes(r.구분)));
      const now = valOf(cur, F, c); const before_ = valOf(prevX(state.sel.bu), F, c);
      return el('tr', { class: !c ? 'total' : cat === c ? 'selected' : '', style: 'cursor:pointer', onclick: () => (c ? setCat(c) : (state.sel.cat = null, render())) },
        el('td', { text: c || '합계' }), el('td', { class: 'num', text: fmt(before_) }), el('td', { class: 'num', text: fmt(now) }),
        el('td', { class: 'num' }, delta(now != null && before_ != null ? now - before_ : null)),
        ...[s(['신규']), s(['증가']), s(['감소']), s(['삭제', '기장수기', '분류변경'])].map((v) => el('td', { class: 'num', text: fmt(v) })));
    };
    box.append(el('section', { class: 'block' }, el('h3', { text: `중분류별 전월 대비 · ${state.sel.bu} (행을 누르면 그 중분류의 계약만 봅니다)` }),
      simpleTable(['중분류', `전월 ${F}`, `당월 ${F}`, '증감', '신규', '증가', '감소', '삭제·기장·분류변경'], [...res.cats.map(catRow), catRow(null)])));

    // 본부별 요약
    box.append(el('section', { class: 'block' }, el('h3', { text: `본부별 전월 대비${cat ? ' · ' + cat : ''} (행을 누르면 그 본부만 봅니다)` }),
      simpleTable(['본부', `전월 ${F}`, `당월 ${F}`, '증감', '신규', '증가', '감소', '삭제·기장·분류변경'], [...res.buList, TOTAL].map((b) => {
        const rs = d.rows.filter((r) => inBu(r, b) && inCat(r));
        const s = (k) => sumD(rs.filter((r) => k.includes(r.구분)));
        const now = valOf(res.metric(m, b), F, cat); const before_ = valOf(prevX(b), F, cat);
        return el('tr', { class: b === TOTAL ? 'total' : b === state.sel.bu ? 'selected' : '', style: 'cursor:pointer', onclick: () => { state.sel.bu = b; render(); } },
          el('td', { text: b }), el('td', { class: 'num', text: fmt(before_) }), el('td', { class: 'num', text: fmt(now) }),
          el('td', { class: 'num' }, delta(now != null && before_ != null ? now - before_ : null)),
          ...[s(['신규']), s(['증가']), s(['감소']), s(['삭제', '기장수기', '분류변경'])].map((v) => el('td', { class: 'num', text: fmt(v) })));
      }))));

    // 계약 건별 목록
    const kinds = ['전체', '신규', '증가', '감소', '삭제', '기장수기', '분류변경', '사유 미입력'];
    const q = state.mom.q.trim().toLowerCase();
    const shown = rows.filter((r) => (state.mom.kind === '전체' || (state.mom.kind === '사유 미입력' ? !r.사유 : r.구분 === state.mom.kind))
      && (!q || [r.no, r.회사명, r.보고서명, r.사유, r.사업부].some((s) => String(s).toLowerCase().includes(q))));
    const search = el('input', { type: 'search', placeholder: '계약번호·회사명·보고서명·사유 검색', value: state.mom.q, 'aria-label': '검색' });
    search.addEventListener('change', () => { state.mom.q = search.value; render(); });
    box.append(el('section', { class: 'block' },
      el('h3', { text: `계약 건별 ${F} 증감 (${shown.length}건, 증감 금액이 큰 순)` }),
      el('div', { class: 'toolbar' },
        el('div', { class: 'seg' }, kinds.map((k) => el('button', { 'aria-pressed': String(state.mom.kind === k), onclick: () => { state.mom.kind = k; render(); }, text: k }))),
        search,
        el('button', { class: 'btn', text: 'CSV 다운로드', onclick: () => download(`전월대비_${F}_${monthLabel(m)}_${state.sel.bu}${cat ? '_' + cat : ''}.csv`,
          toCsv(['월', '본부', '사업부', '계약번호', '회사명', '보고서명', '중분류', '전월', '당월', '증감', '구분', '사유'],
            shown.map((r) => [monthLabel(m), r.본부, r.사업부, r.no, r.회사명, r.보고서명, r.중분류, r.전월, r.당월, r.증감, r.구분, r.사유]))) })),
      el('p', { class: 'muted', text: "사유는 입력용.xlsx의 '사유' 시트에 월·계약번호·사유를 적으면 여기에 표시됩니다. '사유 미입력'만 골라 CSV로 받아서 채운 뒤 붙여 넣으면 편합니다." }),
      momRowsTable(shown)));
    return box;
  }

  // ---- 전년 대비 분석 ------------------------------------------------------
  // 합계는 입력용 '전년실적'(공식 값) 기준, 중분류·계약 내역은 작년 같은 달 ERP 원본 기준.
  const TOP_N = 15;
  function yoyView(res, cur) {
    const F = state.field; const m = state.sel.month; const cat = state.sel.cat;
    const pm = Model.addMonths(m, -12);
    const pyKey = F === '계약' ? '계약전년' : '매출전년';
    const box = el('div', {}, fieldToggle());
    box.append(el('div', { class: 'cards-row' },
      stat(`${F} ${monthLabel(m)} 누적 · ${state.sel.bu}`, fmt(cur[F])),
      stat(`전년 동월 (${monthLabel(pm)})`, fmt(cur[pyKey])),
      stat('전년대비 증감', fmt(cur[F] != null && cur[pyKey] != null ? cur[F] - cur[pyKey] : null)),
      stat('증감률', pctSigned(rate(cur[F], cur[pyKey])))));

    // 월별 누적 추이: 올해 vs 작년
    const trend = el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-bottom:12px' });
    const ms = res.months.map((x) => res.metric(x, state.sel.bu));
    for (const k of ['계약', '매출']) {
      const cv = el('canvas', { role: 'img', 'aria-label': `월별 누적 ${k} 올해와 작년 비교` });
      trend.append(el('div', { class: 'card' },
        el('div', { class: 'head' }, el('h2', { text: `월별 누적 ${k} · ${state.sel.bu}` }), el('span', { class: 'unit', text: '(단위: 백만원)' })),
        el('div', { class: 'chart' }, cv),
        legend([[`FY${res.fyYear}`, series(0)], [`FY${res.fyYear - 1}`, css('--muted')]])));
      chart(cv, {
        type: 'line',
        data: { labels: res.months.map(monthLabel), datasets: [
          { label: `FY${res.fyYear}`, data: ms.map((x) => x[k]), borderColor: series(0), backgroundColor: series(0), borderWidth: 2, pointRadius: 4 },
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

    // 중분류별: 전월 대비 + 전년 대비
    const y = res.yoyDetail(m);
    const inBu = (r) => state.sel.bu === TOTAL || r.본부 === state.sel.bu;
    const curRows = y.ok ? y.cur.filter(inBu) : [];
    const prvRows = y.ok ? y.prv.filter(inBu) : [];
    const pyCat = y.ok ? res.sumByCat(prvRows, F) : null;
    const pmX = res.isFirst(m) ? null : res.metric(res.before(m), state.sel.bu);
    const momOf = (c) => {
      if (res.isFirst(m)) return valOf(cur, F, c); // 회계연도 첫 달: 누적이 새로 시작
      const b = valOf(pmX, F, c); const n = valOf(cur, F, c);
      return n != null && b != null ? n - b : null;
    };
    const pyOf = (c) => (!pyCat ? null : c ? pyCat[c] : Object.values(pyCat).reduce((s, v) => s + v, 0));
    const catRow = (c) => {
      const now = valOf(cur, F, c); const py = pyOf(c);
      return el('tr', { class: !c ? 'total' : cat === c ? 'selected' : '', style: 'cursor:pointer', onclick: () => (c ? setCat(c) : (state.sel.cat = null, render())) },
        el('td', { text: c || '합계' }), el('td', { class: 'num', text: fmt(now) }),
        el('td', { class: 'num' }, delta(momOf(c))),
        el('td', { class: 'num', text: fmt(py) }), el('td', { class: 'num' }, delta(now != null && py != null ? now - py : null)),
        el('td', { class: 'num', text: pctSigned(rate(now, py)) }),
        el('td', { class: 'wrap-text' }, (() => {
          const why = res.yoyReason(m, state.sel.bu, c);
          if (why) return why;
          return now != null && py != null && res.needsReview(now - py) ? el('span', { class: 'need', text: '⚠ 사유 필요' }) : '';
        })()));
    };
    box.append(el('section', { class: 'block' },
      el('h3', { text: `중분류별 전월·전년 대비 · ${state.sel.bu} (행을 누르면 아래에 그 중분류의 계약과 사유가 나옵니다)` }),
      simpleTable(['중분류', `당월 ${F}`, '전월대비', `전년 동월 (${monthLabel(pm)})`, '전년대비', '증감률', '전년대비 사유'], [...res.cats.map(catRow), catRow(null)])));
    if (y.ok) {
      const review = res.yoyReviewList(m);
      const need = review.rows.filter((r) => r.검토 && !r.사유).length;
      box.append(el('div', { class: 'stat', style: 'margin-bottom:12px' },
        el('div', { class: 'k', text: '전년대비 사유 작성' }),
        el('div', { class: 'toolbar', style: 'margin:4px 0' },
          el('button', { class: 'btn primary', text: '사유 작성용 목록 다운로드 (CSV)', onclick: () => download(`전년대비사유_작성용_${monthLabel(m)}.csv`,
            toCsv(['월', '본부', '중분류', '사유', '검토 필요', '전년 계약', '당년 계약', '계약 증감', '계약 증감률', '전년 매출', '당년 매출', '매출 증감', '매출 증감률', '참고'],
              [...review.rows].sort((a, b) => (b.검토 - a.검토) || Math.abs(b.계약증감) - Math.abs(a.계약증감)).map((r) => [
                r.월, r.본부, r.중분류, r.사유, r.검토 ? 'Y' : '',
                r.전년계약, r.당년계약, r.계약증감, pctSigned(rate(r.당년계약, r.전년계약)),
                r.전년매출, r.당년매출, r.매출증감, pctSigned(rate(r.당년매출, r.전년매출)), r.참고]))) }),
          el('span', { class: 'muted', text: `본부·중분류 ${review.rows.length}개 중 증감 ${fmt(state.cfg.yoyReviewMin)} 이상인데 사유가 없는 항목 ${need}개` })),
        el('div', { class: 'muted', text: "① 목록을 받아 엑셀에서 '사유' 칸만 채우고 ② 전체를 복사해 입력용.xlsx '전년대비사유' 시트에 붙여 넣은 뒤 ③ 입력용 파일을 다시 올리면 사유가 표시됩니다. 나머지 참고 칸은 붙여 넣어도 무시됩니다. 검토 기준 금액은 '설정' 시트의 '전년대비 검토기준(백만원)'으로 바꿀 수 있습니다." })));
      const gap = pyOf(null) - (cur[pyKey] ?? pyOf(null));
      if (Math.abs(gap) >= 0.5) box.append(el('div', { class: 'warnings', text: `작년 ${monthLabel(pm)} 원본 합계(${fmt(pyOf(null))})와 입력용 '전년실적'(${fmt(cur[pyKey])})이 ${fmt(gap)}만큼 다릅니다. 중분류별 전년 값은 원본 기준이라 조직개편 조정이나 원본에 없는 수기분이 빠져 있을 수 있습니다.` }));
    } else box.append(el('p', { class: 'muted', text: y.why }));

    // 선택한 중분류의 변동 내역
    const label = `${state.sel.bu}${cat ? ' · ' + cat : ''}`;
    const drill = el('section', { class: 'block' }, el('h3', { text: `${label} — 무엇 때문에 달라졌나` }));
    const reason = res.yoyReason(m, state.sel.bu, cat);
    drill.append(el('div', { class: 'stat', style: 'margin-bottom:12px' },
      el('div', { class: 'k', text: '전년대비 사유' }),
      reason ? el('div', { style: 'white-space:pre-wrap;font-size:15px', text: reason })
        : el('div', { class: 'muted', text: `입력용.xlsx '전년대비사유' 시트에 월(${monthLabel(m)})·본부(${state.sel.bu})·중분류(${cat || '비움'})·사유를 적으면 여기에 표시됩니다.` })));

    // 전월 대비 주요 변동 계약
    const md = res.momDetail(m, F);
    if (md.ok) {
      const rows = md.rows.filter((r) => inBu(r) && (!cat || r.중분류 === cat));
      drill.append(el('h3', { text: `전월 대비 주요 변동 계약 (${monthLabel(md.prevMonth)} → ${monthLabel(m)}, 상위 ${Math.min(TOP_N, rows.length)}건 / 전체 ${rows.length}건)` }),
        el('div', { class: 'cards-row' }, ...kindSums(rows)),
        momRowsTable(rows.slice(0, TOP_N)),
        el('div', { class: 'toolbar' }, el('button', { class: 'btn', onclick: () => { state.tab = 'mom'; render(); }, text: '전월 대비 분석 탭에서 전체 보기' })));
    } else {
      drill.append(el('p', { class: 'muted', text: md.why }));
    }

    // 전년 대비 구성과 주요 계약
    if (y.ok) {
      const sel = (rows) => rows.filter((r) => !cat || r.중분류 === cat);
      const c = sel(curRows); const p = sel(prvRows);
      const part = (rows, isNew) => rows.filter((r) => (r.신규여부 === 'Y') === isNew);
      const tot = (rows) => rows.reduce((s, r) => s + r[F], 0);
      drill.append(el('h3', { text: `전년 대비 구성 (${monthLabel(pm)} → ${monthLabel(m)}, ERP '신규여부' 기준)` }),
        el('div', { class: 'cards-row' },
          stat(`올해 신규수임(Y) ${part(c, true).length}건`, fmt(tot(part(c, true))), `작년 ${part(p, true).length}건 ${fmt(tot(part(p, true)))}`),
          stat(`올해 기존 ${part(c, false).length}건`, fmt(tot(part(c, false))), `작년 ${part(p, false).length}건 ${fmt(tot(part(p, false)))}`),
          stat('합계 증감', fmt(tot(c) - tot(p)), `올해 ${fmt(tot(c))} / 작년 ${fmt(tot(p))}`)));
      const which = state.yoyList === '작년' ? p : c;
      const reasons = state.cfg.reasons[state.yoyList === '작년' ? pm : m] || new Map();
      const top = [...which].sort((a, b) => Math.abs(b[F]) - Math.abs(a[F]));
      const head = ['계약번호', '본부', '사업부', '회사명', '보고서명', '중분류', '체결일', '신규수임', F, '사유(전월대비)'];
      drill.append(el('div', { class: 'toolbar' },
        el('strong', { text: `주요 계약 (${F} 큰 순 상위 ${Math.min(TOP_N, top.length)}건 / 전체 ${top.length}건)` }),
        el('div', { class: 'seg' }, [['올해', monthLabel(m)], ['작년', monthLabel(pm)]].map(([k, l]) => el('button', {
          'aria-pressed': String((state.yoyList || '올해') === k), onclick: () => { state.yoyList = k; render(); }, text: `${k} (${l})` }))),
        el('button', { class: 'btn', text: 'CSV 다운로드 (전체)', onclick: () => download(`전년대비_${F}_${state.yoyList || '올해'}_${monthLabel(m)}_${label}.csv`,
          toCsv(head, top.map((r) => [r.no, r.본부, r.사업부, r.회사명, r.보고서명, r.중분류, r.체결일, r.신규여부, r[F], reasons.get(r.no) || '']))) })),
      simpleTable(head, top.slice(0, TOP_N).map((r) => el('tr', {},
        el('td', { text: r.no }), el('td', { text: r.본부 }), el('td', { text: r.사업부 }), el('td', { text: r.회사명 }),
        el('td', { class: 'wrap-text', text: r.보고서명 }), el('td', { text: r.중분류 }), el('td', { text: r.체결일 }),
        el('td', { text: r.신규여부 }), el('td', { class: 'num', text: fmt(r[F], 1) }), el('td', { class: 'wrap-text', text: reasons.get(r.no) || '' }))), 8));
    }
    box.append(drill);
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
          sel.addEventListener('change', () => { d.month = sel.value || null; rebuild(); if (state.persist) persist(); });
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
  restore();
  window.__dashboard = { state, loadFiles };
})();
