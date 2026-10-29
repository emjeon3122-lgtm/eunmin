// 첫 관리자 등록용 명령 — 운영 서버에 관리자가 아무도 없을 때(직원 명단을 올릴 사람이
// 없을 때) 한 번 쓴다. 같은 사번이 있으면 관리자로 바꾸고, 없으면 새로 만든다.
//
//   docker compose exec api node dist/scripts/create-admin.js <사번> <이름> <부서> <회사 이메일>
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

async function main() {
  const [employeeNo, name, department, rawEmail] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!employeeNo || !name || !department || !email) {
    console.error('사용법: node dist/scripts/create-admin.js <사번> <이름> <부서> <회사 이메일>');
    process.exit(1);
  }
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(employeeNo) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('사번(영문·숫자·-·_) 또는 회사 이메일 형식이 올바르지 않습니다.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const emailOwner = await prisma.user.findUnique({ where: { email } });
    if (emailOwner && emailOwner.employeeNo !== employeeNo) {
      console.error(`회사 이메일 ${email}은(는) 이미 사번 ${emailOwner.employeeNo}이(가) 쓰고 있습니다.`);
      process.exit(1);
    }
    const user = await prisma.user.upsert({
      where: { employeeNo },
      update: { name, department, email, role: 'admin' },
      create: { employeeNo, name, department, email, role: 'admin', ssoSubjectId: `pending:${randomUUID()}` },
    });
    console.log(`관리자 등록 완료: ${user.employeeNo} ${user.name} (${user.email})`);
    console.log('이 회사 이메일의 Microsoft 365 계정으로 로그인하면 관리자 화면을 쓸 수 있습니다.');
  } finally {
    await prisma.$disconnect();
  }
}

main();
