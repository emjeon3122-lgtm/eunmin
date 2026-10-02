import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException } from '../common/exceptions/api.exception';
import { VendorUpdateDto } from './dto/vendor-update.dto';

@Controller('admin/vendors')
@AdminGuard()
export class AdminVendorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundApiException('꽃집을 찾을 수 없습니다.');
    }
    return vendor;
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorUpdateDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundApiException('꽃집을 찾을 수 없습니다.');
    }
    return this.prisma.vendor.update({ where: { id }, data: dto });
  }
}
