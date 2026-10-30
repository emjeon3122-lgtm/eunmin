// 대시보드 숫자 대조 테스트.
// 사용법: node tests/verify.mjs <expected.json> <엑셀 파일...>
// expected.json 형식: { "2026-08": { "1본부": { "계약": 6119.3, ... } } } (실제 데이터는 저장소에 넣지 않는다)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 전역 설치된 playwright 도 찾도록 require(NODE_PATH 지원)를 쓴다.
const { chromium } = createRequire(import.meta.url)('playwright');

const [expectedPath, ...files] = process.argv.slice(2);
if (!expectedPath || !files.length) { console.error('usage: node tests/verify.mjs <expected.json> <xlsx...>'); process.exit(2); }
const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
const html = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', '실적대시보드.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(html).href);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=파일 선택')]);
await chooser.setFiles(files);
await page.waitForSelector('.grid', { timeout: 30000 });

const actual = await page.evaluate((exp) => {
  const res = window.__dashboard.state.res; const out = {};
  for (const [m, bus] of Object.entries(exp)) {
    out[m] = {};
    for (const [b, fields] of Object.entries(bus)) {
      const x = res.metric(m, b); out[m][b] = {};
      for (const f of Object.keys(fields)) {
        out[m][b][f] = f.startsWith('cat:') ? x.cats[f.slice(4)] : f.startsWith('people:') ? x.people[f.slice(7)] : x[f];
      }
    }
  }
  return { out, warnings: res.warnings, problems: window.__dashboard.state.cfg.problems, errors: window.__dashboard.state.errors };
}, expected);

let fail = 0; let pass = 0;
for (const [m, bus] of Object.entries(expected)) for (const [b, fields] of Object.entries(bus)) for (const [f, want] of Object.entries(fields)) {
  const got = actual.out[m][b][f];
  const ok = want == null ? got == null : got != null && Math.abs(got - want) < 0.01;
  if (ok) pass++; else { fail++; console.log(`FAIL ${m} ${b} ${f}: want ${want} got ${got}`); }
}
console.log('warnings:', JSON.stringify(actual.warnings, null, 1));
console.log('problems:', actual.problems, 'load errors:', actual.errors, 'page errors:', errors);
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
