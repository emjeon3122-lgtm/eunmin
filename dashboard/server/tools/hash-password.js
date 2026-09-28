// 임시 관리자 비밀번호를 해시로 바꿔 출력한다. 출력값을 LOCAL_ADMIN_PASSWORD_HASH 에 넣는다.
// 사용법: node tools/hash-password.js   (비밀번호는 화면에 표시하지 않고 입력받는다)
'use strict';
const readline = require('node:readline');
const { hashPassword } = require('../lib/auth');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => { if (!rl.muted) rl.output.write(s); };
rl.question('새 비밀번호 (12자 이상): ', (pw) => {
  rl.output.write('\n');
  rl.close();
  if (pw.length < 12) { console.error('12자 이상으로 정해 주세요.'); process.exit(1); }
  console.log(hashPassword(pw));
});
rl.muted = true;
