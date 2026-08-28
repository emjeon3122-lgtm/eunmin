import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { KakaoTransmissionCallbackDto } from './dto/kakao-transmission-callback.dto';

// docs/04-backend-integration.md section 5. Real header name/algorithm must follow
// the selected CPaaS's actual webhook contract (docs/04 section 8-2, unconfirmed);
// HMAC-SHA256 over the raw request body is used here as the best-guess placeholder.
@Injectable()
export class WebhooksService {
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    configService: ConfigService,
  ) {
    this.webhookSecret = configService.get<AppConfig['kakao']['webhookSecret']>('app.kakao.webhookSecret')!;
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  }

  // 모르는 콜백(매칭되는 transmission 없음)은 조용히 무시(멱등) — doc 02 section 5-1.
  async handleKakaoTransmission(body: KakaoTransmissionCallbackDto): Promise<{ received: true }> {
    const transmission = await this.prisma.orderTransmission.findUnique({
      where: { providerMessageId: body.providerMessageId },
    });
    if (!transmission) {
      return { received: true };
    }

    if (body.status === 'failed') {
      await this.prisma.orderTransmission.update({
        where: { id: transmission.id },
        data: { status: 'failed', responseBody: body.reason },
      });
      await this.notificationsService.notifyAdmins(
        transmission.requestId,
        `알림톡 발송 실패(${body.reason ?? '사유 미상'}) — 수동 연락이 필요합니다.`,
      );
    } else {
      await this.prisma.orderTransmission.update({
        where: { id: transmission.id },
        data: { status: 'acked' },
      });
    }
    return { received: true };
  }
}
