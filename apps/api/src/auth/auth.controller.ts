import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AppConfig } from '../config/configuration';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './jwt.types';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { DevLoginDto } from './dto/dev-login.dto';
import { OidcService, OidcTransaction } from './oidc.service';
import { IntegrationSettingsService } from '../settings/integration-settings.service';
import { LocalLoginDto } from './dto/local-login.dto';
import { ApiException, UnauthorizedApiException } from '../common/exceptions/api.exception';
import { HttpStatus } from '@nestjs/common';

// web(Next.js) 프록시를 거쳐 오면 req.ip 가 늘 127.0.0.1 이라 전달된 원래 주소를 먼저 본다.
function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}

// 임시 관리자 로그인 실패 제한 — 주소별(빠른 재시도 차단)과 계정 전체(주소를 바꿔 가며 시도 차단).
const PER_CLIENT_LIMIT = { maxFailures: 5, windowMs: 60_000, lockMs: 60_000 };
const ACCOUNT_LIMIT = { maxFailures: 20, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const MAX_TRACKED_CLIENTS = 1000;

interface FailureRecord {
  count: number;
  since: number;
  until: number;
}

function isLocked(f: FailureRecord | undefined): boolean {
  return !!f && f.until > Date.now();
}

// 정해진 시간(windowMs) 안에 maxFailures번 틀리면 lockMs 동안 막는다.
function countFailure(
  prev: FailureRecord | undefined,
  limit: { maxFailures: number; windowMs: number; lockMs: number },
): FailureRecord {
  const now = Date.now();
  const f = !prev || now - prev.since > limit.windowMs ? { count: 0, since: now, until: prev?.until ?? 0 } : { ...prev };
  f.count += 1;
  if (f.count >= limit.maxFailures) {
    f.until = now + limit.lockMs;
    f.count = 0;
    f.since = now;
  }
  return f;
}

const COOKIE_NAME = 'token';
const OIDC_TX_COOKIE = 'oidc_tx';
const OIDC_COOKIE_PATH = '/api/auth/oidc';
const DEFAULT_NEXT = '/requests';

// 로그인 뒤 돌아갈 화면은 우리 사이트 안의 경로만 허용한다(외부 주소로 보내는 피싱 악용 방지).
function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : DEFAULT_NEXT;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly secureCookie: boolean;
  private readonly appBaseUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
    private readonly configService: ConfigService,
    private readonly settings: IntegrationSettingsService,
  ) {
    this.secureCookie = this.configService.get<AppConfig['isProduction']>('app.isProduction')!;
    this.appBaseUrl = this.configService.get<AppConfig['appBaseUrl']>('app.appBaseUrl')!;
  }

  // 로그인 방식은 관리자 화면에서 바꿀 수 있어 요청마다 현재 설정을 읽는다.
  private get authMode(): AppConfig['authMode'] {
    return this.settings.get().auth.mode;
  }

  private get devLoginEnabled(): boolean {
    return this.settings.devLoginEnabled();
  }

  // 로그인 화면이 어떤 방식(Microsoft 365 / 개발용 사번 / 없음)을 보여줄지 정한다.
  // localLogin 은 임시 관리자(아이디+비밀번호) 로그인이 열려 있는지 — 방식과 별개로 함께 보여 준다.
  @Get('config')
  config() {
    const loginMethod = this.authMode === 'oidc' ? 'oidc' : this.devLoginEnabled ? 'dev' : 'none';
    return { loginMethod, localLogin: this.settings.localLoginEnabled() };
  }

  // 임시 관리자(아이디+비밀번호) 로그인 — SSO 연동 전까지만 쓰고 관리자 화면에서 지운다.
  // 무차별 대입을 늦추려고 같은 주소에서 5번 틀리면 1분간 막는다. 주소(X-Forwarded-For)는
  // 요청하는 쪽이 꾸며낼 수 있으므로, 주소와 상관없이 계정 전체로도 15분에 20번 틀리면 15분간 막는다.
  @Post('local-login')
  async localLogin(@Body() dto: LocalLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!this.settings.localLoginEnabled()) {
      throw new NotFoundException();
    }
    const key = clientKey(req);
    if (isLocked(this.failures.get(key)) || isLocked(this.accountFailures)) {
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ATTEMPTS', '로그인 시도가 너무 많습니다. 잠시 뒤 다시 시도하세요.');
    }
    const result = await this.authService.localLogin(dto.id.trim(), dto.password);
    if (!result) {
      this.recordClientFailure(key);
      this.accountFailures = countFailure(this.accountFailures, ACCOUNT_LIMIT);
      this.logger.warn(`임시 관리자 로그인 실패 (${key})`);
      throw new UnauthorizedApiException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    this.failures.delete(key);
    this.logger.log(`임시 관리자 로그인: ${dto.id.trim()} (${key})`);
    this.setCookie(res, result.token);
    return { token: result.token };
  }

  // 주소별 실패 기록과, 주소와 무관한 계정 전체 실패 기록(정리 대상이 아니라 따로 둔다).
  private readonly failures = new Map<string, FailureRecord>();
  private accountFailures: FailureRecord | undefined;

  private recordClientFailure(key: string) {
    // 꾸며낸 주소로 기록을 무한히 늘리지 못하게, 많이 쌓이면 끝난 기록부터 정리한다.
    if (this.failures.size >= MAX_TRACKED_CLIENTS) {
      const now = Date.now();
      for (const [k, v] of this.failures) {
        if (v.until <= now && now - v.since > PER_CLIENT_LIMIT.windowMs) this.failures.delete(k);
      }
      if (this.failures.size >= MAX_TRACKED_CLIENTS) this.failures.clear();
    }
    this.failures.set(key, countFailure(this.failures.get(key), PER_CLIENT_LIMIT));
  }

  // 사번만으로 로그인하는 개발용 경로 — 운영에서는 ALLOW_DEV_LOGIN=true가 아니면 404.
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto, @Res({ passthrough: true }) res: Response) {
    if (!this.devLoginEnabled) {
      throw new NotFoundException();
    }
    const { token } = await this.authService.devLogin(dto.employeeNo);
    this.setCookie(res, token);
    return { token };
  }

  // Microsoft 365 로그인 시작 — 1회용 검증값을 쿠키에 담고 Microsoft 로그인 화면으로 보낸다.
  @Get('oidc/login')
  async oidcLogin(@Query('next') next: string | undefined, @Res() res: Response) {
    if (this.authMode !== 'oidc') {
      throw new NotFoundException();
    }
    let started;
    try {
      started = await this.oidcService.startLogin(safeNext(next));
    } catch {
      // 공급자 정보를 못 가져온 경우(네트워크·설정 오류) — 오류 화면 대신 로그인 화면에 안내한다.
      return this.redirectToLogin(res, 'unavailable');
    }
    const { url, transaction } = started;
    res.cookie(OIDC_TX_COOKIE, transaction, {
      httpOnly: true,
      // Microsoft에서 돌아오는 이동(다른 사이트 → 우리 사이트 GET)에도 쿠키가 실리려면 lax여야 한다.
      sameSite: 'lax',
      secure: this.secureCookie,
      path: OIDC_COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(url);
  }

  // Microsoft 로그인 후 복귀 — 검증이 끝나면 로그인 토큰을 주소의 # 뒤에 실어 화면으로 보낸다.
  // (# 뒤 값은 서버 로그나 프록시에 남지 않고 브라우저 안에서만 읽힌다.)
  @Get('oidc/callback')
  async oidcCallback(@Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    if (this.authMode !== 'oidc') {
      throw new NotFoundException();
    }
    const transaction = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[OIDC_TX_COOKIE] as
      | OidcTransaction
      | undefined;
    res.clearCookie(OIDC_TX_COOKIE, { path: OIDC_COOKIE_PATH });

    if (query.error) {
      this.logger.warn(`Microsoft 로그인이 취소되었거나 거부되었습니다: ${query.error} ${query.error_description ?? ''}`);
      return this.redirectToLogin(res, 'cancelled');
    }
    if (!transaction || typeof transaction !== 'object' || typeof transaction.state !== 'string') {
      return this.redirectToLogin(res, 'expired');
    }

    let identity;
    try {
      identity = await this.oidcService.completeLogin(query, transaction);
    } catch (err) {
      this.logger.warn(`Microsoft 로그인 검증 실패: ${(err as Error).message}`);
      return this.redirectToLogin(res, 'failed');
    }

    const result = await this.authService.loginWithOidc(identity);
    if (!result) {
      this.logger.warn(`직원 명단에 없는 계정의 로그인 시도: ${identity.email}`);
      return this.redirectToLogin(res, 'not_registered');
    }
    this.setCookie(res, result.token);
    const fragment = new URLSearchParams({ token: result.token, next: safeNext(transaction.next) });
    res.redirect(`${this.appBaseUrl}/auth/callback#${fragment.toString()}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private redirectToLogin(res: Response, error: string) {
    res.redirect(`${this.appBaseUrl}/login?error=${error}`);
  }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secureCookie,
      maxAge: 8 * 60 * 60 * 1000,
    });
  }
}
