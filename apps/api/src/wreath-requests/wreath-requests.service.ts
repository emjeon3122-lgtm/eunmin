import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalRulesService } from '../approval-rules/approval-rules.service';
import { SendToVendorService } from '../jobs/send-to-vendor.service';
import {
  InvalidStatusTransitionException,
  NotFoundApiException,
  PreApprovalAttachmentRequiredException,
} from '../common/exceptions/api.exception';
import { formatKrw, occasionLabel } from '../common/occasion-label';
import { CreateWreathRequestDto } from './dto/create-wreath-request.dto';

// docs/04-backend-integration.md section 3 — 추측 불가능한 43자 URL-safe 토큰.
function generateVendorStatusToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class WreathRequestsService {
  private readonly logger = new Logger(WreathRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalRulesService: ApprovalRulesService,
    private readonly sendToVendorService: SendToVendorService,
  ) {}

  // docs/02-api-spec.md section 3-1 + docs/04 section 3.
  async create(dto: CreateWreathRequestDto, requesterId: string) {
    const ruleCheck = await this.approvalRulesService.check(dto.occasionType, dto.declaredAmount);

    if (ruleCheck.requiresPreApproval && !dto.attachmentId) {
      const rule = ruleCheck.matchedRule!;
      throw new PreApprovalAttachmentRequiredException(
        `${occasionLabel(dto.occasionType)}(${formatKrw(rule.minAmount)}원 이상) 유형은 본부장 사전승인 증빙 첨부가 필요합니다.`,
      );
    }

    let vendorId: string | null = null;
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
      if (product) {
        vendorId = product.vendorId;
      }
    }
    if (!vendorId) {
      // 계약 꽃집이 1곳뿐이므로(docs/01 section 2-1), 상품을 지정하지 않았을 때도
      // 신청이 갈 곳을 항상 정할 수 있도록 활성 vendor를 기본값으로 사용한다.
      const defaultVendor = await this.prisma.vendor.findFirst({ where: { isActive: true } });
      vendorId = defaultVendor?.id ?? null;
    }

    const request = await this.prisma.wreathRequest.create({
      data: {
        requesterId,
        requestType: dto.requestType,
        occasionType: dto.occasionType,
        recipientName: dto.recipientName,
        recipientPhone: dto.recipientPhone,
        venueName: dto.venueName,
        deliveryAddress: dto.deliveryAddress,
        deliveryDetail: dto.deliveryDetail,
        desiredArrivalAt: new Date(dto.desiredArrivalAt),
        ribbonMessage: dto.ribbonMessage,
        ribbonSenderText: dto.ribbonSenderText,
        declaredAmount: dto.declaredAmount,
        memo: dto.memo,
        requiresPreApproval: ruleCheck.requiresPreApproval,
        attachmentId: dto.attachmentId ?? null,
        status: 'submitted',
        vendorId,
        productId: dto.productId ?? null,
        vendorStatusToken: generateVendorStatusToken(),
      },
    });

    // 커밋 후 비동기로 발송 트리거 — 응답을 막지 않는다. 실패해도 프로세스가
    // 죽지 않도록 반드시 여기서 catch한다 (unhandled rejection 방지).
    this.sendToVendorService.handle(request.id).catch((err) => {
      this.logger.error(`send-to-vendor 비동기 처리 실패 (requestId=${request.id})`, err);
    });

    return {
      id: request.id,
      status: request.status,
      requiresPreApproval: request.requiresPreApproval,
      createdAt: request.createdAt,
    };
  }

  async findMine(requesterId: string, page: number, size: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wreathRequest.findMany({
        where: { requesterId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        // Excludes vendorStatusToken — that's the vendor's unauthenticated
        // credential and must never reach the requester's own list view either.
        select: {
          id: true,
          status: true,
          occasionType: true,
          requestType: true,
          recipientName: true,
          venueName: true,
          desiredArrivalAt: true,
          declaredAmount: true,
          requiresPreApproval: true,
          acceptedAt: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
      }),
      this.prisma.wreathRequest.count({ where: { requesterId } }),
    ]);
    return { items, total };
  }

  async findOneForUser(id: string, requesterId: string) {
    const request = await this.prisma.wreathRequest.findUnique({ where: { id } });
    if (!request || request.requesterId !== requesterId) {
      throw new NotFoundApiException('신청을 찾을 수 없습니다.');
    }
    return this.toDetail(request);
  }

  async cancel(id: string, requesterId: string) {
    const request = await this.prisma.wreathRequest.findUnique({ where: { id } });
    if (!request || request.requesterId !== requesterId) {
      throw new NotFoundApiException('신청을 찾을 수 없습니다.');
    }
    // 신청자 자진 취소는 꽃집이 "접수 확인"을 누르기 전까지(submitted/submitted_to_vendor)
    // 계속 허용한다 — 메시지가 이미 전송됐어도 꽃집이 아직 확인 전이면 취소 가능.
    if (request.status === 'accepted' || request.status === 'completed' || request.status === 'cancelled') {
      throw new InvalidStatusTransitionException(
        '이미 꽃집이 접수한 신청은 직접 취소할 수 없습니다. 관리자에게 문의해주세요.',
      );
    }
    const updated = await this.prisma.wreathRequest.update({
      where: { id },
      data: { status: 'cancelled', cancelledById: requesterId, cancelledAt: new Date() },
    });
    return { id: updated.id, status: updated.status, cancelledAt: updated.cancelledAt };
  }

  // Shared shape builder for GET /api/wreath-requests/{id} (doc 02 section 3-4)
  // reused by the admin detail view too.
  async toDetail(request: { id: string; [key: string]: any }) {
    const [latestTransmission, completionPhotos] = await Promise.all([
      this.prisma.orderTransmission.findFirst({
        where: { requestId: request.id },
        orderBy: { attemptedAt: 'desc' },
      }),
      this.prisma.attachment.findMany({
        where: { completionForId: request.id },
        orderBy: { uploadedAt: 'asc' },
      }),
    ]);

    return {
      id: request.id,
      status: request.status,
      occasionType: request.occasionType,
      requestType: request.requestType,
      recipientName: request.recipientName,
      recipientPhone: request.recipientPhone,
      venueName: request.venueName,
      deliveryAddress: request.deliveryAddress,
      deliveryDetail: request.deliveryDetail,
      desiredArrivalAt: request.desiredArrivalAt,
      ribbonMessage: request.ribbonMessage,
      ribbonSenderText: request.ribbonSenderText,
      declaredAmount: request.declaredAmount,
      memo: request.memo,
      requiresPreApproval: request.requiresPreApproval,
      vendorTransmission: latestTransmission
        ? { status: latestTransmission.status, attemptedAt: latestTransmission.attemptedAt }
        : null,
      acceptedAt: request.acceptedAt,
      completedAt: request.completedAt,
      completionPhotoUrls: completionPhotos.map((p) => p.fileUrl),
      adminOverrideNote: request.adminOverrideNote,
      cancelledReason: request.cancelledReason,
      cancelledAt: request.cancelledAt,
      createdAt: request.createdAt,
    };
  }
}
