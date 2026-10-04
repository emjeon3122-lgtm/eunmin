import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { WreathRequestsModule } from '../wreath-requests/wreath-requests.module';
import { AdminWreathRequestsController } from './admin-wreath-requests.controller';
import { AdminWreathRequestsService } from './admin-wreath-requests.service';
import { AdminExportController } from './admin-export.controller';
import { AdminExportService } from './admin-export.service';
import { AdminVendorsController } from './admin-vendors.controller';
import { AdminApprovalRulesController } from './admin-approval-rules.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AuthModule, NotificationsModule, StorageModule, WreathRequestsModule],
  controllers: [
    AdminWreathRequestsController,
    AdminExportController,
    AdminVendorsController,
    AdminApprovalRulesController,
    AdminUsersController,
  ],
  providers: [AdminWreathRequestsService, AdminExportService, AdminUsersService],
})
export class AdminModule {}
