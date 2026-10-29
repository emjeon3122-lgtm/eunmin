// Shared types mirroring docs/02-api-spec.md and docs/01-architecture-and-db.md.

export type UserRole = "employee" | "admin";

export interface User {
  id: string;
  employeeNo: string;
  name: string;
  department: string;
  email: string;
  phone: string;
  role: UserRole;
  isPartner: boolean;
}

export type RequestType = "self" | "existing_client" | "prospective_client";
export type OccasionType = "wedding" | "funeral" | "opening" | "promotion" | "etc";
export type WeddingSide = "groom" | "bride";
export type OrchidType = "oriental" | "western";
export type ContractType =
  | "external_audit"
  | "voluntary_audit"
  | "tax"
  | "bookkeeping"
  | "internal_accounting"
  | "other_advisory";

// draft is included defensively — the exposed API only ever creates rows as
// "submitted" (doc 02 §3-1), so draft should not appear in practice.
export type WreathStatus =
  | "draft"
  | "submitted"
  | "submitted_to_vendor"
  | "accepted"
  | "completed"
  | "cancelled";

export interface VendorTransmission {
  status: "pending" | "sent" | "failed" | "acked";
  attemptedAt: string | null;
}

export interface WreathRequestListItem {
  id: string;
  requestType: RequestType;
  occasionType: OccasionType;
  recipientName: string;
  status: WreathStatus;
  createdAt: string;
}

export interface WreathRequestDetail {
  id: string;
  status: WreathStatus;
  requestType: RequestType;
  occasionType: OccasionType;
  weddingSide?: WeddingSide | null;
  orchidType?: OrchidType | null;
  recipientName: string;
  recipientPhone: string;
  ordererPhone: string;
  deliveryAddress: string;
  deliveryDetail?: string | null;
  desiredArrivalAt: string;
  ribbonMessage: string;
  ribbonSenderText: string;
  declaredAmount?: number | null;
  memo?: string | null;
  // 신청자가 입력한 모바일 청첩장/부고장 링크 — 꽃집에도 알림톡으로 함께 전달된다.
  invitationUrl?: string | null;
  // 자동 채우기에 쓴 청첩장/부고장 사진 — 알림톡에는 실을 수 없어 꽃집 상태 확인
  // 페이지와 관리자 화면에서만 보인다.
  invitationPhotoUrls?: string[];
  clientName?: string | null;
  contractType?: ContractType | null;
  serviceName?: string | null;
  sendReason?: string | null;
  costCode?: string | null;
  requiresPreApproval: boolean;
  vendorTransmission?: VendorTransmission | null;
  acceptedAt: string | null;
  completedAt: string | null;
  completionPhotoUrls: string[];
  cancelledReason: string | null;
  cancelledAt?: string | null;
  createdAt: string;
}

// Admin list/detail rows carry a few extra fields beyond the employee-facing
// shape (doc 03 §2-4/§2-5); the exact response shape is not pinned down in
// doc 02's endpoint table, so fields here are treated as optional/defensive.
export interface AdminWreathRequestListItem extends WreathRequestListItem {
  requesterName: string;
  department: string;
  requiresPreApproval: boolean;
  // 같은 장소·같은 날 다른 신청이 있는지 — same_event: 같은 경조사로 보임, same_place: 장소·날짜만 같음
  duplicateFlag?: "same_event" | "same_place" | null;
}

export interface OrderTransmission {
  id: string;
  channel: "kakao_friendtalk" | "kakao_alimtalk" | "sms_fallback" | "api" | "email";
  status: "pending" | "sent" | "failed" | "acked";
  providerMessageId?: string | null;
  responseBody?: string | null;
  attemptedAt: string;
}

export interface AdminWreathRequestDetail extends WreathRequestDetail {
  requesterName: string;
  department: string;
  attachmentUrl?: string | null;
  attachmentFileName?: string | null;
  adminOverrideNote?: string | null;
  orderTransmissions?: OrderTransmission[];
  relatedRequests?: RelatedRequest[];
}

// 관리자 상세 — 같은 장소·같은 날의 다른 신청
export interface RelatedRequest {
  id: string;
  requesterName: string;
  department: string;
  status: WreathStatus;
  createdAt: string;
  recipientName: string;
  clientName: string | null;
  sameEvent: boolean;
  externalAudit: boolean;
}

// POST /api/wreath-requests/duplicate-check — 신청서 마지막 단계의 중복 확인
export interface DuplicateMatch {
  id: string;
  requesterName: string;
  department: string;
  createdAt: string;
  occasionType: OccasionType;
  deliveryDetail: string | null;
  desiredArrivalAt: string;
  sameEvent: boolean;
  recipientName: string | null;
  externalAudit: boolean;
}

