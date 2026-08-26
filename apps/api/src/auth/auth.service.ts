import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // AUTH_MODE=mock login path: look up a seeded user by employeeNo and issue a JWT.
  // Real SSO (OIDC) would exchange an authorization code for an identity here instead —
  // see docs/01-architecture-and-db.md section 3-1 for the still-unconfirmed IdP choice.
  async devLogin(employeeNo: string): Promise<{ token: string; user: JwtPayload }> {
    const user = await this.prisma.user.findUnique({ where: { employeeNo } });
    if (!user) {
      throw new NotFoundException(`사번 '${employeeNo}'에 해당하는 사용자를 찾을 수 없습니다.`);
    }
    const payload: JwtPayload = { sub: user.id, employeeNo: user.employeeNo, role: user.role };
    const token = this.jwtService.sign(payload);
    return { token, user: payload };
  }
}
