import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@Query() query: ListNotificationsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const { items, unreadCount } = await this.notificationsService.listForUser(user.id, query.limit);
    return { data: items, meta: { unreadCount } };
  }

  // 상단 메뉴 배지가 화면 이동마다 호출하므로 목록 없이 개수만 돌려준다.
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { unreadCount: await this.notificationsService.countUnread(user.id) };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    return { updated: await this.notificationsService.markAllRead(user.id) };
  }
}
