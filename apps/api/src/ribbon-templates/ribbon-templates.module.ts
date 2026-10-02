import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RibbonTemplatesController } from './ribbon-templates.controller';

@Module({
  imports: [AuthModule],
  controllers: [RibbonTemplatesController],
})
export class RibbonTemplatesModule {}
