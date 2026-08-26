import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.types';
import { AttachmentsService } from './attachments.service';

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  // POST /api/attachments (multipart/form-data, field: file) — doc 02 section 3-3.
  // Always uploaded by an authenticated employee as pre-approval proof; the
  // vendor's delivery-completion photo goes through /api/vendor-status instead.
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) {
      throw new BadRequestException('업로드할 파일이 필요합니다.');
    }
    const attachment = await this.attachmentsService.upload(
      file,
      'pre_approval_proof',
      'employee',
      user.id,
    );
    return { attachmentId: attachment.id, fileName: attachment.fileName };
  }
}
