// 관리자 화면에서 바꾸는 외부 연동 설정 — Microsoft 365 로그인, 알림톡(Solapi), 청첩장 AI(Claude).
// 값은 .env 를 기본값으로 삼고, 관리자가 저장한 값(암호화 파일)이 있으면 그것이 우선한다.
export type AuthMode = 'mock' | 'oidc';
export type VendorAdapterMode = 'mock' | 'kakao';
export type InvitationParserMode = 'mock' | 'claude';

export interface AuthSettings {
  mode: AuthMode;
  // 사번만으로 로그인하는 개발용 로그인. 운영(NODE_ENV=production)에서는 이 값이 true 일 때만 열린다.
  allowDevLogin: boolean;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUri: string;
  // SSO 연동 전까지 쓰는 임시 관리자 계정(아이디+비밀번호 로그인). 비어 있으면 없음.
  // 관리자 화면에서 만들고 지운다(일반 PUT 으로는 바꿀 수 없다). 해시는 common/password.ts 형식.
  localAdminId: string;
  localAdminPasswordHash: string;
}

export interface VendorSettings {
  adapter: VendorAdapterMode;
  apiKey: string;
  apiSecret: string;
  senderKey: string;
  senderPhone: string;
  apiBaseUrl: string;
  templateId: string;
  webhookSecret: string;
}

export interface InvitationParserSettings {
  mode: InvitationParserMode;
  anthropicApiKey: string;
  model: string;
}

export interface IntegrationSettings {
  auth: AuthSettings;
  vendor: VendorSettings;
  invitationParser: InvitationParserSettings;
}

export type SectionKey = keyof IntegrationSettings;

// 화면에 되돌려주지 않는 비밀값. 저장 여부와 끝 4자리만 보여 준다.
export const SECRET_FIELDS: { [K in SectionKey]: readonly (keyof IntegrationSettings[K])[] } = {
  auth: ['oidcClientSecret', 'localAdminPasswordHash'],
  vendor: ['apiKey', 'apiSecret', 'webhookSecret'],
  invitationParser: ['anthropicApiKey'],
};

export interface SecretView {
  set: boolean;
  hint: string; // 예: "****ab12" (없으면 빈 문자열)
}

export interface IntegrationSettingsView {
  auth: Omit<AuthSettings, 'oidcClientSecret' | 'localAdminId' | 'localAdminPasswordHash'> & {
    oidcClientSecret: SecretView;
    // 임시 관리자 계정은 아이디와 존재 여부만 보여 준다(해시는 끝자리도 내보내지 않는다).
    localAdmin: { id: string; set: boolean };
  };
  vendor: Omit<VendorSettings, 'apiKey' | 'apiSecret' | 'webhookSecret'> & {
    apiKey: SecretView;
    apiSecret: SecretView;
    webhookSecret: SecretView;
  };
  invitationParser: Omit<InvitationParserSettings, 'anthropicApiKey'> & { anthropicApiKey: SecretView };
  // 지금 실제로 동작하는 방식 — 저장 직후 화면에서 바로 확인할 수 있게 함께 내려준다.
  effective: {
    loginMethod: 'oidc' | 'dev' | 'none';
    localLogin: boolean; // 임시 관리자 비밀번호 로그인이 열려 있는지
    vendorAdapter: VendorAdapterMode;
    invitationParser: InvitationParserMode;
  };
  meta: {
    file: string;
    fromFile: boolean; // false 면 아직 저장한 적이 없어 .env 값으로 동작 중
    savedAt: string | null;
    savedBy: string | null;
  };
}

// 저장 요청: 섹션·항목 모두 선택 입력. 비밀값은 빈 문자열/생략이면 그대로 두고, null 이면 지운다.
export type IntegrationSettingsPatch = {
  [K in SectionKey]?: { [F in keyof IntegrationSettings[K]]?: IntegrationSettings[K][F] | null };
};
