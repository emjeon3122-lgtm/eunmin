"""src/ 와 vendor/ 를 하나의 HTML 파일(dist/실적대시보드.html)로 합친다.

인터넷 없이 더블클릭만으로 열리도록 모든 스크립트와 스타일을 파일 안에 넣는다.
사용법: python build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRIPTS = [
    ROOT / 'vendor' / 'chart.umd.min.js',
    ROOT / 'vendor' / 'chartjs-plugin-datalabels.min.js',
    ROOT / 'src' / 'xlsx-reader.js',
    ROOT / 'src' / 'model.js',
    ROOT / 'src' / 'store.js',
    ROOT / 'src' / 'app.js',
]
OUT = ROOT / 'dist' / '실적대시보드.html'


def inline_script(path: Path) -> str:
    # </script 가 코드 안에 있으면 HTML 이 끊기므로 이스케이프한다.
    code = path.read_text(encoding='utf-8').replace('</script', '<\\/script')
    return f'<script>\n/* {path.name} */\n{code}\n</script>'


def main() -> None:
    page = (ROOT / 'src' / 'index.html').read_text(encoding='utf-8')
    page = page.replace('/*@STYLES@*/', (ROOT / 'src' / 'styles.css').read_text(encoding='utf-8'))
    page = page.replace('<!--@SCRIPTS@-->', '\n'.join(inline_script(p) for p in SCRIPTS))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding='utf-8', newline='\n')
    print(f'built {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
