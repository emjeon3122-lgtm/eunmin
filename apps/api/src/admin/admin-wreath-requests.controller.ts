import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AdminWreathRequestsService } from './admin-wreath-requests.service';
import { ListAdminWreathRequestsQueryDto } from './dto/list-admin-wreath-requests.dto';
import { AdminCancelDto } from './dto/admin-cancel.dto';
import { DeliveryStatusDto } from './dto/delivery-status.dto';

@Controller('admin/wreath-requests')
@AdminGuard()
export class AdminWreathRequestsController {
  constructor(private readonly service: AdminWreathRequestsService) {}

  @Get()
  async list(@Query() query: ListAdminWreathRequestsQueryDto) {
    const { items, total } = await this.service.list(query);
    return { data: items, meta: { total, page: query.page, size: query.size } };
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminCancelDto) {
    return this.service.cancel(id, dto.reason);
  }

  @Patch(':id/delivery-status')
  setDeliveryStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliveryStatusDto) {
    return this.service.setDeliveryStatus(id, dto);
  }
}
