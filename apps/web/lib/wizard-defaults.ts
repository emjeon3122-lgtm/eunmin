import type { OccasionType, RequestType } from "./types";

// 우측 [보내는 이] 기본값 — 통일, 수정 가능 (신규 요구사항 Section 4-2-6).
export const DEFAULT_RIBBON_SENDER = "성현회계법인 대표이사 윤길배";

// 좌측 [경조사어] 기본값 — 경조사 유형이 바뀔 때마다 다시 채워준다(수정 가능).
export const RIBBON_MESSAGE_DEFAULTS: Record<OccasionType, string> = {
  wedding: "祝 結婚",
  funeral: "삼가 故人의 冥福을 빕니다",
  opening: "축 개업",
  promotion: "축 승진",
  etc: "",
};

// 개업일 때만 드롭다운으로 선택 가능한 대체 문구.
export const OPENING_RIBBON_OPTIONS = ["축 개업", "축 발전"];

// Case B/C 발송 사유 입력창 placeholder.
export const SEND_REASON_PLACEHOLDER: Record<"prospective_client" | "self", string> = {
  prospective_client: "예: 00회사 00상무 승진으로 축하 난 발송",
  self: "예: 00본부 000님 본인 결혼 축하화환 발송",
};

// Case B/C 비용 코드 기본값 — 수정 가능.
export const COST_CODE_DEFAULTS: Record<"prospective_client" | "self", string> = {
  prospective_client: "본부 파트너 고객관리",
  self: "법인공통",
};

export function costCodeDefaultFor(requestType: RequestType): string | undefined {
  if (requestType === "prospective_client") return COST_CODE_DEFAULTS.prospective_client;
  if (requestType === "self") return COST_CODE_DEFAULTS.self;
  return undefined;
}
