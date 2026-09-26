import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { WreathRequestsController } from './wreath-requests.controller';
import { WreathRequestsService } from './wreath-requests.service';

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [WreathRequestsController],
  providers: [WreathRequestsService],
  exports: [WreathRequestsService],
})
export class WreathRequestsModule {}
