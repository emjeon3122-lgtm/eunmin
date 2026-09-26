import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { SkipResponseWrap } from '../common/decorators/skip-response-wrap.decorator';
import { AdminExportService } from './admin-export.service';
import { ExportQueryDto } from './dto/export-query.dto';

@Controller('admin/export')
@AdminGuard()
export class AdminExportController {
  constructor(private readonly exportService: AdminExportService) {}

  // GET /api/admin/export — doc 02 section 3-10. Binary xlsx stream, so this
  // handler writes the response itself and opts out of the { data: ... } wrap.
  @Get()
  @SkipResponseWrap()
  async export(@Query() query: ExportQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.exportService.buildWorkbook(query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }
}
