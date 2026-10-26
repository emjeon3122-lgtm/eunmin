import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { WreathRequestsController } from './wreath-requests.controller';
import { WreathRequestsService } from './wreath-requests.service';
import { DuplicateCheckService } from './duplicate-check.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, JobsModule, StorageModule, NotificationsModule],
  controllers: [WreathRequestsController],
  providers: [WreathRequestsService, DuplicateCheckService],
  exports: [WreathRequestsService, DuplicateCheckService],
})
export class WreathRequestsModule {}
