import { Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { existsSync } from 'fs';
import { FileUrlService } from './file-url.service';
import { STORAGE_SERVICE, StorageService } from './storage.service.interface';

// 저장 파일명은 항상 UUID + 허용 확장자다(local-storage.service). 이 형식만 받아서 경로
// 조작(../)을 원천 차단하고, 응답 타입도 이 확장자들로만 정해지게 한다.
const FILE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

@Controller('files')
export class FilesController {
  constructor(
    private readonly fileUrls: FileUrlService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Get(':name')
  serve(
    @Param('name') name: string,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ) {
    if (!FILE_NAME.test(name) || !this.fileUrls.verify(name, exp, sig)) {
      throw new ForbiddenException('만료되었거나 잘못된 파일 주소입니다. 화면을 새로고침해주세요.');
    }
    const path = this.storage.filePath(name);
    if (!existsSync(path)) {
      throw new NotFoundException('파일을 찾을 수 없습니다.');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(path);
  }
}
