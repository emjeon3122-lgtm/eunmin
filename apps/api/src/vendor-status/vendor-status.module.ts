import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { VendorStatusController } from './vendor-status.controller';
import { VendorStatusService } from './vendor-status.service';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [VendorStatusController],
  providers: [VendorStatusService],
})
export class VendorStatusModule {}
