import { Body, Controller, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

// 솔라피 콘솔의 웹훅(메시지 리포트) URL에 https://<도메인>/api/webhooks/solapi/<비밀값>을 등록한다.
// 비밀값이 틀리거나 설정되지 않았으면 경로가 없는 것처럼 404로 답한다.
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('solapi/:token')
  @HttpCode(200)
  handleSolapiReport(@Param('token') token: string, @Body() body: unknown) {
    if (!this.webhooksService.isAuthorized(token)) {
      throw new NotFoundException();
    }
    return this.webhooksService.handleSolapiReport(body);
  }
}
