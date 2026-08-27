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
  },
});
