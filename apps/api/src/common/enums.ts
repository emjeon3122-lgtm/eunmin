// DB를 SQLite로 전환하면서 Prisma enum을 쓸 수 없게 되어(SQLite 커넥터는 enum
// 미지원) 여기서 같은 이름/같은 값으로 정의한다. 스키마에서는 해당 컬럼이 String이고,
// 값의 유효성은 DB가 아니라 이 상수 + class-validator(@IsEnum)로 보장한다.
//
// 각 항목을 `const 객체 + 동명의 타입`으로 선언한 이유:
// 기존 코드가 `Role.admin`(값)과 `role: Role`(타입)을 모두 쓰고 있어서, 이 형태로
// 두면 import 경로만 '@prisma/client' -> 이 파일로 바꾸면 나머지 코드는 그대로 동작한다.
// @IsEnum도 객체를 받으므로 DTO 검증도 변경 없이 유지된다.

// SQLite에서는 컬럼이 String이라 DB에서 읽어온 값의 타입이 그냥 string이고, DB가
// 값을 강제해주지도 않는다. 권한처럼 잘못된 값이 흘러가면 안 되는 자리에서는 좁혀
// 쓰기 전에 이 함수로 실제 허용된 값인지 확인한다(아니면 조용히 넘어가지 않고 터진다).
export function assertEnum<T extends Record<string, string>>(
  enumObj: T,
  value: string,
  fieldName: string,
): T[keyof T] {
  if (!(Object.values(enumObj) as string[]).includes(value)) {
    throw new Error(`${fieldName}에 알 수 없는 값이 저장되어 있습니다: ${value}`);
  }
  return value as T[keyof T];
}

export const Role = {
  employee: 'employee',
  admin: 'admin',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const RequestType = {
  self: 'self',
  existing_client: 'existing_client',
  prospective_client: 'prospective_client',
} as const;
export type RequestType = (typeof RequestType)[keyof typeof RequestType];

export const WeddingSide = {
  groom: 'groom',
  bride: 'bride',
} as const;
export type WeddingSide = (typeof WeddingSide)[keyof typeof WeddingSide];

export const OrchidType = {
  oriental: 'oriental',
  western: 'western',
} as const;
export type OrchidType = (typeof OrchidType)[keyof typeof OrchidType];

export const ContractType = {
  external_audit: 'external_audit',
  voluntary_audit: 'voluntary_audit',
  tax: 'tax',
  bookkeeping: 'bookkeeping',
  internal_accounting: 'internal_accounting',
  other_advisory: 'other_advisory',
} as const;
export type ContractType = (typeof ContractType)[keyof typeof ContractType];

export const OccasionType = {
  wedding: 'wedding',
  funeral: 'funeral',
  opening: 'opening',
  promotion: 'promotion',
  etc: 'etc',
} as const;
export type OccasionType = (typeof OccasionType)[keyof typeof OccasionType];

export const OccasionTypeFilter = {
  ...OccasionType,
  all: 'all',
} as const;
export type OccasionTypeFilter = (typeof OccasionTypeFilter)[keyof typeof OccasionTypeFilter];

export const RequestStatus = {
  draft: 'draft',
  submitted: 'submitted',
  submitted_to_vendor: 'submitted_to_vendor',
  accepted: 'accepted',
  completed: 'completed',
  cancelled: 'cancelled',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const AttachmentType = {
  pre_approval_proof: 'pre_approval_proof',
  delivery_completion_photo: 'delivery_completion_photo',
} as const;
export type AttachmentType = (typeof AttachmentType)[keyof typeof AttachmentType];

export const UploaderType = {
  employee: 'employee',
  vendor: 'vendor',
} as const;
export type UploaderType = (typeof UploaderType)[keyof typeof UploaderType];

export const VendorChannelType = {
  kakao_friendtalk: 'kakao_friendtalk',
  kakao_alimtalk: 'kakao_alimtalk',
  api: 'api',
  email: 'email',
} as const;
export type VendorChannelType = (typeof VendorChannelType)[keyof typeof VendorChannelType];

export const FallbackChannel = {
  manual_admin_alert: 'manual_admin_alert',
  sms: 'sms',
  none: 'none',
} as const;
export type FallbackChannel = (typeof FallbackChannel)[keyof typeof FallbackChannel];

export const TransmissionChannel = {
  kakao_friendtalk: 'kakao_friendtalk',
  kakao_alimtalk: 'kakao_alimtalk',
  sms_fallback: 'sms_fallback',
  api: 'api',
  email: 'email',
} as const;
export type TransmissionChannel = (typeof TransmissionChannel)[keyof typeof TransmissionChannel];

export const TransmissionStatus = {
  pending: 'pending',
  sent: 'sent',
  failed: 'failed',
  acked: 'acked',
} as const;
export type TransmissionStatus = (typeof TransmissionStatus)[keyof typeof TransmissionStatus];

export const NotificationChannel = {
  email: 'email',
  kakao_alimtalk: 'kakao_alimtalk',
  in_app: 'in_app',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  sent: 'sent',
  failed: 'failed',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];
