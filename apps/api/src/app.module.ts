import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import configuration, { AppConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          rootPath: resolve(config.get<AppConfig['storageLocalDir']>('app.storageLocalDir')!),
          serveRoot: '/uploads',
        },
      ],
    }),
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
  ],
})
export class AppModule {}
