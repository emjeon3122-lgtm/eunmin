import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.types';
import { CreateWreathRequestDto, DuplicateCheckDto } from './dto/create-wreath-request.dto';
import { DuplicateCheckService } from './duplicate-check.service';
import { WreathRequestsService } from './wreath-requests.service';

@Controller('wreath-requests')
@UseGuards(JwtAuthGuard)
export class WreathRequestsController {
  constructor(
    private readonly wreathRequestsService: WreathRequestsService,
    private readonly duplicates: DuplicateCheckService,
  ) {}

  @Post()
  create(@Body() dto: CreateWreathRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.wreathRequestsService.create(dto, user.id);
  }

  // 신청서 마지막 단계 전에 같은 경조사 신청이 이미 있는지 미리 확인한다(제출 때도 다시 확인).
  @Post('duplicate-check')
  duplicateCheck(@Body() dto: DuplicateCheckDto) {
    return this.duplicates.check({ ...dto, desiredArrivalAt: new Date(dto.desiredArrivalAt) });
  }

  @Get()
  async list(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const { items, total } = await this.wreathRequestsService.findMine(user.id, query.page, query.size);
    return { data: items, meta: { total, page: query.page, size: query.size } };
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.wreathRequestsService.findOneForUser(id, user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.wreathRequestsService.cancel(id, user.id);
  }
}
