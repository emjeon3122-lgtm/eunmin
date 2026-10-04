import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 컨테이너 헬스체크와 운영 상태 확인용 — 로그인 없이 열리지만 상태값 외에는 아무것도
// 돌려주지 않는다. DB까지 실제로 조회해야 "프로세스는 떴는데 DB가 안 열린" 상태를 잡는다.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('DB에 연결할 수 없습니다.');
    }
    return { status: 'ok' };
  }
}
