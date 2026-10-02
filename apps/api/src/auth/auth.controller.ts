import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AppConfig } from '../config/configuration';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './jwt.types';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { DevLoginDto } from './dto/dev-login.dto';
import { SsoCallbackDto } from './dto/sso-callback.dto';

const COOKIE_NAME = 'token';

@Controller('auth')
export class AuthController {
  private readonly authMode: AppConfig['authMode'];

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.authMode = this.configService.get<AppConfig['authMode']>('app.authMode')!;
  }

  // Only registered behavior when AUTH_MODE=mock; real deployments should not
  // expose an employeeNo-only login. Module-level gating is done via env check
  // in AuthModule so this stays a no-op 404 under AUTH_MODE=oidc.
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto, @Res({ passthrough: true }) res: Response) {
    if (this.authMode !== 'mock') {
      throw new NotFoundException();
    }
    const { token } = await this.authService.devLogin(dto.employeeNo);
    this.setCookie(res, token);
    return { token };
  }

  // Real IdP integration point: exchange `code` for tokens via OIDC_* config,
  // resolve/create the User by sso_subject_id, then sign our own JWT.
  // Until OIDC_* is configured (AUTH_MODE=oidc), this stub throws; under
  // AUTH_MODE=mock it proxies dev-login with `code` treated as the employeeNo,
  // so the frontend can use one consistent call in both modes.
  @Post('sso/callback')
  async ssoCallback(@Body() dto: SsoCallbackDto, @Res({ passthrough: true }) res: Response) {
    if (this.authMode === 'mock') {
      const { token } = await this.authService.devLogin(dto.code);
      this.setCookie(res, token);
      return { token };
    }
    // TODO: implement real OIDC authorization-code exchange once an IdP is chosen
    // (docs/01-architecture-and-db.md section 3-1) — read OIDC_ISSUER/CLIENT_ID/
    // CLIENT_SECRET/REDIRECT_URI from config here.
    throw new NotFoundException('OIDC 연동이 아직 구성되지 않았습니다.');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });
  }
}
