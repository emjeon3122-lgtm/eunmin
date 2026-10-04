import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import configuration, { AppConfig } from './config/configuration';
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
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          rootPath: resolve(config.get<AppConfig['storageLocalDir']>('app.storageLocalDir')!),
          serveRoot: '/uploads',
          // 업로드 파일을 확장자에 맞는 타입으로만 해석하게 해 브라우저의 내용 추측 실행을 막는다.
          serveStaticOptions: {
            setHeaders: (res: { setHeader: (name: string, value: string) => void }) => {
              res.setHeader('X-Content-Type-Options', 'nosniff');
            },
          },
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
    InvitationParserModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
