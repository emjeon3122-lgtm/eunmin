// 최소 XLSX 리더 — 브라우저 내장 기능(DecompressionStream, DOMParser)만 사용한다.
// 외부 엑셀 라이브러리를 쓰지 않으므로 데이터가 PC 밖으로 나가지 않고, 알려진 라이브러리 취약점도 없다.
// 셀에 저장된 "마지막 계산 값"을 읽는다(수식은 다시 계산하지 않음).
const XlsxReader = (() => {
  const SIG_EOCD = 0x06054b50;
  const SIG_CEN = 0x02014b50;
  const SIG_LOC = 0x04034b50;
  const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
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
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
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

  function parseSheet(doc, strings) {
    const rows = [];
    for (const row of all(doc, 'row')) {
      const r = Number(row.getAttribute('r')) - 1;
      const out = [];
      let next = 0;
      for (const c of all(row, 'c')) {
        const ref = c.getAttribute('r');
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const t = c.getAttribute('t');
        const v = all(c, 'v')[0];
        let val = null;
        if (t === 'inlineStr') val = all(c, 't').map((x) => x.textContent).join('');
        else if (!v) val = null;
        else if (t === 's') val = strings[Number(v.textContent)] ?? null;
        else if (t === 'str' || t === 'd') val = v.textContent;
        else if (t === 'b') val = v.textContent === '1';
        else if (t === 'e') val = null;
        else val = Number(v.textContent);
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
        const rows = text ? parseSheet(parseXml(text), strings) : [];
        cache.set(name, rows);
        return rows;
      },
    };
  }

  return { open };
})();
