// docs/04-backend-integration.md section 2-1 — kept identical to the sample so
// swapping implementations (mock <-> kakao <-> future channel) is a one-line change.
export interface VendorMessagePayload {
  requestId: string;
  vendorPhone: string; // vendor.contactPhone (꽃집 사장님 번호, 알림톡 발송 대상)
  occasionType: string;
  weddingSide?: string | null; // occasionType=wedding일 때만
  orchidType?: string | null; // occasionType=opening/promotion일 때만
  recipientName: string;
  recipientPhone: string; // 화환을 받는 사람 연락처(꽃집 사장님 번호와는 별개)
  ordererPhone: string; // 신청자 본인 휴대폰
  deliveryAddress: string;
  deliveryDetail?: string | null;
  desiredArrivalAt: string;
  ribbonMessage: string;
  ribbonSenderText: string;
  memo?: string | null; // 기타요청사항 — occasionType=etc일 때 원하는 상품을 여기 적는다
  statusLinkUrl: string; // https://app.bdo.kr/vendor/status/{token}
}

export interface VendorAdapter {
  send(payload: VendorMessagePayload): Promise<{ providerMessageId: string }>;
}

export class VendorTransmissionError extends Error {}

export const VENDOR_ADAPTER = 'VENDOR_ADAPTER';
