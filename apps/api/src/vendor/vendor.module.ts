import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { KakaoFriendTalkAdapter } from './kakao-friendtalk.adapter';
import { MockVendorAdapter } from './mock-vendor.adapter';
import { VENDOR_ADAPTER } from './vendor-adapter.interface';

// VENDOR_ADAPTER env selects the implementation behind one injection token —
// swapping vendors/channels later is a one-line env change, no call-site changes.
@Module({
  imports: [ConfigModule],
  providers: [
    MockVendorAdapter,
    KakaoFriendTalkAdapter,
    {
      provide: VENDOR_ADAPTER,
      inject: [ConfigService, MockVendorAdapter, KakaoFriendTalkAdapter],
      useFactory: (
        config: ConfigService,
        mock: MockVendorAdapter,
        kakao: KakaoFriendTalkAdapter,
      ) => {
        const mode = config.get<AppConfig['vendorAdapter']>('app.vendorAdapter');
        return mode === 'kakao' ? kakao : mock;
      },
    },
  ],
  exports: [VENDOR_ADAPTER],
})
export class VendorModule {}
