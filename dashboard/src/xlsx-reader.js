// 최소 XLSX 리더 — 브라우저 내장 기능(DecompressionStream, DOMParser)만 사용한다.
// 외부 엑셀 라이브러리를 쓰지 않으므로 데이터가 PC 밖으로 나가지 않고, 알려진 라이브러리 취약점도 없다.
// 셀에 저장된 "마지막 계산 값"을 읽는다(수식은 다시 계산하지 않음).
const XlsxReader = (() => {
  const SIG_EOCD = 0x06054b50;
  const SIG_CEN = 0x02014b50;
  const SIG_LOC = 0x04034b50;
  const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
  const MAX_ENTRY_BYTES = 512 * 1024 * 1024; // 시트 하나를 푼 크기 한도(실제 파일은 수십 MB)
  const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function indexZip(buf) {
    const u8 = new Uint8Array(buf);
    if (OLE_MAGIC.every((b, i) => u8[i] === b)) {
      throw new Error('암호가 걸려 있거나 보안 레이블(DRM)이 적용된 파일, 또는 구버전(.xls) 파일은 읽을 수 없습니다. 엑셀에서 .xlsx로 다시 저장해 주세요.');
    }
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('엑셀(.xlsx) 파일이 아닙니다.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== SIG_CEN) throw new Error('파일이 손상되었습니다.');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      entries.set(dec.decode(u8.subarray(p + 46, p + 46 + nlen)), { method, csize, off });
      p += 46 + nlen + xlen + clen;
    }
    return { u8, dv, entries };
  }

  async function readEntry(zip, name) {
    const e = zip.entries.get(name);
    if (!e) return null;
    if (zip.dv.getUint32(e.off, true) !== SIG_LOC) throw new Error('파일이 손상되었습니다.');
    const start = e.off + 30 + zip.dv.getUint16(e.off + 26, true) + zip.dv.getUint16(e.off + 28, true);
    const raw = zip.u8.subarray(start, start + e.csize);
    if (e.method === 0) return new TextDecoder().decode(raw);
    if (e.method !== 8) throw new Error('지원하지 않는 압축 방식입니다.');
    // 압축을 풀면서 크기를 센다: 비정상적으로 큰 항목(압축 폭탄)은 끝까지 풀지 않고 멈춘다.
    const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const dec = new TextDecoder();
    let size = 0; let out = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ENTRY_BYTES) { await reader.cancel(); throw new Error('엑셀 파일 안의 내용이 너무 큽니다(손상되었거나 비정상 파일).'); }
      out += dec.decode(value, { stream: true });
    }
    return out + dec.decode();
  }

  const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
  const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));

  function colIndex(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  // 공유 문자열: 윗주(rPh) 안의 글자는 제외하고 이어 붙인다.
  function sharedStrings(doc) {
    return all(doc, 'si').map((si) => all(si, 't')
      .filter((t) => t.parentNode.localName !== 'rPh')
      .map((t) => t.textContent).join(''));
  }

  // 시트 XML 은 행·셀이 단순하게 반복되므로 DOMParser 대신 문자열을 직접 훑는다(큰 파일에서 몇 배 빠름).
  const MAX_ROWS = 1048576; const MAX_COLS = 16384; // 엑셀 한계. 이보다 큰 주소는 손상된 파일로 본다.
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decode = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => (e[0] === '#'
    ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e])));
  const ROW_RE = /<(?:[\w.-]+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?row>)/g;
  const CELL_RE = /<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;
  const V_RE = /<(?:[\w.-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?v>/;
  const T_RE = /<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g;
  const attr = (s, name) => { const m = s.match(name === 'r' ? /(?:^|\s)r="([^"]*)"/ : /(?:^|\s)t="([^"]*)"/); return m ? m[1] : null; };

  function parseSheet(text, strings) {
    const rows = [];
    let nextRow = 0;
    for (const rm of text.matchAll(ROW_RE)) {
      const ra = attr(rm[1], 'r');
      const r = ra ? Number(ra) - 1 : nextRow;
      if (!(r >= 0 && r < MAX_ROWS)) throw new Error('엑셀 행 번호가 올바르지 않습니다(손상된 파일).');
      nextRow = r + 1;
      const out = [];
      let next = 0;
      for (const cm of (rm[2] || '').matchAll(CELL_RE)) {
        const ref = attr(cm[1], 'r');
        const ci = ref ? colIndex(ref) : next;
        if (!(ci >= 0 && ci < MAX_COLS)) throw new Error('엑셀 열 주소가 올바르지 않습니다(손상된 파일).');
        next = ci + 1;
        const t = attr(cm[1], 't');
        const body = cm[2] || '';
        let val = null;
        if (t === 'inlineStr') val = [...body.matchAll(T_RE)].map((x) => decode(x[1])).join('');
        else {
          const v = body.match(V_RE);
          if (!v) val = null;
          else if (t === 's') val = strings[Number(v[1])] ?? null;
          else if (t === 'str' || t === 'd') val = decode(v[1]);
          else if (t === 'b') val = v[1] === '1';
          else if (t === 'e') val = null;
          else val = Number(v[1]);
        }
        if (val !== null && val !== '') out[ci] = val;
      }
      rows[r] = out;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
  }

  async function open(buf) {
    const zip = indexZip(buf);
    const wbText = await readEntry(zip, 'xl/workbook.xml');
    if (!wbText) throw new Error('엑셀 통합 문서 구조를 찾을 수 없습니다.');
    const wb = parseXml(wbText);
    const rels = parseXml(await readEntry(zip, 'xl/_rels/workbook.xml.rels'));
    const targets = new Map(all(rels, 'Relationship').map((r) => {
      let t = r.getAttribute('Target');
      t = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
      return [r.getAttribute('Id'), t];
    }));
    const sheets = all(wb, 'sheet').map((s) => ({
      name: s.getAttribute('name'),
      path: targets.get(s.getAttributeNS(REL_NS, 'id') || s.getAttribute('r:id')),
    }));
    const ssText = await readEntry(zip, 'xl/sharedStrings.xml');
    const strings = ssText ? sharedStrings(parseXml(ssText)) : [];
    const cache = new Map();
    return {
      sheetNames: sheets.map((s) => s.name),
      async rows(name) {
        if (cache.has(name)) return cache.get(name);
        const s = sheets.find((x) => x.name === name);
        const text = s && s.path ? await readEntry(zip, s.path) : null;
        const rows = text ? parseSheet(text, strings) : [];
        cache.set(name, rows);
        return rows;
      },
    };
  }

  return { open };
})();
