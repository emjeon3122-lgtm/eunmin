# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

- `pet_widget.py` — Windows-only desktop pet widget (stdlib-only: `tkinter` + `ctypes.windll`) that follows the system mouse cursor around the screen with a borderless, click-through, always-on-top transparent window. No pip dependencies.
- `run_pet_widget.bat` — launcher for `pet_widget.py`. Uses `chcp 65001` + BOM-less UTF-8 per the BAT encoding guideline below.

Run with: `python pet_widget.py` (or double-click `run_pet_widget.bat`) on Windows. Right-click the pet to quit. There is no build step, package manifest, or test suite yet — this container is headless Linux, so widget behavior can only be syntax-checked here (`python3 -m py_compile pet_widget.py`); functional verification requires an actual Windows desktop session. Update this file as more real code, structure, and tooling get added so future guidance stays accurate.

## Coding guidelines

- **BAT file encoding**: When creating `.bat` files that contain Korean (한글) text, be careful with character encoding. Windows batch files default to the system codepage (often CP949/EUC-KR on Korean Windows, not UTF-8), which can corrupt Korean text (mojibake) if the file is saved as UTF-8 without a matching `chcp` setting. Either save as CP949/ANSI to match the default codepage, or add `chcp 65001` at the top of the script and save the file as UTF-8 (without BOM) if UTF-8 is required — and verify it actually displays correctly in `cmd.exe`, not just in an editor.
- **Efficiency**: Always write efficient code — avoid unnecessary loops, redundant computation, or repeated I/O/network calls when a simpler or cached approach works.
- **No hardcoding**: Do not hardcode values that vary by environment or deployment (paths, credentials, hostnames, ports, magic constants). Use configuration, environment variables, or parameters instead.
- **Security**: Always consider security when writing code — validate/sanitize external input, avoid injection vulnerabilities (command, SQL, script), and never commit secrets or credentials.
