import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseClient, Issuer, generators } from 'openid-client';
import { AppConfig } from '../config/configuration';

// 로그인 시작~복귀 사이에 브라우저 쿠키로 들고 다니는 1회용 값. state는 다른 사람이 만든
// 로그인 응답을 끼워 넣는 공격(CSRF)을, nonce는 토큰 재사용을, code_verifier(PKCE)는
// 중간에 가로챈 인가 코드의 사용을 막는다.
export interface OidcTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  next: string;
}

export interface OidcIdentity {
  subject: string; // Entra의 oid(테넌트 안에서 사람마다 고정) — 없으면 sub
  email: string; // 소문자로 정규화
}

// Microsoft 365(Entra ID)를 포함한 표준 OIDC 공급자 로그인. 발급자(issuer)·클라이언트
// 값은 전산 담당자가 OIDC_* 환경변수로 넣는다 — Entra라면
// OIDC_ISSUER=https://login.microsoftonline.com/<테넌트 ID>/v2.0
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly config: AppConfig['oidc'];
  private clientPromise: Promise<BaseClient> | null = null;

  constructor(configService: ConfigService) {
    this.config = configService.get<AppConfig['oidc']>('app.oidc')!;
  }

  async startLogin(next: string): Promise<{ url: string; transaction: OidcTransaction }> {
    const client = await this.client();
    const transaction: OidcTransaction = {
      state: generators.state(),
      nonce: generators.nonce(),
      codeVerifier: generators.codeVerifier(),
      next,
    };
    const url = client.authorizationUrl({
      scope: 'openid profile email',
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: generators.codeChallenge(transaction.codeVerifier),
      code_challenge_method: 'S256',
      // 브라우저에 여러 Microsoft 계정이 로그인돼 있으면 회사 계정을 고르게 한다.
      prompt: 'select_account',
    });
    return { url, transaction };
  }

  // 인가 코드를 토큰으로 바꾸고 ID 토큰의 서명·발급자·대상·만료·nonce를 검증한다
  // (openid-client가 공급자의 공개키로 확인). 실패하면 예외를 던진다.
  async completeLogin(query: Record<string, string>, transaction: OidcTransaction): Promise<OidcIdentity> {
    const client = await this.client();
    const params = client.callbackParams(`/?${new URLSearchParams(query).toString()}`);
    const tokenSet = await client.callback(this.config.redirectUri, params, {
      state: transaction.state,
      nonce: transaction.nonce,
      code_verifier: transaction.codeVerifier,
    });
    const claims = tokenSet.claims();
    const subject = typeof claims.oid === 'string' ? claims.oid : claims.sub;
    // Entra는 email 클레임을 생략하기도 해서, 로그인 ID(preferred_username, 보통 회사 메일)를 대신 쓴다.
    const rawEmail = claims.email ?? claims.preferred_username;
    if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
      throw new Error('ID 토큰에 이메일이 없습니다.');
    }
    return { subject: `oidc:${subject}`, email: rawEmail.trim().toLowerCase() };
  }

  private client(): Promise<BaseClient> {
    if (!this.clientPromise) {
      this.clientPromise = Issuer.discover(this.config.issuer)
        .then(
          (issuer) =>
            new issuer.Client({
              client_id: this.config.clientId,
              client_secret: this.config.clientSecret,
              redirect_uris: [this.config.redirectUri],
              response_types: ['code'],
            }),
        )
        .catch((err) => {
          // 일시적인 네트워크 오류로 영구 실패 상태가 되지 않게 다음 요청에서 다시 시도한다.
          this.clientPromise = null;
          this.logger.error(`OIDC 공급자 정보를 가져오지 못했습니다 (${this.config.issuer})`, err);
          throw err;
        });
    }
    return this.clientPromise;
  }
}
