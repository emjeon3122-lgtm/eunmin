// 자동 확정: 입력용 '설정' 시트의 '자동 확정일'(매월 N일)이 되면 지난달까지 확정되지 않은 달을 확정한다.
// - 계약·매출 자료가 있는 달만 확정한다(자료가 없으면 건너뛰고 다음 확인 때 다시 본다).
// - 관리자가 '확정 풀기'한 달(autoLockHold)은 자동으로 다시 확정하지 않는다(관리자가 직접 확정하면 해제).
'use strict';
const { effectiveMapping } = require('./mapping');

const BY = '자동 확정';

// 지금 시각 기준으로 자동 확정해야 하는 마지막 달(YYYY-MM): N일이 지났으면 지난달, 아니면 지지난달
function dueMonth(now, day) {
  const d = new Date(now.getFullYear(), now.getMonth() - (now.getDate() >= day ? 1 : 2), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function autoLock(storage, now = new Date()) {
  const { input, months } = storage.load();
  const day = input?.cfg?.autoLockDay;
  if (!day) return { upto: null, locked: [] };
  const upto = dueMonth(now, day);
  const locked = [];
  for (const [m, rec] of Object.entries(months)) {
    if (m > upto || !rec.contract || rec.locked || rec.autoLockHold) continue;
    storage.saveMonth(m, { ...rec, locked: true, mapping: effectiveMapping(input.cfg, m), updatedAt: now.toISOString(), by: BY });
    locked.push(m);
  }
  if (locked.length) storage.audit({ by: BY, action: 'lock', upto, locked });
  return { upto, locked };
}

function scheduleAutoLock({ storage, log, intervalMs = 30 * 60 * 1000 }) {
  const tick = () => {
    try {
      const { upto, locked } = autoLock(storage);
      if (locked.length) log(`자동 확정(${upto}까지): ${locked.join(', ')}`);
    } catch (e) {
      log(`자동 확정 실패: ${e.message}`);
    }
  };
  tick();
  setInterval(tick, intervalMs).unref();
}

module.exports = { dueMonth, autoLock, scheduleAutoLock };
