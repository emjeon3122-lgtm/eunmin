// 신규 요구사항 Section 4 — 모바일 청첩장/부고장 URL 또는 사진(최대 2장) OCR로
// 주문 정보를 자동으로 채워주는 기능. 실제 OCR 제공자(예: 네이버 클로바 OCR,
// Google Vision)나 청첩장 URL 파싱 서비스가 아직 정해지지 않아, 다른 미확정
// 외부 연동(SSO, 카카오 CPaaS)과 같은 패턴으로 인터페이스 + Mock 구현체로
// 분리해뒀다. 실제 제공자가 정해지면 이 인터페이스를 구현하는 어댑터만 추가하면 된다.
export interface ParsedInvitationFields {
  recipientName?: string;
  venueName?: string;
  deliveryAddress?: string;
  desiredArrivalAt?: string; // ISO 8601
}

export interface InvitationParserAdapter {
  parseUrl(url: string): Promise<ParsedInvitationFields>;
  parseImages(images: Express.Multer.File[]): Promise<ParsedInvitationFields>;
}

export const INVITATION_PARSER = 'INVITATION_PARSER';
