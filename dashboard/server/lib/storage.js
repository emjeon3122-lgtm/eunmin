// 자료 보관: DATA_DIR 아래에 JSON 파일로 저장한다.
//   input.json            입력용 엑셀에서 읽은 설정값
//   months/YYYY-MM.json   그 달의 계약·매출 / 미수금 자료와 확정 여부
//   audit.log             누가 언제 무엇을 바꿨는지(한 줄에 하나의 JSON)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isMonth, config } = require('./sanitize');

function createStorage(dataDir) {
  const monthsDir = path.join(dataDir, 'months');
  fs.mkdirSync(monthsDir, { recursive: true, mode: 0o700 });

  // 쓰는 도중 서버가 꺼져도 파일이 깨지지 않도록 임시 파일에 쓴 뒤 이름을 바꾼다.
  function writeJson(file, value) {
    const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
  }
  const monthFile = (m) => {
    if (!isMonth(m)) throw new Error('잘못된 월입니다.');
    return path.join(monthsDir, `${m}.json`);
  };

  let cache = null; // 읽기가 잦으므로 메모리에 한 벌 둔다(쓸 때마다 갱신)
  function load() {
    if (cache) return cache;
    const months = {};
    for (const f of fs.readdirSync(monthsDir)) {
      const m = f.replace(/\.json$/, '');
      if (f.endsWith('.json') && isMonth(m)) months[m] = readJson(path.join(monthsDir, f), null);
    }
    // 예전 버전이 저장한 설정(본부매핑 buMap 형식, 빠진 항목)도 지금 형식으로 맞춰 읽는다. 파일은 그대로 둔다.
    const input = readJson(path.join(dataDir, 'input.json'), null);
    cache = { input: input && input.cfg ? { ...input, cfg: config(input.cfg) } : input, months };
    return cache;
  }

  let version = 0; // 자료가 바뀔 때마다 1씩 늘어난다(응답 캐시를 비우는 기준)
  return {
    load,
    get version() { return version; },
    saveInput(input) { writeJson(path.join(dataDir, 'input.json'), input); load().input = input; version++; },
    saveMonth(m, rec) { writeJson(monthFile(m), rec); load().months[m] = rec; version++; },
    deleteMonth(m) { fs.rmSync(monthFile(m), { force: true }); delete load().months[m]; version++; },
    audit(event) {
      fs.appendFileSync(path.join(dataDir, 'audit.log'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 });
    },
  };
}

module.exports = { createStorage };
