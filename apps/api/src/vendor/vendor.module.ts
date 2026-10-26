import { Module } from '@nestjs/common';
import { IntegrationSettingsService } from '../settings/integration-settings.service';
import { SolapiAlimtalkAdapter } from './solapi-alimtalk.adapter';
import { MockVendorAdapter } from './mock-vendor.adapter';
import { VENDOR_ADAPTER, VendorAdapter, VendorMessagePayload } from './vendor-adapter.interface';

// 하나의 주입 토큰 뒤에서 구현체를 고른다. 어느 쪽을 쓸지는 관리자 화면의 연동 설정
// (기본값은 VENDOR_ADAPTER env)이 정하고, 발송할 때마다 현재 값을 읽으므로 재시작 없이 바뀐다.
@Module({
  providers: [
    MockVendorAdapter,
    SolapiAlimtalkAdapter,
    {
      provide: VENDOR_ADAPTER,
      inject: [IntegrationSettingsService, MockVendorAdapter, SolapiAlimtalkAdapter],
      useFactory: (
        settings: IntegrationSettingsService,
        mock: MockVendorAdapter,
        solapi: SolapiAlimtalkAdapter,
      ): VendorAdapter => ({
        send: (payload: VendorMessagePayload) =>
          (settings.get().vendor.adapter === 'kakao' ? solapi : mock).send(payload),
      }),
    },
  ],
  exports: [VENDOR_ADAPTER, SolapiAlimtalkAdapter],
})
export class VendorModule {}
