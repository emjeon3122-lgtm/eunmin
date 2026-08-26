import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VENDOR_ADAPTER, VendorAdapter } from '../vendor/vendor-adapter.interface';

// docs/04-backend-integration.md section 4. No Redis/queue infra exists yet, so this
// runs as an in-process async task fired (not awaited) right after the wreath_request
// row commits — see WreathRequestsService.create for the fire-and-forget call site.
@Injectable()
export class SendToVendorService {
  private readonly logger = new Logger(SendToVendorService.name);
  private readonly appBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(VENDOR_ADAPTER) private readonly vendorAdapter: VendorAdapter,
    private readonly notificationsService: NotificationsService,
    configService: ConfigService,
  ) {
    this.appBaseUrl = configService.get<AppConfig['appBaseUrl']>('app.appBaseUrl')!;
  }

  async handle(requestId: string): Promise<void> {
    const request = await this.prisma.wreathRequest.findUnique({ where: { id: requestId } });
    if (!request || !request.vendorId) {
      this.logger.error(`send-to-vendor: 신청 또는 vendor가 없습니다 (requestId=${requestId})`);
      return;
    }
    const vendor = await this.prisma.vendor.findUnique({ where: { id: request.vendorId } });
    if (!vendor) {
      this.logger.error(`send-to-vendor: vendor를 찾을 수 없습니다 (vendorId=${request.vendorId})`);
      return;
    }
    const statusLinkUrl = `${this.appBaseUrl}/vendor/status/${request.vendorStatusToken}`;

    const transmission = await this.prisma.orderTransmission.create({
      data: {
        requestId,
        channel: 'kakao_friendtalk',
        status: 'pending',
        payload: { statusLinkUrl },
      },
    });

    try {
      const { providerMessageId } = await this.vendorAdapter.send({
        requestId,
        recipientPhone: vendor.contactPhone,
        occasionType: request.occasionType,
        venueName: request.venueName,
        deliveryAddress: request.deliveryAddress,
        desiredArrivalAt: request.desiredArrivalAt.toISOString(),
        ribbonMessage: request.ribbonMessage,
        ribbonSenderText: request.ribbonSenderText,
        statusLinkUrl,
      });

      await this.prisma.orderTransmission.update({
        where: { id: transmission.id },
        data: { status: 'sent', providerMessageId },
      });
      await this.prisma.wreathRequest.update({
        where: { id: requestId },
        data: { status: 'submitted_to_vendor' },
      });
    } catch (err) {
      await this.prisma.orderTransmission.update({
        where: { id: transmission.id },
        data: { status: 'failed', responseBody: String(err) },
      });
      await this.notificationsService.notifyAdmins(
        requestId,
        `[긴급] ${vendor.name}에게 친구톡 발송 실패. 직접 전화·문자로 전달해주세요.`,
      );
      // status는 submitted로 유지. 자동 재시도 정책은 docs/04 section 8-4 미확정 —
      // 현재는 관리자 수동 처리(/api/admin/wreath-requests/{id}/delivery-status)에 의존.
    }
  }
}
