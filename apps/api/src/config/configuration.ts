// Central typed config loader for @nestjs/config — keeps env var names in one place.
export interface AppConfig {
  isProduction: boolean;
  databaseUrl: string;
  port: number;
  appBaseUrl: string;
  corsOrigin: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  authMode: 'mock' | 'oidc';
  // 사번만으로 로그인하는 개발용 로그인. 운영(NODE_ENV=production)에서는 인터넷에 그대로
  // 노출되면 아무 사번으로나 들어올 수 있으므로 ALLOW_DEV_LOGIN=true로 명시해야만 켜진다.
  devLoginEnabled: boolean;
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  vendorAdapter: 'mock' | 'kakao';
  kakao: {
    apiKey: string;
    apiSecret: string;
    senderKey: string;
    senderPhone: string;
    apiBaseUrl: string;
    templateId: string;
    webhookSecret: string;
  };
  storageDriver: 'local';
  storageLocalDir: string;
  // 업로드 파일 서명 주소의 유효 시간(초). 화면을 열어둔 채 이보다 오래 지나면 새로고침 필요.
  fileUrlTtlSeconds: number;
  // 청첩장/부고장 자동 채우기 — 'mock'이면 외부로 아무것도 보내지 않고 빈 결과를
  // 반환한다(기본값). 'claude'로 바꾸면 Claude 비전 모델로 실제 추출을 수행한다.
  invitationParser: 'mock' | 'claude';
  anthropic: {
    apiKey: string;
    model: string;
  };
}

const DEFAULT_JWT_SECRET = 'change-me-in-production';

export default (): { app: AppConfig } => {
  const isProduction = process.env.NODE_ENV === 'production';
  const authMode = (process.env.AUTH_MODE as 'mock' | 'oidc') ?? 'mock';
  return {
    app: {
      isProduction,
      databaseUrl: process.env.DATABASE_URL ?? '',
      port: parseInt(process.env.PORT ?? '4000', 10),
      appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
      corsOrigin: process.env.CORS_ORIGIN ?? process.env.APP_BASE_URL ?? 'http://localhost:3000',
      jwtSecret: process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
      authMode,
      devLoginEnabled: authMode === 'mock' && (!isProduction || process.env.ALLOW_DEV_LOGIN === 'true'),
      oidc: {
        issuer: process.env.OIDC_ISSUER ?? '',
        clientId: process.env.OIDC_CLIENT_ID ?? '',
        clientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
        redirectUri: process.env.OIDC_REDIRECT_URI ?? '',
      },
      vendorAdapter: (process.env.VENDOR_ADAPTER as 'mock' | 'kakao') ?? 'mock',
      kakao: {
        apiKey: process.env.KAKAO_CPAAS_API_KEY ?? '',
        apiSecret: process.env.KAKAO_CPAAS_API_SECRET ?? '',
        senderKey: process.env.KAKAO_CPAAS_SENDER_KEY ?? '',
        senderPhone: process.env.KAKAO_CPAAS_SENDER_PHONE ?? '',
        apiBaseUrl: process.env.KAKAO_CPAAS_API_BASE_URL ?? 'https://api.solapi.com',
        templateId: process.env.KAKAO_CPAAS_TEMPLATE_ID ?? '',
        webhookSecret: process.env.KAKAO_WEBHOOK_SECRET ?? 'change-me',
      },
      storageDriver: (process.env.STORAGE_DRIVER as 'local') ?? 'local',
      storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? './uploads',
      fileUrlTtlSeconds: parseInt(process.env.FILE_URL_TTL_SECONDS ?? '43200', 10),
      invitationParser: (process.env.INVITATION_PARSER as 'mock' | 'claude') ?? 'mock',
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY ?? '',
        model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
      },
    },
  };
};

// 운영에서 기본값 그대로 뜨면 위험한 설정은 시작 단계에서 막는다 — 잘못된 채로 인터넷에
// 공개되는 것보다 컨테이너가 안 뜨는 편이 낫다.
export function assertProductionConfig(config: AppConfig): void {
  if (!config.isProduction) return;
  const problems: string[] = [];
  if (config.jwtSecret === DEFAULT_JWT_SECRET || config.jwtSecret.length < 32) {
    problems.push('JWT_SECRET을 32자 이상의 임의 문자열로 지정하세요.');
  }
  if (!config.appBaseUrl.startsWith('https://')) {
    problems.push('APP_BASE_URL을 실제 접속 주소(https://...)로 지정하세요. 알림톡 링크에 쓰입니다.');
  }
  if (problems.length > 0) {
    throw new Error(`운영 설정 오류:\n- ${problems.join('\n- ')}`);
  }
}
