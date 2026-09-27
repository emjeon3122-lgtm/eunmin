# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

- `pet_widget.py` — Windows-only desktop pet widget (stdlib-only: `tkinter` + `ctypes.windll`) that follows the system mouse cursor around the screen with a borderless, click-through, always-on-top transparent window. No pip dependencies.
- `run_pet_widget.bat` — launcher for `pet_widget.py`. Uses `chcp 65001` + BOM-less UTF-8 per the BAT encoding guideline below.
- `dashboard/` — 실적 대시보드: a single-file offline HTML app (Korean UI) that reads ERP contract/revenue Excel exports plus an `입력용.xlsx` input workbook in the browser and renders per-본부 KPIs, month-over-month contract diffs, a 데이터요약 table and validation checks. See `dashboard/README.md` for file-detection rules and the calculation spec.
  - Source in `dashboard/src/` (`xlsx-reader.js` dependency-free xlsx parser, `model.js` aggregation, `store.js` opt-in IndexedDB persistence of uploaded files, `app.js` UI, `styles.css`); vendored Chart.js + datalabels in `dashboard/vendor/`.
  - Build: `python3 dashboard/build.py` → `dashboard/dist/실적대시보드.html` (commit the rebuilt dist file with source changes).
  - Verify: `NODE_PATH=/opt/node22/lib/node_modules node dashboard/tests/verify.mjs <expected.json> <xlsx...>` (Playwright/Chromium). Playwright's file chooser fails on non-ASCII paths, so copy test workbooks to ASCII names first.
  - Real business data (xlsx/csv/expected json) must never be committed — `.gitignore` blocks them under `dashboard/`. Excel-sourced strings go into the DOM via `textContent` only, and CSV export escapes formula-leading characters.

Run with: `python pet_widget.py` (or double-click `run_pet_widget.bat`) on Windows. Right-click the pet to quit. There is no build step, package manifest, or test suite yet — this container is headless Linux, so widget behavior can only be syntax-checked here (`python3 -m py_compile pet_widget.py`); functional verification requires an actual Windows desktop session. Update this file as more real code, structure, and tooling get added so future guidance stays accurate.

## Coding guidelines

- **BAT file encoding**: When creating `.bat` files that contain Korean (한글) text, be careful with character encoding. Windows batch files default to the system codepage (often CP949/EUC-KR on Korean Windows, not UTF-8), which can corrupt Korean text (mojibake) if the file is saved as UTF-8 without a matching `chcp` setting. Either save as CP949/ANSI to match the default codepage, or add `chcp 65001` at the top of the script and save the file as UTF-8 (without BOM) if UTF-8 is required — and verify it actually displays correctly in `cmd.exe`, not just in an editor.
- **Efficiency**: Always write efficient code — avoid unnecessary loops, redundant computation, or repeated I/O/network calls when a simpler or cached approach works.
- **No hardcoding**: Do not hardcode values that vary by environment or deployment (paths, credentials, hostnames, ports, magic constants). Use configuration, environment variables, or parameters instead.
- **Security**: Always consider security when writing code — validate/sanitize external input, avoid injection vulnerabilities (command, SQL, script), and never commit secrets or credentials.
