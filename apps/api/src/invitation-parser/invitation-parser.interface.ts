// 신규 요구사항 Section 4 — 모바일 청첩장/부고장 URL 또는 사진(최대 2장) OCR로
// 주문 정보를 자동으로 채워주는 기능. 실제 OCR 제공자(예: 네이버 클로바 OCR,
// Google Vision)나 청첩장 URL 파싱 서비스가 아직 정해지지 않아, 다른 미확정
// 외부 연동(SSO, 카카오 CPaaS)과 같은 패턴으로 인터페이스 + Mock 구현체로
// 분리해뒀다. 실제 제공자가 정해지면 이 인터페이스를 구현하는 어댑터만 추가하면 된다.
export interface ParsedInvitationFields {
  recipientName?: string;
  // 도로명/지번 주소만. 프론트엔드는 이 값을 주소 칸에 바로 넣지 않고, 이 값을
  // 검색어로 넣은 우편번호 검색 팝업을 띄워 직원이 공식 주소를 확정하게 한다
  // (읽어낸 주소가 틀리면 배송 자체가 실패하므로 한 단계 확인을 둔다).
  deliveryAddress?: string;
  // 층/홀 이름 등 상세주소. 자유 입력 칸이라 검증 없이 그대로 채워도 된다.
  deliveryDetail?: string;
  desiredArrivalAt?: string; // ISO 8601
}

export interface InvitationParserAdapter {
  parseUrl(url: string): Promise<ParsedInvitationFields>;
  parseImages(images: Express.Multer.File[]): Promise<ParsedInvitationFields>;
}

export const INVITATION_PARSER = 'INVITATION_PARSER';
