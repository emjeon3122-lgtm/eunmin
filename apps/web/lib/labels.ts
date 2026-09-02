import type { ContractType, OccasionType, OrchidType, RequestType, WeddingSide, WreathStatus } from "./types";

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  self: "임직원(본인)",
  existing_client: "고객사(현재 고객)",
  prospective_client: "고객사(잠재 고객)",
};

export const OCCASION_TYPE_LABELS: Record<OccasionType, string> = {
  wedding: "결혼",
  funeral: "부고",
  opening: "개업",
  promotion: "승진",
  etc: "기타",
};

export const WEDDING_SIDE_LABELS: Record<WeddingSide, string> = {
  groom: "신랑측",
  bride: "신부측",
};

export const ORCHID_TYPE_LABELS: Record<OrchidType, string> = {
  oriental: "동양란",
  western: "서양란",
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  external_audit: "외부감사/공익법인감사",
  voluntary_audit: "임의감사",
  tax: "세무",
  bookkeeping: "기장",
  internal_accounting: "내부회계",
  other_advisory: "기타 자문",
};

export function occasionWithRequestType(occasion: OccasionType, requestType: RequestType) {
  return `${OCCASION_TYPE_LABELS[occasion]}(${REQUEST_TYPE_LABELS[requestType]})`;
}

export const STATUS_BADGE: Record<WreathStatus, { label: string; className: string }> = {
  draft: { label: "임시저장", className: "bg-gray-100 text-gray-600" },
  submitted: { label: "신청완료", className: "bg-gray-200 text-gray-700" },
  submitted_to_vendor: { label: "신청완료", className: "bg-gray-200 text-gray-700" },
  accepted: { label: "배송중", className: "bg-orange-100 text-orange-700" },
  completed: { label: "완료", className: "bg-green-100 text-green-700" },
  cancelled: { label: "취소됨", className: "bg-red-100 text-red-700" },
};

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatCurrency(amount?: number | null): string {
  if (amount == null) return "-";
  return `${amount.toLocaleString("ko-KR")}원`;
}
