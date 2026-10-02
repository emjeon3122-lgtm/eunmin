import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { VendorModule } from '../vendor/vendor.module';
import { SendToVendorService } from './send-to-vendor.service';

@Module({
  imports: [VendorModule, NotificationsModule],
  providers: [SendToVendorService],
  exports: [SendToVendorService],
})
export class JobsModule {}