export interface DuplicateCheckResult {
  blocked: boolean;
  matches: DuplicateMatch[];
}

export interface Product {
  id: string;
  vendorId: string;
  name: string;
  price: number;
  description?: string | null;
  isActive: boolean;
}

export interface RibbonTemplate {
  id: string;
  occasionType: OccasionType;
  phraseKo: string;
  phraseHanja?: string | null;
  isActive: boolean;
}

export interface ApprovalRuleCheckResult {
  requiresPreApproval: boolean;
  matchedRule?: {
    occasionType: OccasionType | "all";
    minAmount: number;
  } | null;
}

export interface ApprovalRule {
  id: string;
  occasionType: OccasionType | "all";
  minAmount: number;
  isActive: boolean;
  description?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  channelType: "kakao_friendtalk" | "kakao_alimtalk" | "api" | "email";
  contactPhone: string;
  kakaoChannelId?: string | null;
  isChannelFriendConfirmed: boolean;
  fallbackChannel: "manual_admin_alert" | "sms" | "none";
  isActive: boolean;
}

export type VendorNextAction = "accept" | "complete" | null;

export interface VendorStatusData {
  occasionType: OccasionType;
  desiredArrivalAt: string;
  ribbonMessage: string;
  status: WreathStatus;
  nextAction: VendorNextAction;
  // 배송 정보 대조용 청첩장/부고장 원본 (신청 시 선택 입력이라 없을 수 있다).
  invitationUrl?: string | null;
  invitationPhotoUrls?: string[];
}

// 관리자 > 직원 명단
export interface RosterUser {
  employeeNo: string;
  name: string;
  department: string;
  email: string;
  phone: string | null;
  isPartner: boolean;
  role: UserRole;
  loginLinked: boolean; // Microsoft 365로 한 번이라도 로그인해 계정이 연결됐는지
}

// 관리자 > 직원 명단 > 회사 계정에서 찾아 추가 (GET /api/admin/users/directory?q=)
export interface DirectoryPerson {
  oid: string; // Microsoft 계정 고유값
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  phone: string;
  enabled: boolean; // false 면 회사에서 로그인이 막힌 계정
  registeredAs: string | null; // 이미 명단에 있으면 그 사번
}

export interface RosterImportResult {
  applied: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; message: string }[];
}

export interface AppNotification {
  id: string;
  requestId: string | null;
  message: string;
  sentAt: string;
  readAt: string | null;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; size: number };
}

// POST /api/invitation-parser/parse — 실제 OCR/URL 파싱 서비스 미정이라 지금은
// 항상 빈 값을 반환하는 Mock 어댑터가 응답한다 (apps/api/src/invitation-parser).
export interface ParsedInvitationFields {
  recipientName?: string;
  // 주소 칸에 바로 넣지 않고 우편번호 검색 팝업의 검색어로 쓴다 — 읽어낸 주소가
  // 틀리면 배송이 실패하므로 공식 주소로 한 번 확정받는다.
  deliveryAddress?: string;
  deliveryDetail?: string;
  desiredArrivalAt?: string;
}

// 관리자 > 설정 > 외부 연동 (GET/PUT /api/admin/integration-settings).
// 비밀값은 저장 여부와 끝 4자리만 내려온다 — 전체 값은 어떤 API 로도 돌려주지 않는다.
export interface SecretView {
  set: boolean;
  hint: string;
}

export interface IntegrationSettingsView {
  auth: {
    mode: "mock" | "oidc";
    allowDevLogin: boolean;
    oidcIssuer: string;
    oidcClientId: string;
    oidcClientSecret: SecretView;
    oidcRedirectUri: string;
    // 임시 관리자 계정(아이디+비밀번호 로그인). SSO 연동 전까지만 쓰고 지운다.
    localAdmin: { id: string; set: boolean };
  };
  vendor: {
    adapter: "mock" | "kakao";
    apiKey: SecretView;
    apiSecret: SecretView;
    senderKey: string;
    senderPhone: string;
    apiBaseUrl: string;
    templateId: string;
    webhookSecret: SecretView;
  };
  invitationParser: {
    mode: "mock" | "claude";
    anthropicApiKey: SecretView;
    model: string;
  };
  effective: {
    loginMethod: "oidc" | "dev" | "none";
    localLogin: boolean;
    vendorAdapter: "mock" | "kakao";
    invitationParser: "mock" | "claude";
  };
  meta: {
    file: string;
    fromFile: boolean;
    savedAt: string | null;
    savedBy: string | null;
  };
}

export type IntegrationSection = "auth" | "vendor" | "invitationParser";
