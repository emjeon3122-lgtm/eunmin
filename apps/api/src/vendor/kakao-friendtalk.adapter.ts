import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { VendorAdapter, VendorMessagePayload, VendorTransmissionError } from './vendor-adapter.interface';

// docs/04-backend-integration.md section 2-2. Endpoint/field names are placeholders —
// must be replaced with the actual CPaaS (비즈엠/Solapi/NHN Cloud) API contract once
// selected (docs/01 section 3-2). Faithful to the sample; untested against a real API.
@Injectable()
export class KakaoFriendTalkAdapter implements VendorAdapter {
  private readonly apiKey: string;
  private readonly senderKey: string;
  private readonly apiBaseUrl: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<AppConfig['kakao']['apiKey']>('app.kakao.apiKey')!;
    this.senderKey = configService.get<AppConfig['kakao']['senderKey']>('app.kakao.senderKey')!;
    this.apiBaseUrl = configService.get<AppConfig['kakao']['apiBaseUrl']>('app.kakao.apiBaseUrl')!;
  }

  async send(payload: VendorMessagePayload): Promise<{ providerMessageId: string }> {
    const res = await fetch(`${this.apiBaseUrl}/friendtalk/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        senderKey: this.senderKey,
        to: payload.recipientPhone,
        content: this.buildMessageText(payload),
        buttons: [{ name: '주문 확인하기', type: 'WL', url: payload.statusLinkUrl }],
      }),
    });

    if (!res.ok) {
      throw new VendorTransmissionError(`전송 실패 (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return { providerMessageId: json.messageId };
  }

  private buildMessageText(p: VendorMessagePayload): string {
    return [
      '[화환 주문 안내]',
      `유형: ${occasionLabel(p.occasionType)}`,
      `장소: ${p.venueName}`,
      `배송지: ${p.deliveryAddress}`,
      `도착 희망: ${p.desiredArrivalAt}`,
      `리본 문구: ${p.ribbonMessage} / ${p.ribbonSenderText}`,
      '',
      '아래 버튼을 눌러 접수 확인 및 배송완료 처리를 해주세요.',
    ].join('\n');
  }
}

function occasionLabel(type: string) {
  return ({ wedding: '결혼', funeral: '부고', opening: '개업', etc: '기타' } as Record<string, string>)[type] ?? type;
}
