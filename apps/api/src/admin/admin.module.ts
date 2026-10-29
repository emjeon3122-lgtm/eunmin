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
import { AdminIntegrationSettingsController } from './admin-integration-settings.controller';
import { DirectoryService } from './directory.service';
import { InvitationParserModule } from '../invitation-parser/invitation-parser.module';
import { VendorModule } from '../vendor/vendor.module';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    StorageModule,
    WreathRequestsModule,
    VendorModule,
    InvitationParserModule,
  ],
  controllers: [
    AdminWreathRequestsController,
    AdminExportController,
    AdminVendorsController,
    AdminApprovalRulesController,
    AdminUsersController,
    AdminIntegrationSettingsController,
  ],
  providers: [AdminWreathRequestsService, AdminExportService, AdminUsersService, DirectoryService],
})
export class AdminModule {}
