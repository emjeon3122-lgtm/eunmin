import { Body, Controller, Headers, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { KakaoTransmissionCallbackDto } from './dto/kakao-transmission-callback.dto';
import { WebhooksService } from './webhooks.service';

// Auth here is HMAC signature verification (x-signature), not JWT — doc 02 section 1.
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('kakao-transmission')
  async handleKakaoTransmission(
    @Body() body: KakaoTransmissionCallbackDto,
    @Headers('x-signature') signature: string | undefined,
    @Req() req: Request,
  ) {
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody || !this.webhooksService.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('서명이 유효하지 않습니다.');
    }
    return this.webhooksService.handleKakaoTransmission(body);
  }
}
