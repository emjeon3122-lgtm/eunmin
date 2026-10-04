import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WreathRequest } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SendToVendorService } from '../jobs/send-to-vendor.service';
import { FileUrlService } from '../storage/file-url.service';
import {
  InvalidStatusTransitionException,
  NotFoundApiException,
  PreApprovalAttachmentRequiredException,
} from '../common/exceptions/api.exception';
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
    private readonly sendToVendorService: SendToVendorService,
    private readonly fileUrls: FileUrlService,
  ) {}

  // docs/02-api-spec.md section 3-1 + docs/04 section 3.
  // 사전승인 게이팅 기준: 신청자(requester)의 파트너 여부(User.isPartner).
  // 기존 금액 기준 approval_rules 엔진은 더 이상 이 흐름에서 쓰지 않는다 —
  // 관리자 화면/테이블 자체는 남겨뒀지만 제출 시 참조하지 않는다.
  async create(dto: CreateWreathRequestDto, requesterId: string) {
    // 이미 같은 화면에서 제출된 신청이면 새로 만들지 않고 그대로 돌려준다 — 이 경우
    // 꽃집 발송도 다시 일어나지 않는다.
    const existing = await this.findByClientRequestId(requesterId, dto.clientRequestId);
    if (existing) return toCreateResponse(existing);

    const requester = await this.prisma.user.findUniqueOrThrow({ where: { id: requesterId } });
    const requiresPreApproval = !requester.isPartner;

    if (requiresPreApproval && !dto.attachmentId) {
      throw new PreApprovalAttachmentRequiredException(
        '파트너 승인 증빙을 첨부해 주세요.',
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

    let request: WreathRequest;
    try {
      request = await this.prisma.wreathRequest.create({
        data: {
          requesterId,
          clientRequestId: dto.clientRequestId,
          requestType: dto.requestType,
          occasionType: dto.occasionType,
          weddingSide: dto.weddingSide,
          orchidType: dto.orchidType,
          recipientName: dto.recipientName,
          recipientPhone: dto.recipientPhone,
          ordererPhone: dto.ordererPhone,
          deliveryAddress: dto.deliveryAddress,
          deliveryDetail: dto.deliveryDetail,
          desiredArrivalAt: new Date(dto.desiredArrivalAt),
          ribbonMessage: dto.ribbonMessage,
          ribbonSenderText: dto.ribbonSenderText,
          declaredAmount: dto.declaredAmount ?? null,
          memo: dto.memo,
          invitationUrl: dto.invitationUrl,
          clientName: dto.clientName,
          contractType: dto.contractType,
          serviceName: dto.serviceName,
          sendReason: dto.sendReason,
          costCode: dto.costCode,
          requiresPreApproval,
          attachmentId: dto.attachmentId ?? null,
          status: 'submitted',
          vendorId,
          productId: dto.productId ?? null,
          vendorStatusToken: generateVendorStatusToken(),
        },
      });
    } catch (err) {
      // 두 요청이 거의 동시에 들어와 앞선 요청이 먼저 저장된 경우 — 그 신청을 돌려준다.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.findByClientRequestId(requesterId, dto.clientRequestId);
        if (winner) return toCreateResponse(winner);
      }
      throw err;
    }

    // 청첩장 사진은 자동 채우기 단계에서 이미 저장돼 있으므로 신청서에 연결만 한다.
    // where 조건으로 "본인이 올린, 아직 어느 신청에도 붙지 않은 청첩장 사진"만
    // 걸러내 — 남의 첨부나 승인 증빙 id를 넣어도 아무것도 연결되지 않는다.
    if (dto.invitationAttachmentIds?.length) {
      await this.prisma.attachment.updateMany({
        where: {
          id: { in: dto.invitationAttachmentIds },
          type: 'invitation_photo',
          uploadedById: requesterId,
          invitationForId: null,
        },
        data: { invitationForId: request.id },
      });
    }

    // 커밋 후 비동기로 발송 트리거 — 응답을 막지 않는다. 실패해도 프로세스가
    // 죽지 않도록 반드시 여기서 catch한다 (unhandled rejection 방지).
    this.sendToVendorService.handle(request.id).catch((err) => {
      this.logger.error(`send-to-vendor 비동기 처리 실패 (requestId=${request.id})`, err);
    });

    return toCreateResponse(request);
  }

  private findByClientRequestId(requesterId: string, clientRequestId: string | undefined) {
    if (!clientRequestId) return null;
    return this.prisma.wreathRequest.findUnique({
      where: { requesterId_clientRequestId: { requesterId, clientRequestId } },
    });
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
    // 취소와 동시에 꽃집 링크도 만료시킨다 — 취소된 주문 내용·청첩장을 꽃집이
    // 다시 열어볼 수 없어야 한다(배송완료 시 만료와 같은 원칙).
    const updated = await this.prisma.wreathRequest.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledById: requesterId,
        cancelledAt: new Date(),
        vendorStatusToken: null,
      },
    });
    return { id: updated.id, status: updated.status, cancelledAt: updated.cancelledAt };
  }

  // Shared shape builder for GET /api/wreath-requests/{id} (doc 02 section 3-4)
  // reused by the admin detail view too.
  async toDetail(request: { id: string; [key: string]: any }) {
    const [latestTransmission, completionPhotos, invitationPhotos] = await Promise.all([
      this.prisma.orderTransmission.findFirst({
        where: { requestId: request.id },
        orderBy: { attemptedAt: 'desc' },
      }),
      this.prisma.attachment.findMany({
        where: { completionForId: request.id },
        orderBy: { uploadedAt: 'asc' },
      }),
      this.prisma.attachment.findMany({
        where: { invitationForId: request.id },
        orderBy: { uploadedAt: 'asc' },
      }),
    ]);

    return {
      id: request.id,
      status: request.status,
      occasionType: request.occasionType,
      weddingSide: request.weddingSide,
      orchidType: request.orchidType,
      requestType: request.requestType,
      recipientName: request.recipientName,
      recipientPhone: request.recipientPhone,
      ordererPhone: request.ordererPhone,
      deliveryAddress: request.deliveryAddress,
      deliveryDetail: request.deliveryDetail,
      desiredArrivalAt: request.desiredArrivalAt,
      ribbonMessage: request.ribbonMessage,
      ribbonSenderText: request.ribbonSenderText,
      declaredAmount: request.declaredAmount,
      memo: request.memo,
      invitationUrl: request.invitationUrl,
      clientName: request.clientName,
      contractType: request.contractType,
      serviceName: request.serviceName,
      sendReason: request.sendReason,
      costCode: request.costCode,
      requiresPreApproval: request.requiresPreApproval,
      vendorTransmission: latestTransmission
        ? { status: latestTransmission.status, attemptedAt: latestTransmission.attemptedAt }
        : null,
      acceptedAt: request.acceptedAt,
      completedAt: request.completedAt,
      completionPhotoUrls: completionPhotos.map((p) => this.fileUrls.sign(p.fileUrl)!),
      invitationPhotoUrls: invitationPhotos.map((p) => this.fileUrls.sign(p.fileUrl)!),
      adminOverrideNote: request.adminOverrideNote,
      cancelledReason: request.cancelledReason,
      cancelledAt: request.cancelledAt,
      createdAt: request.createdAt,
    };
  }
}

function toCreateResponse(request: WreathRequest) {
  return {
    id: request.id,
    status: request.status,
    requiresPreApproval: request.requiresPreApproval,
    createdAt: request.createdAt,
  };
}
