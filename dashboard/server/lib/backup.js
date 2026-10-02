// 백업: 서버에 저장된 모든 월 자료 + 입력용 설정을 파일 하나(JSON)로 만든다.
// 형식은 PC 버전의 마감자료와 같아서, 관리자가 '자료 올리기'로 이 파일을 올리면 그대로 복구된다.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const C_FIELDS = ['no', '사업부', '계약구분', '상태', '회사명', '보고서명', '체결일', '신규여부', '계약', '매출'];
const A_FIELDS = ['no', '사업부', '회사명', '금액'];

function buildBackup({ input, months }) {
  const out = {};
  const pack = (d, fields) => ({ fileName: d.fileName, sheetName: d.sheetName, asOf: d.asOf || null, noId: d.noId || 0,
    fields, rows: d.rows.map((r) => fields.map((f) => r[f] ?? null)), manual: d.manual || [] });
  for (const [m, rec] of Object.entries(months)) {
    out[m] = { locked: !!rec.locked };
    if (rec.contract) out[m].contract = { ...pack(rec.contract, C_FIELDS), ...(rec.mapping ? { mapping: rec.mapping } : {}) };
    if (rec.ar) out[m].ar = pack(rec.ar, A_FIELDS);
  }
  const keys = Object.keys(out).sort();
  return JSON.stringify({ type: '실적대시보드-마감자료', version: 1, kind: 'backup', createdAt: new Date().toISOString(),
    upto: keys[keys.length - 1] || null, months: out, input: input ? { fileName: input.fileName, cfg: input.cfg } : null });
}

// 매일 정해진 시각 이후 첫 확인 때 그날 백업을 한 번 만들고, 오래된 백업은 지운다.
function scheduleBackups({ dir, hour, keepDays, load, log }) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tick = () => {
    try {
      const now = new Date();
      if (now.getHours() < hour) return;
      const day = now.toISOString().slice(0, 10).replace(/-/g, '');
      const file = path.join(dir, `dashboard-backup-${day}.json`);
      if (fs.existsSync(file)) return;
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, buildBackup(load()), { mode: 0o600 });
      fs.renameSync(tmp, file);
      const cutoff = Date.now() - keepDays * 86400000;
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (/^dashboard-backup-\d{8}\.json$/.test(f) && fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full);
      }
      log(`백업 완료: ${file}`);
    } catch (e) {
      log(`백업 실패: ${e.message}`);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000).unref();
}

module.exports = { buildBackup, scheduleBackups };
