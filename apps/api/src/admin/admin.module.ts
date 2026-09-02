import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WreathRequestsModule } from '../wreath-requests/wreath-requests.module';
import { AdminWreathRequestsController } from './admin-wreath-requests.controller';
import { AdminWreathRequestsService } from './admin-wreath-requests.service';
import { AdminExportController } from './admin-export.controller';
import { AdminExportService } from './admin-export.service';
import { AdminVendorsController } from './admin-vendors.controller';
import { AdminApprovalRulesController } from './admin-approval-rules.controller';

@Module({
  imports: [AuthModule, NotificationsModule, WreathRequestsModule],
  controllers: [
    AdminWreathRequestsController,
    AdminExportController,
    AdminVendorsController,
    AdminApprovalRulesController,
  ],
  providers: [AdminWreathRequestsService, AdminExportService],
})
export class AdminModule {}
