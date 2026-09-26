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

  // 아래 조회/읽음 처리는 전부 userId로 범위를 좁힌다 — 다른 사람 알림은 보이지도,
  // 읽음 처리되지도 않는다.
  async listForUser(userId: string, limit: number) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { sentAt: 'desc' },
        take: limit,
        select: { id: true, requestId: true, message: true, sentAt: true, readAt: true },
      }),
      this.countUnread(userId),
    ]);
    return { items, unreadCount };
  }

  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
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
