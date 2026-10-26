import { Injectable, Logger } from '@nestjs/common';
import { BaseClient, Issuer, generators } from 'openid-client';
import { AppConfig } from '../config/configuration';
import { IntegrationSettingsService } from '../settings/integration-settings.service';

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
// 관리자 화면에서 값을 바꾸면(IntegrationSettingsService) 재시작 없이 다음 로그인부터 새 값을 쓴다.
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private clientPromise: Promise<BaseClient> | null = null;

  constructor(private readonly settings: IntegrationSettingsService) {
    // 설정이 바뀌면 캐시한 공급자 정보·클라이언트를 버리고 다음 요청에서 다시 만든다.
    this.settings.onChange(() => {
      this.clientPromise = null;
    });
  }

  // 항상 현재 저장된 값을 읽는다(.env 기본값 또는 관리자가 저장한 값).
  private get config(): AppConfig['oidc'] {
    const auth = this.settings.get().auth;
    return {
      issuer: auth.oidcIssuer,
      clientId: auth.oidcClientId,
      clientSecret: auth.oidcClientSecret,
      redirectUri: auth.oidcRedirectUri,
    };
  }

  // 관리자 화면의 [연결 확인] — 발급자 정보를 새로 받아와 주소가 맞는지 본다(로그인은 하지 않는다).
  async checkConnection(): Promise<{ issuer: string; authorizationEndpoint: string }> {
    const { issuer, clientId } = this.config;
    if (!issuer) throw new Error('발급자(Issuer) 주소가 비어 있습니다.');
    if (!clientId) throw new Error('클라이언트 ID 가 비어 있습니다.');
    const found = await Issuer.discover(issuer);
    const authorizationEndpoint = String(found.metadata.authorization_endpoint ?? '');
    if (!authorizationEndpoint) throw new Error('공급자 정보에 로그인 주소가 없습니다.');
    return { issuer: String(found.metadata.issuer ?? issuer), authorizationEndpoint };
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
