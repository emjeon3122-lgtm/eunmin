import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedApiException } from '../common/exceptions/api.exception';
import { JwtPayload } from './jwt.types';

// Reads the JWT from either the Authorization: Bearer header or the httpOnly
// `token` cookie so the same guard works for API clients and the browser.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedApiException();
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedApiException('토큰이 유효하지 않거나 만료되었습니다.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedApiException();
    }

    (request as any).user = {
      id: user.id,
      employeeNo: user.employeeNo,
      name: user.name,
      department: user.department,
      email: user.email,
      role: user.role,
      isPartner: user.isPartner,
    };
    return true;
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length).trim();
    }
    const cookieToken = (request as any).cookies?.token;
    if (cookieToken) {
      return cookieToken;
    }
    return null;
  }
}
