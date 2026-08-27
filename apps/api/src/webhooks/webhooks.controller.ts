import { Body, Controller, Headers, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { KakaoTransmissionCallbackDto } from './dto/kakao-transmission-callback.dto';
import { KakaoInboundPhotoDto } from './dto/kakao-inbound-photo.dto';
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

  // 2순위 사진 매칭 경로 — 꽃집이 원터치 링크 대신 카톡 채널 대화방에 사진을
  // 올렸을 때 CPaaS가 전달한다고 가정한 웹훅 (docs/08 신규 요구사항).
  @Post('kakao-inbound-photo')
  async handleKakaoInboundPhoto(
    @Body() body: KakaoInboundPhotoDto,
    @Headers('x-signature') signature: string | undefined,
    @Req() req: Request,
  ) {
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody || !this.webhooksService.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('서명이 유효하지 않습니다.');
    }
    return this.webhooksService.handleInboundPhoto(body);
  }
}
