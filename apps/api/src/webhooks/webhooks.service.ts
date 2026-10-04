import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// 솔라피 상태 코드: 2000 정상 접수 / 3000 이통사 접수(진행 중) / 4000 수신 완료.
// 그 외 코드는 실패로 본다(알림톡 실패 후 문자 대체발송까지 실패한 경우 포함).
const DELIVERED = '4000';
const IN_PROGRESS = new Set(['2000', '3000']);
const MIN_TOKEN_LENGTH = 32;

interface SolapiReport {
  messageId: string;
  statusCode: string;
  statusMessage?: string;
}

// 솔라피 "메시지 리포트" 웹훅 수신.
//
// 인증: 솔라피의 웹훅 서명 방식을 공개 자료로 확정할 수 없어, 서명 대신 콜백 주소에
// 우리만 아는 긴 비밀값을 넣는다(/api/webhooks/solapi/<KAKAO_WEBHOOK_SECRET>). 값이
// 설정되지 않았거나 짧으면 경로 자체가 닫힌다(404). 그리고 우리가 실제로 보낸 메시지
// 번호만 처리하고, 이미 결과가 확정된 건은 다시 바꾸지 않는다 — 같은 리포트가 재전송돼도
// 관리자 알림이 중복되지 않는다.
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly token: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    configService: ConfigService,
  ) {
    const secret = configService.get<AppConfig['kakao']['webhookSecret']>('app.kakao.webhookSecret') ?? '';
    if (secret && secret.length < MIN_TOKEN_LENGTH) {
      this.logger.warn(`KAKAO_WEBHOOK_SECRET이 ${MIN_TOKEN_LENGTH}자 미만이라 솔라피 콜백을 받지 않습니다.`);
    }
    this.token = secret.length >= MIN_TOKEN_LENGTH ? Buffer.from(secret) : null;
  }

  isAuthorized(token: string): boolean {
    if (!this.token) return false;
    const provided = Buffer.from(token);
    return provided.length === this.token.length && timingSafeEqual(provided, this.token);
  }

  async handleSolapiReport(body: unknown): Promise<{ received: true; processed: number }> {
    const reports = extractReports(body);
    if (reports.length === 0) {
      this.logger.warn(`솔라피 리포트에서 처리할 항목을 찾지 못했습니다: ${JSON.stringify(body).slice(0, 500)}`);
      return { received: true, processed: 0 };
    }

    const transmissions = await this.prisma.orderTransmission.findMany({
      where: { providerMessageId: { in: reports.map((r) => r.messageId) } },
    });
    const byMessageId = new Map(transmissions.map((t) => [t.providerMessageId, t]));

    let processed = 0;
    for (const report of reports) {
      const transmission = byMessageId.get(report.messageId);
      if (!transmission || transmission.status === 'acked' || transmission.status === 'failed') continue;
      if (IN_PROGRESS.has(report.statusCode)) continue;

      if (report.statusCode === DELIVERED) {
        await this.prisma.orderTransmission.update({
          where: { id: transmission.id },
          data: { status: 'acked' },
        });
      } else {
        const reason = `${report.statusCode} ${report.statusMessage ?? ''}`.trim();
        await this.prisma.orderTransmission.update({
          where: { id: transmission.id },
          data: { status: 'failed', responseBody: reason },
        });
        await this.notificationsService.notifyAdmins(
          transmission.requestId,
          `[긴급] 꽃집 알림톡 전달 실패(${reason}) — 꽃집에 직접 연락해주세요.`,
        );
      }
      processed++;
    }
    return { received: true, processed };
  }
}

// 솔라피 리포트는 배열로 오기도 하고 {data:[...]}로 감싸 오기도 해서 둘 다 받는다.
function extractReports(body: unknown): SolapiReport[] {
  const items: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : [body];
  const reports: SolapiReport[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const { messageId, statusCode, statusMessage } = item as Record<string, unknown>;
    if (typeof messageId !== 'string' || statusCode === undefined || statusCode === null) continue;
    reports.push({
      messageId,
      statusCode: String(statusCode),
      statusMessage: typeof statusMessage === 'string' ? statusMessage : undefined,
    });
  }
  return reports;
}
