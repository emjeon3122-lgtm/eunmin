import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { SolapiAlimtalkAdapter } from './solapi-alimtalk.adapter';
import { MockVendorAdapter } from './mock-vendor.adapter';
import { VENDOR_ADAPTER } from './vendor-adapter.interface';

// VENDOR_ADAPTER env selects the implementation behind one injection token —
// swapping vendors/channels later is a one-line env change, no call-site changes.
@Module({
  imports: [ConfigModule],
  providers: [
    MockVendorAdapter,
    SolapiAlimtalkAdapter,
    {
      provide: VENDOR_ADAPTER,
      inject: [ConfigService, MockVendorAdapter, SolapiAlimtalkAdapter],
      useFactory: (
        config: ConfigService,
        mock: MockVendorAdapter,
        solapi: SolapiAlimtalkAdapter,
      ) => {
        const mode = config.get<AppConfig['vendorAdapter']>('app.vendorAdapter');
        return mode === 'kakao' ? solapi : mock;
      },
    },
  ],
  exports: [VENDOR_ADAPTER],
})
export class VendorModule {}
