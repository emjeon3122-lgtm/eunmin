import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WreathRequestsService } from '../wreath-requests/wreath-requests.service';
import { InvalidStatusTransitionException, NotFoundApiException } from '../common/exceptions/api.exception';
import { ListAdminWreathRequestsQueryDto } from './dto/list-admin-wreath-requests.dto';
import { DeliveryStatusDto } from './dto/delivery-status.dto';

@Injectable()
export class AdminWreathRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly wreathRequestsService: WreathRequestsService,
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
    // Flatten requester.{name,department} to top-level requesterName/department
    // to match the admin detail endpoint's shape (and the doc 03 §2-4 table columns).
    const flattened = items.map(({ requester, ...rest }) => ({
      ...rest,
      requesterName: requester.name,
      department: requester.department,
      requesterEmployeeNo: requester.employeeNo,
    }));
    return { items: flattened, total };
  }

  // GET /api/admin/wreath-requests/{id} — admin detail view (doc 03 section
  // 2-5): the employee-facing detail shape plus requester identity, the
  // pre-approval attachment link, and the full transmission log (not just
  // the latest attempt).
  async findOneForAdmin(id: string) {
    const request = await this.prisma.wreathRequest.findUnique({
      where: { id },
      include: { requester: true, attachment: true },
    });
    if (!request) {
      throw new NotFoundApiException('신청을 찾을 수 없습니다.');
    }

    const [detail, transmissions] = await Promise.all([
      this.wreathRequestsService.toDetail(request),
      this.prisma.orderTransmission.findMany({
        where: { requestId: id },
        orderBy: { attemptedAt: 'desc' },
      }),
    ]);

    return {
      ...detail,
      requesterName: request.requester.name,
      department: request.requester.department,
      attachmentUrl: request.attachment?.fileUrl ?? null,
      attachmentFileName: request.attachment?.fileName ?? null,
      orderTransmissions: transmissions.map((t) => ({
        id: t.id,
        channel: t.channel,
        status: t.status,
        providerMessageId: t.providerMessageId,
        responseBody: t.responseBody,
        attemptedAt: t.attemptedAt,
      })),
    };
  }

  // GET /api/admin/unmatched-photos — photos that arrived via the 2순위 카톡
  // 웹훅 경로 (webhooks.service.ts handleInboundPhoto) when 0 or 2+ "accepted"
  // orders existed for that vendor at once, so the system refused to guess.
  async listUnmatchedPhotos() {
    return this.prisma.attachment.findMany({
      where: { type: 'delivery_completion_photo', completionForId: null },
      orderBy: { uploadedAt: 'desc' },
      select: { id: true, fileName: true, fileUrl: true, uploadedAt: true },
    });
  }

  // PATCH /api/admin/wreath-requests/{id}/attach-photo — admin manually resolves
  // an unmatched photo (see listUnmatchedPhotos) onto the correct request.
  async attachPhoto(id: string, attachmentId: string) {
    const request = await this.prisma.wreathRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundApiException('신청을 찾을 수 없습니다.');
    }
    if (request.status !== 'accepted' && request.status !== 'completed') {
      throw new InvalidStatusTransitionException(
        '접수 확인되었거나 이미 완료된 신청에만 사진을 연결할 수 있습니다.',
      );
    }

    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.type !== 'delivery_completion_photo') {
      throw new NotFoundApiException('사진을 찾을 수 없습니다.');
    }
    if (attachment.completionForId) {
      throw new InvalidStatusTransitionException('이미 다른 신청에 연결된 사진입니다.');
    }

    await this.prisma.attachment.update({ where: { id: attachmentId }, data: { completionForId: id } });

    if (request.status === 'accepted') {
      const updated = await this.prisma.wreathRequest.update({
        where: { id },
        data: { status: 'completed', completedAt: new Date(), vendorStatusToken: null },
      });
      await this.notificationsService.notifyRequester(
        updated.requesterId,
        updated.id,
        '화환 배송이 완료되었습니다.',
      );
      return { id: updated.id, status: updated.status, completedAt: updated.completedAt };
    }
    return { id: request.id, status: request.status, completedAt: request.completedAt };
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
