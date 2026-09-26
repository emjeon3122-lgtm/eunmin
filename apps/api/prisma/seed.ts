import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { employeeNo: 'A0001' },
    update: {},
    create: {
      employeeNo: 'A0001',
      name: '총무팀 관리자',
      department: '총무팀',
      email: 'admin@bdo.kr',
      ssoSubjectId: `mock-sso-${randomUUID()}`,
      role: 'admin',
      isPartner: true,
    },
  });

  // 파트너 아님 — 신청 시 파트너 승인 증빙 첨부가 필요한 케이스를 테스트하기 위한 계정.
  const employee1 = await prisma.user.upsert({
    where: { employeeNo: 'E1001' },
    update: {},
    create: {
      employeeNo: 'E1001',
      name: '김철수',
      department: '경영지원팀',
      email: 'e1001@bdo.kr',
      ssoSubjectId: `mock-sso-${randomUUID()}`,
      role: 'employee',
      isPartner: false,
    },
  });

  // 파트너 — 증빙 없이 바로 신청 가능한 케이스를 테스트하기 위한 계정.
  const employee2 = await prisma.user.upsert({
    where: { employeeNo: 'E1002' },
    update: {},
    create: {
      employeeNo: 'E1002',
      name: '이영희',
      department: '영업팀',
      email: 'e1002@bdo.kr',
      ssoSubjectId: `mock-sso-${randomUUID()}`,
      role: 'employee',
      isPartner: true,
    },
  });

  let vendor = await prisma.vendor.findFirst({ where: { name: 'OO꽃집' } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        name: 'OO꽃집',
        channelType: 'kakao_alimtalk',
        contactPhone: '010-9876-5432',
        kakaoChannelId: 'mock-channel-id',
        isChannelFriendConfirmed: true,
        // 알림톡은 대행사(Solapi)가 발송 실패 시 자동으로 SMS 대체발송을 해주므로
        // 친구톡 때와 달리 관리자 수동 연락이 최후의 수단으로만 필요하다.
        fallbackChannel: 'sms',
        isActive: true,
      },
    });
  }

  const premiumProduct = await prisma.product.findFirst({
    where: { vendorId: vendor.id, name: '프리미엄 화환' },
  });
  if (!premiumProduct) {
    await prisma.product.create({
      data: {
        vendorId: vendor.id,
        name: '프리미엄 화환',
        price: 150000,
        description: '고급 생화로 구성된 3단 화환',
        isActive: true,
      },
    });
  }

  const standardProduct = await prisma.product.findFirst({
    where: { vendorId: vendor.id, name: '스탠다드 화환' },
  });
  if (!standardProduct) {
    await prisma.product.create({
      data: {
        vendorId: vendor.id,
        name: '스탠다드 화환',
        price: 90000,
        description: '기본형 2단 화환',
        isActive: true,
      },
    });
  }

  // docs/01-architecture-and-db.md section 2-1 example: 결혼(wedding) 300,000원 이상.
  // "all" is the catch-all example for occasions with no type-specific rule.
  // 참고: 신청 제출 시 실제 게이팅은 이제 User.isPartner 기준으로 바뀌었고, 이 테이블은
  // 더 이상 제출 흐름에서 조회되지 않는다 — 관리자 화면(예시 데이터)만 유지해둔 상태.
  const ruleDefs = [
    { occasionType: 'wedding' as const, minAmount: 300000, description: '결혼 300,000원 이상 사전승인 필요' },
    { occasionType: 'all' as const, minAmount: 1000000, description: '전 유형 공통 100만원 이상 사전승인 필요' },
  ];

  for (const rule of ruleDefs) {
    const existing = await prisma.approvalRule.findFirst({
      where: { occasionType: rule.occasionType, minAmount: rule.minAmount },
    });
    if (!existing) {
      await prisma.approvalRule.create({
        data: {
          occasionType: rule.occasionType,
          minAmount: rule.minAmount,
          isActive: true,
          description: rule.description,
        },
      });
    }
  }

  const ribbonDefs = [
    { occasionType: 'wedding' as const, phraseKo: '축 결혼', phraseHanja: '祝 結婚' },
    { occasionType: 'wedding' as const, phraseKo: '축 화혼', phraseHanja: '祝 華婚' },
    { occasionType: 'funeral' as const, phraseKo: '근조', phraseHanja: '謹弔' },
    { occasionType: 'funeral' as const, phraseKo: '추모', phraseHanja: '追慕' },
    { occasionType: 'opening' as const, phraseKo: '축 개업', phraseHanja: '祝 開業' },
    { occasionType: 'opening' as const, phraseKo: '축 발전', phraseHanja: '祝 發展' },
    { occasionType: 'promotion' as const, phraseKo: '축 승진', phraseHanja: '祝 昇進' },
  ];
  for (const t of ribbonDefs) {
    const existing = await prisma.ribbonTemplate.findFirst({
      where: { occasionType: t.occasionType, phraseKo: t.phraseKo },
    });
    if (!existing) {
      await prisma.ribbonTemplate.create({ data: { ...t, isActive: true } });
    }
  }

  console.log('시드 완료. 다음 사번으로 개발 로그인(POST /api/auth/dev-login)하세요:');
  console.log(`  ${admin.employeeNo}  role=${admin.role}  isPartner=${admin.isPartner}  (${admin.name})`);
  console.log(`  ${employee1.employeeNo}  role=${employee1.role}  isPartner=${employee1.isPartner}  (${employee1.name})`);
  console.log(`  ${employee2.employeeNo}  role=${employee2.role}  isPartner=${employee2.isPartner}  (${employee2.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
