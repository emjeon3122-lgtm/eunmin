import { Controller, Get } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AdminWreathRequestsService } from './admin-wreath-requests.service';

// 2순위 카톡 사진 매칭 경로(webhooks.service.ts handleInboundPhoto)에서
// 자동으로 연결하지 못하고 남겨둔 사진들 — 관리자가 수동으로 연결한다
// (PATCH /api/admin/wreath-requests/{id}/attach-photo).
@Controller('admin/unmatched-photos')
@AdminGuard()
export class AdminUnmatchedPhotosController {
  constructor(private readonly service: AdminWreathRequestsService) {}

  @Get()
  list() {
    return this.service.listUnmatchedPhotos();
  }
}
