import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrationSettingsService } from '../settings/integration-settings.service';
import { InvitationParserController } from './invitation-parser.controller';
import { ClaudeInvitationParserAdapter } from './claude-invitation-parser.adapter';
import { MockInvitationParserAdapter } from './mock-invitation-parser.adapter';
import { INVITATION_PARSER, InvitationParserAdapter } from './invitation-parser.interface';

// 다른 외부 연동(vendor/, auth/)과 같은 패턴 — 관리자 화면의 연동 설정(기본값은
// INVITATION_PARSER env)이 구현체를 고르고, 요청마다 현재 값을 읽어 재시작 없이 바뀐다.
//
// 기본값이 Mock인 것은 의도적이다: 청첩장/부고장에는 이름·연락처 등 개인정보가 들어있어
// 외부로 전송하려면 사내 검토가 필요하다. 관리자가 명시적으로 켜기 전까지는 아무것도
// 외부로 나가지 않는다. 켜져 있어도 키가 없으면 Mock으로 동작한다(요청마다 인증 오류를
// 내는 것보다 낫다 — 화면의 "현재 적용" 표시로 알 수 있다).
@Module({
  imports: [AuthModule, AttachmentsModule],
  controllers: [InvitationParserController],
  providers: [
    MockInvitationParserAdapter,
    ClaudeInvitationParserAdapter,
    {
      provide: INVITATION_PARSER,
      inject: [IntegrationSettingsService, MockInvitationParserAdapter, ClaudeInvitationParserAdapter],
      useFactory: (
        settings: IntegrationSettingsService,
        mock: MockInvitationParserAdapter,
        claude: ClaudeInvitationParserAdapter,
      ): InvitationParserAdapter => {
        const pick = () => (settings.effectiveInvitationParser() === 'claude' ? claude : mock);
        return {
          parseUrl: (url) => pick().parseUrl(url),
          parseImages: (images) => pick().parseImages(images),
        };
      },
    },
  ],
  exports: [ClaudeInvitationParserAdapter],
})
export class InvitationParserModule {}
