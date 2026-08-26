# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repo holds two unrelated things:

1. **경조사 화환 자동 발송 앱** (`apps/api`, `apps/web`, `docs/`) — the main project. See
   [`README.md`](./README.md) for how to run it and [`docs/`](./docs) for the full design spec
   (architecture/DB, API, frontend wireframes, backend integration). Backend is NestJS + Prisma +
   PostgreSQL; frontend is Next.js 14 (App Router). SSO login and the Kakao 친구톡 vendor
   dispatch are both behind swappable adapter interfaces and currently run against dev-mode Mock
   implementations (`AUTH_MODE=mock`, `VENDOR_ADAPTER=mock`) since the real IdP/CPaaS aren't
   chosen yet — see the README's "아직 실제 연동이 필요한 부분" section before wiring up
   production credentials.
2. `pet_widget.py` / `run_pet_widget.bat` — an unrelated, standalone Windows-only desktop pet
   widget (stdlib-only: `tkinter` + `ctypes.windll`) that follows the system mouse cursor around
   the screen with a borderless, click-through, always-on-top transparent window. No pip
   dependencies. Run with `python pet_widget.py` (or double-click `run_pet_widget.bat`) on
   Windows; right-click the pet to quit. This container is headless Linux, so it can only be
   syntax-checked here (`python3 -m py_compile pet_widget.py`) — functional verification needs an
   actual Windows desktop session.

Update this file as the app's structure or tooling changes so future guidance stays accurate.

## Coding guidelines

- **BAT file encoding**: When creating `.bat` files that contain Korean (한글) text, be careful with character encoding. Windows batch files default to the system codepage (often CP949/EUC-KR on Korean Windows, not UTF-8), which can corrupt Korean text (mojibake) if the file is saved as UTF-8 without a matching `chcp` setting. Either save as CP949/ANSI to match the default codepage, or add `chcp 65001` at the top of the script and save the file as UTF-8 (without BOM) if UTF-8 is required — and verify it actually displays correctly in `cmd.exe`, not just in an editor.
- **Efficiency**: Always write efficient code — avoid unnecessary loops, redundant computation, or repeated I/O/network calls when a simpler or cached approach works.
- **No hardcoding**: Do not hardcode values that vary by environment or deployment (paths, credentials, hostnames, ports, magic constants). Use configuration, environment variables, or parameters instead.
- **Security**: Always consider security when writing code — validate/sanitize external input, avoid injection vulnerabilities (command, SQL, script), and never commit secrets or credentials.
