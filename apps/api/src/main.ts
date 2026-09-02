import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  // rawBody:true populates req.rawBody for every request — used by the kakao
  // webhook's HMAC signature verification (docs/04 section 5) without needing a
  // dedicated raw-body middleware just for that one route.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
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

  await app.listen(port ?? 4000);
}

bootstrap();
