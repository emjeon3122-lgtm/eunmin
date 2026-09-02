import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AppConfig } from '../config/configuration';
import { InvitationParserController } from './invitation-parser.controller';
import { ClaudeInvitationParserAdapter } from './claude-invitation-parser.adapter';
import { MockInvitationParserAdapter } from './mock-invitation-parser.adapter';
import { INVITATION_PARSER, InvitationParserAdapter } from './invitation-parser.interface';

// 다른 미확정 외부 연동(vendor/, auth/)과 같은 패턴 — 환경변수로 구현체를 고른다.
//
// 기본값이 Mock인 것은 의도적이다: 청첩장/부고장에는 이름·연락처 등 개인정보가 들어있어
// 외부로 전송하려면 사내 검토가 필요하다. INVITATION_PARSER=claude 로 명시적으로
// 켜기 전까지는 아무것도 외부로 나가지 않는다.
@Module({
  imports: [AuthModule],
  controllers: [InvitationParserController],
  providers: [
    MockInvitationParserAdapter,
    ClaudeInvitationParserAdapter,
    {
      provide: INVITATION_PARSER,
      inject: [ConfigService, MockInvitationParserAdapter, ClaudeInvitationParserAdapter],
      useFactory: (
        configService: ConfigService,
        mock: MockInvitationParserAdapter,
        claude: ClaudeInvitationParserAdapter,
      ): InvitationParserAdapter => {
        const logger = new Logger('InvitationParserModule');
        const mode = configService.get<AppConfig['invitationParser']>('app.invitationParser');
        if (mode !== 'claude') return mock;

        // 키 없이 claude로 켜두면 요청마다 인증 오류가 나므로, 시작 시점에 걸러 Mock으로 둔다.
        const apiKey = configService.get<AppConfig['anthropic']['apiKey']>('app.anthropic.apiKey');
        if (!apiKey) {
          logger.warn(
            'INVITATION_PARSER=claude 이지만 ANTHROPIC_API_KEY가 없어 Mock으로 동작합니다.',
          );
          return mock;
        }

        logger.log('청첩장 자동 채우기: Claude 어댑터 사용');
        return claude;
      },
    },
  ],
})
export class InvitationParserModule {}
