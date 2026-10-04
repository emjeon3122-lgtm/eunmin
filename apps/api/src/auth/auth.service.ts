import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.types';
import { Role, assertEnum } from '../common/enums';
import { OidcIdentity } from './oidc.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // 사번만으로 로그인하는 개발용 경로(AUTH_MODE=mock). 운영에서는 ALLOW_DEV_LOGIN일 때만 열린다.
  async devLogin(employeeNo: string): Promise<{ token: string; user: JwtPayload }> {
    const user = await this.prisma.user.findUnique({ where: { employeeNo } });
    if (!user) {
      throw new NotFoundException(`사번 '${employeeNo}'에 해당하는 사용자를 찾을 수 없습니다.`);
    }
    return this.issue(user);
  }

  // Microsoft 365 로그인 결과를 직원 명단과 연결한다. 회사 계정이 있어도 명단(users)에
  // 없는 사람은 들어올 수 없다(null). 처음 로그인할 때는 명단의 회사 이메일로 찾아
  // Microsoft 계정 고유값을 기록해 두고, 이후로는 그 값으로 찾는다.
  async loginWithOidc(identity: OidcIdentity): Promise<{ token: string; user: JwtPayload } | null> {
    const linked = await this.prisma.user.findUnique({ where: { ssoSubjectId: identity.subject } });
    if (linked) return this.issue(linked);

    const byEmail = await this.prisma.user.findUnique({ where: { email: identity.email } });
    if (!byEmail) return null;
    if (byEmail.ssoSubjectId.startsWith('oidc:')) {
      // 같은 메일의 계정이 다시 만들어진 경우 등 — 회사 테넌트 발급자만 신뢰하므로 새 값으로 갱신한다.
      this.logger.warn(`${identity.email}의 Microsoft 계정 연결을 새 값으로 갱신합니다.`);
    }
    const user = await this.prisma.user.update({
      where: { id: byEmail.id },
      data: { ssoSubjectId: identity.subject },
    });
    return this.issue(user);
  }

  private issue(user: User): { token: string; user: JwtPayload } {
    const payload: JwtPayload = {
      sub: user.id,
      employeeNo: user.employeeNo,
      role: assertEnum(Role, user.role, 'user.role'),
    };
    return { token: this.jwtService.sign(payload), user: payload };
  }
}
