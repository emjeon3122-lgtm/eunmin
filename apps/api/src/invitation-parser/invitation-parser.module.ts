import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationParserController } from './invitation-parser.controller';
import { MockInvitationParserAdapter } from './mock-invitation-parser.adapter';
import { INVITATION_PARSER } from './invitation-parser.interface';

// 다른 미확정 외부 연동(vendor/, auth/)과 같은 패턴 — 지금은 Mock 하나뿐이지만
// 실제 OCR/URL 파싱 서비스가 정해지면 이 팩토리에 구현체를 추가하기만 하면 된다.
@Module({
  imports: [AuthModule],
  controllers: [InvitationParserController],
  providers: [
    MockInvitationParserAdapter,
    { provide: INVITATION_PARSER, useExisting: MockInvitationParserAdapter },
  ],
})
export class InvitationParserModule {}
