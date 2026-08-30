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
  venueName: string;
  deliveryAddress: string;
  deliveryDetail?: string | null;
  desiredArrivalAt: string;
  ribbonMessage: string;
  ribbonSenderText: string;
  declaredAmount: number;
  memo?: string | null;
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
  venueName: string;
  desiredArrivalAt: string;
  ribbonMessage: string;
  status: WreathStatus;
  nextAction: VendorNextAction;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; size: number };
}

// POST /api/invitation-parser/parse — 실제 OCR/URL 파싱 서비스 미정이라 지금은
// 항상 빈 값을 반환하는 Mock 어댑터가 응답한다 (apps/api/src/invitation-parser).
export interface ParsedInvitationFields {
  recipientName?: string;
  venueName?: string;
  deliveryAddress?: string;
  desiredArrivalAt?: string;
}
