// 세션 쿠키: 로그아웃한 세션은 서버를 다시 켜도(새 createSessions) 계속 막히는지 확인. node tests/sessions.cjs
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createSessions } = require('../lib/auth');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-sessions-'));
try {
  const secret = crypto.randomBytes(48).toString('base64');
  const file = path.join(dir, 'revoked-sessions.json');
  const a = createSessions(8, secret, { revokedFile: file });
  const keep = a.create('a@test.local', 'A'); const gone = a.create('b@test.local', 'B');
  a.destroy(gone);
  assert.equal(a.get(gone), null, '로그아웃한 세션은 막힘');
  const b = createSessions(8, secret, { revokedFile: file }); // 서버 재시작
  assert.equal(b.get(gone), null, '재시작 후에도 로그아웃한 세션은 막힘');
  assert.equal(b.get(keep).email, 'a@test.local', '로그아웃하지 않은 세션은 유지');
  assert.equal((fs.statSync(file).mode & 0o777), 0o600, '폐기 목록 파일 권한 0600');
  console.log('PASS');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
