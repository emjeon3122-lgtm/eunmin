import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { VendorAdapter, VendorMessagePayload, VendorTransmissionError } from './vendor-adapter.interface';

// CPaaS 대행사로 Solapi(알림톡)를 선정 — docs/01 section 3-2에서 미정이었던 항목이
// 확정됨에 따라 친구톡 대신 알림톡으로 전환한다. 알림톡은 사전 심사된 템플릿(templateId)의
// 변수만 채워서 보낼 수 있고(자유 문구 불가), 발송 실패 시 대행사가 자동으로 SMS로
// 대체발송하므로 vendors.fallback_channel 기본값도 manual_admin_alert에서 sms로 바꿨다
// (docs/01 section 1-1 각주 참고 — 이 리스크가 알림톡을 쓰면 사라진다).
//
// 실제 Solapi Alimtalk 발송 API(https://docs.solapi.com)의 정확한 요청/응답 필드는
// 이 코드 작성 시점에 계약이 확정되지 않아 검증하지 못했다 — 아래는 Solapi 문서 구조를
// 최대한 따른 추정치이며, 실제 연동 전 반드시 공식 문서로 교체해야 한다.
//
// 보안 경계: VendorMessagePayload(vendor-adapter.interface.ts)에는 사번/부서/비용코드 등
// 사내 전용 필드가 애초에 존재하지 않는다 — 꽃집에게는 배송에 필요한 정보만 전달한다는
// 원칙(신규 요구사항 3장)을 인터페이스 타입 자체로 강제하기 위함이며, 이 어댑터가 새
// 필드를 추가로 조합해 보내는 일이 없도록 주의해야 한다.
@Injectable()
export class SolapiAlimtalkAdapter implements VendorAdapter {
  private readonly apiKey: string;
  private readonly senderKey: string; // Solapi 발신프로필 키(pfId)
  private readonly apiBaseUrl: string;
  private readonly templateId: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<AppConfig['kakao']['apiKey']>('app.kakao.apiKey')!;
    this.senderKey = configService.get<AppConfig['kakao']['senderKey']>('app.kakao.senderKey')!;
    this.apiBaseUrl = configService.get<AppConfig['kakao']['apiBaseUrl']>('app.kakao.apiBaseUrl')!;
    this.templateId = configService.get<AppConfig['kakao']['templateId']>('app.kakao.templateId')!;
  }

  async send(payload: VendorMessagePayload): Promise<{ providerMessageId: string }> {
    const res = await fetch(`${this.apiBaseUrl}/alimtalk/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        to: payload.vendorPhone,
        kakaoOptions: {
          pfId: this.senderKey,
          templateId: this.templateId,
          // 사전 심사된 템플릿의 변수명에 맞춰야 한다 — 실제 변수명은 템플릿 등록 시 확정.
          // 주문 정보 입력 화면(신청서 4단계)에서 받은 배송 관련 정보는 전부 포함하되,
          // 사번/부서/고객사/비용코드 등 내부 전용 정보는 VendorMessagePayload 타입
          // 자체에 없으므로(vendor-adapter.interface.ts 참고) 여기서도 보낼 수 없다.
          variables: {
            '#{occasionType}': occasionLabel(payload.occasionType) + subOccasionLabel(payload),
            '#{recipientName}': payload.recipientName,
            '#{recipientPhone}': payload.recipientPhone,
            '#{ordererPhone}': payload.ordererPhone,
            '#{deliveryAddress}': payload.deliveryAddress,
            '#{deliveryDetail}': payload.deliveryDetail ?? '',
            '#{desiredArrivalAt}': payload.desiredArrivalAt,
            '#{ribbonMessage}': payload.ribbonMessage,
            '#{ribbonSenderText}': payload.ribbonSenderText,
            '#{memo}': payload.memo ?? '',
          },
          buttons: [{ name: '주문 확인하기', type: 'WL', url: payload.statusLinkUrl }],
          disableSms: false, // 알림톡 실패 시 자동 SMS 대체발송 (알림톡을 선택한 핵심 이유)
        },
      }),
    });

    if (!res.ok) {
      throw new VendorTransmissionError(`전송 실패 (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return { providerMessageId: json.messageId };
  }
}

function occasionLabel(type: string) {
  return (
    { wedding: '결혼', funeral: '부고', opening: '개업', promotion: '승진', etc: '기타' } as Record<string, string>
  )[type] ?? type;
}

// 결혼(신랑측/신부측)·개업·승진(동양란/서양란)처럼 상품 준비에 영향을 주는
// 세부 선택지를 괄호로 덧붙인다 — 없으면 빈 문자열.
function subOccasionLabel(payload: Pick<VendorMessagePayload, 'weddingSide' | 'orchidType'>) {
  if (payload.weddingSide) {
    return ` (${{ groom: '신랑측', bride: '신부측' }[payload.weddingSide] ?? payload.weddingSide})`;
  }
  if (payload.orchidType) {
    return ` (${{ oriental: '동양란', western: '서양란' }[payload.orchidType] ?? payload.orchidType})`;
  }
  return '';
}
