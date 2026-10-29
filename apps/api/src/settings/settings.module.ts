import { Global, Module } from '@nestjs/common';
import { IntegrationSettingsService } from './integration-settings.service';

// 어디서나 현재 연동 설정을 읽을 수 있게 전역으로 둔다(auth·vendor·invitation-parser·webhooks).
@Global()
@Module({
  providers: [IntegrationSettingsService],
  exports: [IntegrationSettingsService],
})
export class SettingsModule {}
