import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PHOTO_UPLOAD_OPTIONS } from '../common/file-validation';
import { ParseInvitationDto } from './dto/parse-invitation.dto';
import { INVITATION_PARSER, InvitationParserAdapter, ParsedInvitationFields } from './invitation-parser.interface';

const MAX_INVITATION_IMAGES = 2;

// POST /api/invitation-parser/parse — 신규 요구사항 Section 4 "URL 파싱 or 이미지 OCR
// (선택 입력)". 신청서 작성 중에 호출하는 보조 기능이라 로그인은 필요하지만
// 별도 order_id 없이 동작한다(파싱 결과를 신청서 초안에 채워 넣는 용도).
@Controller('invitation-parser')
@UseGuards(JwtAuthGuard)
export class InvitationParserController {
  constructor(@Inject(INVITATION_PARSER) private readonly parser: InvitationParserAdapter) {}

  @Post('parse')
  @UseInterceptors(FilesInterceptor('images', MAX_INVITATION_IMAGES, PHOTO_UPLOAD_OPTIONS))
  async parse(
    @Body() dto: ParseInvitationDto,
    @UploadedFiles() images: Express.Multer.File[] = [],
  ): Promise<{ data: ParsedInvitationFields; matched: boolean }> {
    if (!dto.url && images.length === 0) {
      throw new BadRequestException('청첩장/부고장 URL 또는 이미지를 1장 이상 첨부해주세요.');
    }

    // 이미지가 있으면 이미지(OCR) 결과를 우선하고, URL 결과로 빈 필드만 보충한다.
    const [urlResult, imageResult] = await Promise.all([
      dto.url ? this.parser.parseUrl(dto.url) : Promise.resolve<ParsedInvitationFields>({}),
      images.length > 0 ? this.parser.parseImages(images) : Promise.resolve<ParsedInvitationFields>({}),
    ]);
    const merged: ParsedInvitationFields = { ...urlResult, ...imageResult };
    const matched = Object.values(merged).some((v) => v !== undefined && v !== '');

    return { data: merged, matched };
  }
}
