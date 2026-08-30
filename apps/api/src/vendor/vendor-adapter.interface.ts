// docs/04-backend-integration.md section 2-1 — kept identical to the sample so
// swapping implementations (mock <-> kakao <-> future channel) is a one-line change.
export interface VendorMessagePayload {
  requestId: string;
  recipientPhone: string; // vendor.contactPhone (꽃집 사장님 번호)
  occasionType: string;
  deliveryAddress: string;
  desiredArrivalAt: string;
  ribbonMessage: string;
  ribbonSenderText: string;
  statusLinkUrl: string; // https://app.bdo.kr/vendor/status/{token}
}

export interface VendorAdapter {
  send(payload: VendorMessagePayload): Promise<{ providerMessageId: string }>;
}

export class VendorTransmissionError extends Error {}

export const VENDOR_ADAPTER = 'VENDOR_ADAPTER';
