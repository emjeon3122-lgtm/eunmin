"""src/ 와 vendor/ 를 하나의 HTML 파일로 합친다.

- dist/실적대시보드.html   : PC에서 더블클릭으로 여는 버전(외부 접속 차단 CSP 포함)
- server/public/index.html : 회사 서버(NAS) 버전. CSP 는 서버가 요청마다 nonce 와 함께 보낸다.
버전은 dashboard/VERSION 파일 한 줄(예: 2026.10.01)이며 화면 아래와 서버 /healthz 에 표시된다.
사용법: python build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRIPTS = [
    ROOT / 'vendor' / 'chart.umd.min.js',
    ROOT / 'vendor' / 'chartjs-plugin-datalabels.min.js',
    ROOT / 'src' / 'xlsx-reader.js',
    ROOT / 'src' / 'org.js',
    ROOT / 'src' / 'model.js',
    ROOT / 'src' / 'store.js',
    ROOT / 'src' / 'app.js',
]
OUT = ROOT / 'dist' / '실적대시보드.html'
SERVER_OUT = ROOT / 'server' / 'public' / 'index.html'
VERSION = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
# PC 버전: 스크립트·스타일은 파일 안의 것만, 네트워크 접속은 모두 막는다.
LOCAL_CSP = ('<!-- 외부 접속을 모두 막는다: 스크립트·스타일은 이 파일 안에 있는 것만 실행된다. -->\n'
             '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; '
             'style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">')


def inline_script(path: Path) -> str:
    # </script 가 코드 안에 있으면 HTML 이 끊기므로 이스케이프한다.
    code = path.read_text(encoding='utf-8').replace('</script', '<\\/script')
    return f'<script>\n/* {path.name} */\n{code}\n</script>'


def render(csp: str, extra_script: str = '') -> str:
    page = (ROOT / 'src' / 'index.html').read_text(encoding='utf-8')
    page = page.replace('<!--@CSP@-->', csp)
    page = page.replace('/*@STYLES@*/', (ROOT / 'src' / 'styles.css').read_text(encoding='utf-8'))
    scripts = ([f'<script>\n{extra_script}\n</script>'] if extra_script else []) + [inline_script(p) for p in SCRIPTS]
    return page.replace('<!--@SCRIPTS@-->', '\n'.join(scripts))


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')
    print(f'built {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)')


def main() -> None:
    if not VERSION.replace('.', '').replace('-', '').isalnum():
        raise SystemExit(f'VERSION 형식 오류: {VERSION!r}')
    version = f"const DASHBOARD_VERSION = '{VERSION}';"
    write(OUT, render(LOCAL_CSP, version))
    write(SERVER_OUT, render('', f"{version}\nconst DASHBOARD_MODE = 'server';"))
    write(ROOT / 'server' / 'VERSION', VERSION + '\n')
    # 조직 이력 규칙은 화면과 서버가 같은 코드를 쓴다(서버 쪽은 사본).
    write(ROOT / 'server' / 'lib' / 'org.js', '// 자동 생성: dashboard/src/org.js 사본 — 이 파일을 직접 고치지 말 것 (python build.py)\n' + (ROOT / 'src' / 'org.js').read_text(encoding='utf-8'))


if __name__ == '__main__':
    main()
