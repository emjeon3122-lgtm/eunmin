import { Injectable, Logger } from '@nestjs/common';
import { InvitationParserAdapter, ParsedInvitationFields } from './invitation-parser.interface';

// 실제 OCR/URL 파싱 서비스가 정해지기 전까지 쓰는 기본 구현체 — 아무 필드도
// 채우지 못했다고 정직하게 빈 결과를 반환한다. 프론트엔드는 이 경우 "자동으로
// 채우지 못했습니다. 직접 입력해주세요" 안내를 보여주면 된다(Section 4는
// 애초에 선택 입력이라 이렇게 동작해도 신청 자체는 막히지 않는다).
@Injectable()
export class MockInvitationParserAdapter implements InvitationParserAdapter {
  private readonly logger = new Logger(MockInvitationParserAdapter.name);

  async parseUrl(url: string): Promise<ParsedInvitationFields> {
    this.logger.log(`[MOCK 청첩장/부고장 URL 파싱] url=${url} — 파싱 서비스 미정, 빈 결과 반환`);
    return {};
  }

  async parseImages(images: Express.Multer.File[]): Promise<ParsedInvitationFields> {
    this.logger.log(`[MOCK OCR 파싱] ${images.length}장 수신 — OCR 제공자 미정, 빈 결과 반환`);
    return {};
  }
}
