import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { KakaoTransmissionCallbackDto } from './dto/kakao-transmission-callback.dto';
import { KakaoInboundPhotoDto } from './dto/kakao-inbound-photo.dto';

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

  // 2순위 매칭 경로: 꽃집이 원터치 링크를 쓰지 않고 카톡 채널 대화방에 사진만
  // 올린 경우. 해당 꽃집의 "접수 확인됨(accepted)" 주문 중 가장 최근 것 하나로
  // 자동 매칭하되, 후보가 0건이거나 2건 이상(동시에 여러 건 진행 중이라 애매한
  // 경우)이면 절대 추측하지 않고 관리자에게 넘긴다 — 잘못 매칭되면 엉뚱한
  // 신청자에게 남의 배송완료 사진/알림이 갈 수 있기 때문.
  async handleInboundPhoto(dto: KakaoInboundPhotoDto): Promise<{ received: true; matched: boolean }> {
    const vendor = await this.prisma.vendor.findFirst({ where: { kakaoChannelId: dto.vendorKakaoChannelId } });
    if (!vendor) {
      return { received: true, matched: false };
    }

    const candidates = await this.prisma.wreathRequest.findMany({
      where: { vendorId: vendor.id, status: 'accepted' },
      orderBy: { acceptedAt: 'desc' },
    });

    if (candidates.length === 0) {
      await this.notificationsService.notifyAdmins(
        null,
        `[카톡 사진 매칭] ${vendor.name}에서 사진이 도착했지만 접수 확인된 진행 중 주문이 없어 자동 매칭하지 못했습니다.`,
      );
      return { received: true, matched: false };
    }

    if (candidates.length > 1) {
      await this.prisma.attachment.create({
        data: {
          fileName: `kakao-inbound-${Date.now()}.jpg`,
          fileUrl: dto.imageUrl,
          mimeType: 'image/jpeg',
          type: 'delivery_completion_photo',
          uploaderType: 'vendor',
        },
      });
      await this.notificationsService.notifyAdmins(
        null,
        `[카톡 사진 매칭] ${vendor.name}에서 사진이 도착했지만 접수 확인된 주문이 ${candidates.length}건 동시에 진행 중이라 ` +
          `자동 매칭하지 못했습니다. 관리자 화면의 "미매칭 사진"에서 직접 연결해주세요.`,
      );
      return { received: true, matched: false };
    }

    const request = candidates[0];
    await this.prisma.attachment.create({
      data: {
        fileName: `kakao-inbound-${Date.now()}.jpg`,
        fileUrl: dto.imageUrl,
        mimeType: 'image/jpeg',
        type: 'delivery_completion_photo',
        uploaderType: 'vendor',
        completionForId: request.id,
      },
    });
    await this.prisma.wreathRequest.update({
      where: { id: request.id },
      data: { status: 'completed', completedAt: new Date(), vendorStatusToken: null },
    });
    await this.notificationsService.notifyRequester(request.requesterId, request.id, '화환 배송이 완료되었습니다.');
    return { received: true, matched: true };
  }
}
