import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { AppConfig } from '../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<AppConfig['jwtSecret']>('app.jwtSecret'),
        // JWT_EXPIRES_IN(예: "8h")은 ms 형식 문자열 — 라이브러리 타입에 맞춰 변환한다.
        signOptions: {
          expiresIn: config.get<AppConfig['jwtExpiresIn']>('app.jwtExpiresIn') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OidcService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, AuthService, OidcService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
