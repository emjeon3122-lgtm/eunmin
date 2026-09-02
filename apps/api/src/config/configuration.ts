// Central typed config loader for @nestjs/config — keeps env var names in one place.
export interface AppConfig {
  databaseUrl: string;
  port: number;
  appBaseUrl: string;
  corsOrigin: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  authMode: 'mock' | 'oidc';
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  vendorAdapter: 'mock' | 'kakao';
  kakao: {
    apiKey: string;
    senderKey: string;
    apiBaseUrl: string;
    templateId: string;
    webhookSecret: string;
  };
  storageDriver: 'local';
  storageLocalDir: string;
  // 청첩장/부고장 자동 채우기 — 'mock'이면 외부로 아무것도 보내지 않고 빈 결과를
  // 반환한다(기본값). 'claude'로 바꾸면 Claude 비전 모델로 실제 추출을 수행한다.
  invitationParser: 'mock' | 'claude';
  anthropic: {
    apiKey: string;
    model: string;
  };
}

export default (): { app: AppConfig } => ({
  app: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    port: parseInt(process.env.PORT ?? '4000', 10),
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    corsOrigin: process.env.CORS_ORIGIN ?? process.env.APP_BASE_URL ?? 'http://localhost:3000',
    jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    authMode: (process.env.AUTH_MODE as 'mock' | 'oidc') ?? 'mock',
    oidc: {
      issuer: process.env.OIDC_ISSUER ?? '',
      clientId: process.env.OIDC_CLIENT_ID ?? '',
      clientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
      redirectUri: process.env.OIDC_REDIRECT_URI ?? '',
    },
    vendorAdapter: (process.env.VENDOR_ADAPTER as 'mock' | 'kakao') ?? 'mock',
    kakao: {
      apiKey: process.env.KAKAO_CPAAS_API_KEY ?? '',
      senderKey: process.env.KAKAO_CPAAS_SENDER_KEY ?? '',
      apiBaseUrl: process.env.KAKAO_CPAAS_API_BASE_URL ?? '',
      templateId: process.env.KAKAO_CPAAS_TEMPLATE_ID ?? '',
      webhookSecret: process.env.KAKAO_WEBHOOK_SECRET ?? 'change-me',
    },
    storageDriver: (process.env.STORAGE_DRIVER as 'local') ?? 'local',
    storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? './uploads',
    invitationParser: (process.env.INVITATION_PARSER as 'mock' | 'claude') ?? 'mock',
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
    },
  },
});
