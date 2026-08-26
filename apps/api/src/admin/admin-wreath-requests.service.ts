import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvalidStatusTransitionException, NotFoundApiException } from '../common/exceptions/api.exception';
import { ListAdminWreathRequestsQueryDto } from './dto/list-admin-wreath-requests.dto';
import { DeliveryStatusDto } from './dto/delivery-status.dto';

@Injectable()
export class AdminWreathRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // GET /api/admin/wreath-requests — filterable per the doc 03 section 2-4 wireframe.
  async list(query: ListAdminWreathRequestsQueryDto) {
    const where: Prisma.WreathRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.department) where.requester = { department: query.department };
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: endOfDay(query.to) } : {}),
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.wreathRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.size,
        take: query.size,
        // vendorStatusToken excluded — it's the vendor's unauthenticated
        // credential and has no reason to appear in an admin list table.
        select: {
          id: true,
          status: true,
          occasionType: true,
          requestType: true,
          recipientName: true,
          deliveryAddress: true,
          declaredAmount: true,
          requiresPreApproval: true,
          acceptedAt: true,
          completedAt: true,
          cancelledAt: true,
          cancelledReason: true,
          adminOverrideNote: true,
          createdAt: true,
          requester: { select: { name: true, department: true, employeeNo: true } },
        },
      }),
      this.prisma.wreathRequest.count({ where }),
    ]);
    return { items, total };
  }

  async cancel(id: string, reason: string) {
    const request = await this.prisma.wreathRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundApiException('신청을 찾을 수 없습니다.');
    }
    if (request.status === 'completed') {
      throw new InvalidStatusTransitionException('이미 완료된 신청은 취소할 수 없습니다.');
    }
    if (request.status === 'cancelled') {
      throw new InvalidStatusTransitionException('이미 취소된 신청입니다.');
    }

    const updated = await this.prisma.wreathRequest.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledReason: reason,
        cancelledAt: new Date(),
      },
    });
    await this.notificationsService.notifyRequester(
      updated.requesterId,
      updated.id,
      `관리자에 의해 신청이 취소되었습니다: ${reason}`,
    );
    return { id: updated.id, status: updated.status, cancelledAt: updated.cancelledAt };
  }

  // docs/04-backend-integration.md section 7 — manual override safety net for when
  // the vendor never clicks the one-touch link.
  async setDeliveryStatus(id: string, dto: DeliveryStatusDto) {
    const request = await this.prisma.wreathRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundApiException('신청을 찾을 수 없습니다.');
    }
    if (request.status === 'cancelled' || request.status === 'completed') {
      throw new InvalidStatusTransitionException(
        `이미 '${request.status}' 상태인 신청은 수동으로 변경할 수 없습니다.`,
      );
    }

    const updated = await this.prisma.wreathRequest.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === 'accepted' ? { acceptedAt: new Date() } : {}),
        ...(dto.status === 'completed'
          ? { completedAt: new Date(), vendorStatusToken: null }
          : {}),
        adminOverrideNote: dto.note,
      },
    });
    await this.notificationsService.notifyRequester(
      updated.requesterId,
      updated.id,
      `관리자가 상태를 '${dto.status}'로 수동 변경했습니다.`,
    );
    return { id: updated.id, status: updated.status, completedAt: updated.completedAt };
  }
}

function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}
