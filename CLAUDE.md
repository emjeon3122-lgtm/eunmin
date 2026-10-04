# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repo holds two unrelated things:

1. **경조사 화환 자동 발송 앱** (`apps/api`, `apps/web`, `docs/`) — the main project. See
   [`README.md`](./README.md) for how to run it and [`docs/`](./docs) for the full design spec
   (architecture/DB, API, frontend wireframes, backend integration). Backend is NestJS + Prisma +
   SQLite (single file at `apps/api/prisma/dev.db` — no DB server, no Docker; Prisma enums are
   unsupported on SQLite so they live in `apps/api/src/common/enums.ts` as const objects);
   frontend is Next.js 14 (App Router). Login is Microsoft 365 (Entra ID) via standard OIDC +
   PKCE (`apps/api/src/auth/oidc.service.ts`, `AUTH_MODE=oidc`); users are matched to the `users`
   table by company email on first login, then by `ssoSubjectId` (`oidc:<oid>`), and unknown
   accounts are rejected. The roster is maintained by admins via Excel round-trip at
   `/admin/users` (`admin-users.service.ts`: dry-run preview, all-or-nothing apply, never deletes);
   the very first admin is created with `node dist/scripts/create-admin.js`. Local dev uses `AUTH_MODE=mock` + employee-number dev login. Vendor
   dispatch is Solapi Kakao 알림톡 behind the `VendorAdapter` interface (`VENDOR_ADAPTER=mock`
   until real credentials are entered); delivery reports arrive at
   `/api/webhooks/solapi/<KAKAO_WEBHOOK_SECRET>`.

   **Production runs in Docker on the company's Synology NAS** (DS1019+, linux/amd64) behind a
   Cloudflare Tunnel — see [`deploy/README.md`](./deploy/README.md). `deploy/docker-compose.yml`
   runs `api` (internal only), `web` (the tunnel's single target, `http://web:3000`; it proxies
   `/api` to `api` via `next.config.js` rewrites, fixed at build time), and
   `cloudflared`. All persistent data (SQLite DB + uploads) lives under one mounted `DATA_DIR`.
   With `NODE_ENV=production` the API refuses to start on a weak `JWT_SECRET` or non-https
   `APP_BASE_URL`, and the employee-number dev login is off unless `ALLOW_DEV_LOGIN=true`.
   Uploaded files are never public: APIs that already checked access (own request detail,
   admin detail, florist token page) return short-lived HMAC-signed `/api/files/...` URLs
   (`storage/file-url.service.ts`); DB rows keep the bare `/uploads/<uuid>.<ext>` path.
   Local development still needs no Docker (`run_local_test.bat` / `npm run dev`).
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
