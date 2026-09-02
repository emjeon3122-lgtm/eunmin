import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Real email/카카오 알림톡 sending is out of scope for now — this records the
  // in-app notification row the requester's UI reads. See docs/04 section 6/8.
  async notifyRequester(userId: string, requestId: string, message: string): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, requestId, channel: 'in_app', message, status: 'sent' },
    });
  }

  // "Admin" alerts have no dedicated admin-user routing rule yet, so fan out to
  // every admin as an in-app Notification row — see docs/01 section 3-4 (unconfirmed).
  async notifyAdmins(requestId: string | null, message: string): Promise<void> {
    const admins = await this.prisma.user.findMany({ where: { role: 'admin' } });
    if (admins.length === 0) {
      this.logger.warn(`관리자 계정이 없어 긴급 알림을 기록하지 못했습니다: ${message}`);
      return;
    }
    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        requestId,
        channel: 'in_app' as const,
        message,
        status: 'sent' as const,
      })),
    });
  }
}
