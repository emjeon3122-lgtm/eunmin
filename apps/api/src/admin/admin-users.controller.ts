import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedUser } from '../auth/jwt.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipResponseWrap } from '../common/decorators/skip-response-wrap.decorator';
import { AdminUsersService } from './admin-users.service';

const XLSX_UPLOAD = {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (err: Error | null, ok: boolean) => void) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      cb(new BadRequestException('엑셀(.xlsx) 파일만 올릴 수 있습니다.'), false);
      return;
    }
    cb(null, true);
  },
};

// 직원 명단 — Microsoft 365 로그인은 이 명단의 회사 이메일과 대조해 등록된 사람만 들인다.
@Controller('admin/users')
@AdminGuard()
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  // 현재 명단을 업로드 양식 그대로 내려받는다(비어 있으면 빈 양식).
  @Get('export')
  @SkipResponseWrap()
  async export(@Res() res: Response) {
    const buffer = await this.usersService.exportWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent('직원명단.xlsx')}"`);
    res.send(buffer);
  }

  // dryRun=true(기본)면 미리보기만, false면 오류가 없을 때 한 번에 반영한다.
  @Post('import')
  @UseInterceptors(FileInterceptor('file', XLSX_UPLOAD))
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('dryRun') dryRun: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('엑셀 파일을 선택해 주세요.');
    return this.usersService.import(file.buffer, dryRun !== 'false', user.id);
  }
}
