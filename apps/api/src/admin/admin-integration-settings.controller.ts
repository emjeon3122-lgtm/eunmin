import { Body, Controller, Get, HttpStatus, Post, Put } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedUser } from '../auth/jwt.types';
import { OidcService } from '../auth/oidc.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiException } from '../common/exceptions/api.exception';
import { hashPassword } from '../common/password';
import { ClaudeInvitationParserAdapter } from '../invitation-parser/claude-invitation-parser.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationSettingsService } from '../settings/integration-settings.service';
import { SolapiAlimtalkAdapter } from '../vendor/solapi-alimtalk.adapter';
import { IntegrationSettingsUpdateDto } from './dto/integration-settings-update.dto';
import { LocalAdminDto } from './dto/local-admin.dto';

const LOCAL_ADMIN_ID = /^[A-Za-z0-9_-]{3,30}$/;
const MIN_PASSWORD = 10;

// 관리자 > 설정 > 외부 연동. 비밀값은 저장 여부·끝 4자리만 내려주고 전체 값은 절대 돌려주지 않는다.
@Controller('admin/integration-settings')
@AdminGuard()
export class AdminIntegrationSettingsController {
  constructor(
    private readonly settings: IntegrationSettingsService,
    private readonly oidcService: OidcService,
    private readonly solapi: SolapiAlimtalkAdapter,
    private readonly claude: ClaudeInvitationParserAdapter,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  get() {
    return this.settings.view();
  }

  @Put()
  update(@Body() dto: IntegrationSettingsUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settings.update(dto, `${user.employeeNo}`);
  }

  // 임시 관리자 계정(아이디+비밀번호) 만들기/바꾸기. 직원 명단에 같은 사번의 관리자 행을 함께 둔다
  // (로그인 토큰은 직원 행을 가리켜야 하므로). 비밀번호는 해시로만 암호화 파일에 저장된다.
  @Put('local-admin')
  async setLocalAdmin(@Body() dto: LocalAdminDto, @CurrentUser() user: AuthenticatedUser) {
    const id = dto.id.trim();
    if (!LOCAL_ADMIN_ID.test(id)) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_LOCAL_ADMIN', '아이디는 영문·숫자·-·_ 3~30자여야 합니다.');
    }
    if (dto.password.length < MIN_PASSWORD) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_LOCAL_ADMIN', `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`);
    }
    const existing = await this.prisma.user.findUnique({ where: { employeeNo: id } });
    if (existing && !existing.ssoSubjectId.startsWith('local:')) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_LOCAL_ADMIN', '이미 직원 명단에 있는 사번입니다. 다른 아이디를 쓰세요.');
    }
    const current = this.settings.localAdmin();
    if (current && current.id !== id) {
      await this.removeLocalUser(current.id); // 아이디를 바꾸면 이전 임시 계정은 정리한다
    }
    await this.prisma.user.upsert({
      where: { employeeNo: id },
      update: { role: 'admin', name: '임시 관리자', department: '전산' },
      create: {
        employeeNo: id,
        name: '임시 관리자',
        department: '전산',
        email: `${id}@local.invalid`,
        role: 'admin',
        ssoSubjectId: `local:${id}`,
      },
    });
    return this.settings.setLocalAdmin(id, hashPassword(dto.password), `${user.employeeNo}`);
  }

  // 임시 관리자 계정 삭제 — SSO 연동이 끝나면 지운다. 그 계정으로 로그인한 채로는 지울 수 없다.
  @Post('local-admin/delete')
  async clearLocalAdmin(@CurrentUser() user: AuthenticatedUser) {
    const current = this.settings.localAdmin();
    if (current) {
      if (user.employeeNo === current.id) {
        throw new ApiException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVALID_LOCAL_ADMIN',
          '지금 임시 관리자 계정으로 로그인한 상태에서는 지울 수 없습니다. 다른 관리자로 로그인해 지우세요.',
        );
      }
      await this.removeLocalUser(current.id);
    }
    return this.settings.clearLocalAdmin(`${user.employeeNo}`);
  }

  // 임시 계정의 직원 행을 지운다. 신청 이력 등에 묶여 지울 수 없으면 일반 직원으로 내려 로그인을 막는다.
  private async removeLocalUser(id: string) {
    try {
      await this.prisma.user.delete({ where: { employeeNo: id } });
    } catch {
      await this.prisma.user.updateMany({ where: { employeeNo: id }, data: { role: 'employee' } });
    }
  }

  // 저장된 값으로 실제 연결을 확인한다. 돈이 들거나 메시지가 나가는 호출은 하지 않는다.
  @Post('test/oidc')
  async testOidc() {
    return this.wrap('Microsoft 로그인 서버', () => this.oidcService.checkConnection());
  }

  @Post('test/solapi')
  async testSolapi() {
    return this.wrap('Solapi', () => this.solapi.checkConnection());
  }

  @Post('test/anthropic')
  async testAnthropic() {
    return this.wrap('Anthropic', () => this.claude.checkConnection());
  }

  private async wrap<T>(label: string, run: () => Promise<T>): Promise<{ ok: true; result: T }> {
    try {
      return { ok: true, result: await run() };
    } catch (err) {
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        'INTEGRATION_TEST_FAILED',
        `${label} 연결 확인 실패: ${summarize(err)}`,
      );
    }
  }
}

// 오류 메시지에 키나 토큰이 섞여 나가지 않게 짧게 자른다.
function summarize(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, ' ').slice(0, 300);
}
