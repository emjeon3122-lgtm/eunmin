import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConfig, assertProductionConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  assertProductionConfig(configService.get<AppConfig>('app')!);
  const corsOrigin = configService.get<AppConfig['corsOrigin']>('app.corsOrigin');
  const port = configService.get<AppConfig['port']>('app.port');

  app.enableCors({ origin: corsOrigin, credentials: true });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // NAS 는 host 네트워크라 api 가 NAS 포트에 직접 붙는다 — HOST=127.0.0.1 이면 NAS 안에서만 열린다.
  // 로컬 개발은 HOST 를 비워 두면 예전처럼 모든 주소(0.0.0.0)에서 받는다.
  await app.listen(port ?? 4000, process.env.HOST ?? '0.0.0.0');
}

bootstrap();
