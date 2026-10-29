import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';

// 청첩장 AI 자동 채우기가 "관리자가 손대야 풀리는" 이유로 멈췄을 때 관리자에게 알린다.
//
// 자동 채우기는 실패해도 신청을 막지 않고 직원 화면에는 "직접 입력해주세요"만 보이므로,
// 크레딧이 떨어지거나 키가 만료돼도 아무도 모른 채 기능이 멈춰 있을 수 있다.
// - 알리는 경우: 크레딧·결제·사용 한도(billing), 키 만료·삭제·권한(auth), 모델 이름 오류(model)
// - 알리지 않는 경우: Anthropic 과부하·네트워크 오류 같은 일시적 문제(잠시 뒤 저절로 풀린다)
// - 같은 이유는 하루에 한 번만 알린다. 성공 호출이 한 번이라도 있으면 기록을 지워,
//   고친 뒤 다시 멈추면 바로 알린다. (서버가 재시작되면 기록이 사라져 한 번 더 알릴 수 있다.)
export type InvitationParserFailure = 'billing' | 'auth' | 'model';

const ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONSOLE_URL = 'https://console.anthropic.com';

const ALERT_MESSAGES: Record<InvitationParserFailure, string> = {
  billing:
    `청첩장 AI 자동 채우기가 멈췄습니다: Anthropic 크레딧이 부족하거나 사용 한도에 도달했습니다. ` +
    `Claude Console(${CONSOLE_URL})에서 잔액·자동 충전·결제 카드를 확인해 주세요. ` +
    `그동안 직원들은 정보를 직접 입력해 신청할 수 있습니다.`,
  auth:
    `청첩장 AI 자동 채우기가 멈췄습니다: Anthropic API 키가 만료됐거나 삭제되어 사용할 수 없습니다. ` +
    `Claude Console(${CONSOLE_URL})에서 새 키를 발급해 관리자 > 설정 > 외부 연동에 입력해 주세요. ` +
    `그동안 직원들은 정보를 직접 입력해 신청할 수 있습니다.`,
  model:
    `청첩장 AI 자동 채우기가 멈췄습니다: 설정된 Claude 모델을 사용할 수 없습니다. ` +
    `관리자 > 설정 > 외부 연동에서 모델 이름을 확인해 주세요. ` +
    `그동안 직원들은 정보를 직접 입력해 신청할 수 있습니다.`,
};

// 크레딧 부족·사용 한도 초과는 400/429 로 오는데, 같은 코드의 다른 오류와는 문구로 구분한다.
const BILLING_PATTERN = /credit balance|billing|usage limit|spend limit|purchase credits/i;

export function classifyAnthropicFailure(err: unknown): InvitationParserFailure | null {
  if (!(err instanceof Anthropic.APIError) || err instanceof Anthropic.APIConnectionError) return null;
  if (err.status === 401 || err.status === 403) return 'auth';
  if (err.status === 404) return 'model';
  if ((err.status === 400 || err.status === 429) && BILLING_PATTERN.test(err.message)) return 'billing';
  return null;
}

@Injectable()
export class InvitationParserAlertService {
  private readonly logger = new Logger(InvitationParserAlertService.name);
  private readonly lastAlertAt = new Map<InvitationParserFailure, number>();

  constructor(private readonly notifications: NotificationsService) {}

  reportSuccess(): void {
    this.lastAlertAt.clear();
  }

  async reportFailure(err: unknown): Promise<void> {
    const reason = classifyAnthropicFailure(err);
    if (!reason) return;
    const now = Date.now();
    const last = this.lastAlertAt.get(reason);
    if (last !== undefined && now - last < ALERT_INTERVAL_MS) return;
    // 알림을 보내기 전에 먼저 기록해, 동시에 실패한 요청들이 같은 알림을 여러 번 보내지 않게 한다.
    this.lastAlertAt.set(reason, now);
    try {
      await this.notifications.notifyAdmins(null, ALERT_MESSAGES[reason]);
      this.logger.warn(`관리자에게 자동 채우기 중단 알림을 보냈습니다 (사유: ${reason})`);
    } catch (notifyErr) {
      this.lastAlertAt.delete(reason);
      this.logger.error(`자동 채우기 중단 알림을 기록하지 못했습니다: ${String(notifyErr)}`);
    }
  }
}
