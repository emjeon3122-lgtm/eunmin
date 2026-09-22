import { Inject, Injectable } from '@nestjs/common';
import { RequestStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service.interface';
import { InvalidStatusTransitionException, NotFoundApiException } from '../common/exceptions/api.exception';

type NextAction = 'accept' | 'complete' | null;

// docs/04-backend-integration.md section 6. No auth guard — the token itself is the
// credential, matching wreath_requests.vendor_status_token (unique, nullable).
@Injectable()
export class VendorStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async getStatus(token: string) {
    const request = await this.loadByToken(token);
    // 청첩장/부고장 원본은 꽃집이 배송 정보를 대조하는 용도로만 함께 내려준다.
    // 사진은 알림톡 본문에 실을 수 없어 이 페이지에서만 볼 수 있다.
    const invitationPhotos = await this.prisma.attachment.findMany({
      where: { invitationForId: request.id },
      orderBy: { uploadedAt: 'asc' },
    });
    return {
      occasionType: request.occasionType,
      desiredArrivalAt: request.desiredArrivalAt,
      ribbonMessage: request.ribbonMessage,
      status: request.status,
      nextAction: this.nextActionFor(request.status),
      invitationUrl: request.invitationUrl,
      invitationPhotoUrls: invitationPhotos.map((p) => p.fileUrl),
    };
  }

  async accept(token: string) {
    const request = await this.loadByToken(token);
    this.assertTransition(request.status, 'submitted_to_vendor', 'accept');

    const updated = await this.prisma.wreathRequest.update({
      where: { id: request.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });
    await this.notificationsService.notifyRequester(
      request.requesterId,
      request.id,
      '꽃집에서 화환 주문을 접수했습니다.',
    );
    return { status: updated.status, nextAction: 'complete' as NextAction };
  }

  async complete(token: string, photos: Express.Multer.File[]) {
    const request = await this.loadByToken(token);
    this.assertTransition(request.status, 'accepted', 'complete');
    if (photos.length === 0) {
      throw new InvalidStatusTransitionException('배송완료 사진을 1장 이상 첨부해주세요.');
    }

    // 여러 장을 각각 별도 Attachment로 저장하고 모두 이 신청에 연결한다
    // (docs/02 amendment: 배송완료 사진 여러 장 업로드 허용).
    await Promise.all(
      photos.map(async (photo) => {
        const { fileUrl } = await this.storage.save(photo);
        return this.prisma.attachment.create({
          data: {
            fileName: photo.originalname,
            fileUrl,
            mimeType: photo.mimetype,
            type: 'delivery_completion_photo',
            uploaderType: 'vendor',
            completionForId: request.id,
          },
        });
      }),
    );

    const updated = await this.prisma.wreathRequest.update({
      where: { id: request.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        vendorStatusToken: null, // 완료 즉시 토큰 만료 → 링크 재사용/재접근 방지
      },
    });
    await this.notificationsService.notifyRequester(
      request.requesterId,
      request.id,
      '화환 배송이 완료되었습니다.',
    );
    return { status: updated.status, completedAt: updated.completedAt };
  }

  private async loadByToken(token: string) {
    const request = await this.prisma.wreathRequest.findUnique({ where: { vendorStatusToken: token } });
    if (!request) {
      throw new NotFoundApiException('만료되었거나 존재하지 않는 링크입니다.');
    }
    return request;
  }

  private nextActionFor(status: string): NextAction {
    if (status === 'submitted_to_vendor') return 'accept';
    if (status === 'accepted') return 'complete';
    return null;
  }

  private assertTransition(current: string, required: RequestStatus, action: string) {
    if (current !== required) {
      throw new InvalidStatusTransitionException(
        `이미 처리되었거나 아직 처리할 수 없는 단계입니다. (요청: ${action}, 현재 상태: ${current})`,
      );
    }
  }
}
