import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { VendorModule } from './vendor/vendor.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { ApprovalRulesModule } from './approval-rules/approval-rules.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ProductsModule } from './products/products.module';
import { RibbonTemplatesModule } from './ribbon-templates/ribbon-templates.module';
import { WreathRequestsModule } from './wreath-requests/wreath-requests.module';
import { VendorStatusModule } from './vendor-status/vendor-status.module';
import { AdminModule } from './admin/admin.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { InvitationParserModule } from './invitation-parser/invitation-parser.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    StorageModule,
    VendorModule,
    NotificationsModule,
    JobsModule,
    ApprovalRulesModule,
    AttachmentsModule,
    ProductsModule,
    RibbonTemplatesModule,
    WreathRequestsModule,
    VendorStatusModule,
    AdminModule,
    WebhooksModule,
    InvitationParserModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
