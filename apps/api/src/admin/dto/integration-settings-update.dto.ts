import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

// 모든 항목이 선택 입력이다. 비밀값(클라이언트 암호·API 키 등)은 빈 문자열이면 "그대로 두기",
// null 이면 "지우기" 다 — @IsOptional 은 null 도 통과시키므로 그대로 서비스에 전달된다.
const TEXT = 500;

export class AuthSettingsDto {
  @IsOptional()
  @IsIn(['mock', 'oidc'])
  mode?: 'mock' | 'oidc';

  @IsOptional()
  @IsBoolean()
  allowDevLogin?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  oidcIssuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  oidcClientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  oidcClientSecret?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  oidcRedirectUri?: string;
}

export class VendorSettingsDto {
  @IsOptional()
  @IsIn(['mock', 'kakao'])
  adapter?: 'mock' | 'kakao';

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  apiKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  apiSecret?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  senderKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  senderPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  apiBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  webhookSecret?: string | null;
}

export class InvitationParserSettingsDto {
  @IsOptional()
  @IsIn(['mock', 'claude'])
  mode?: 'mock' | 'claude';

  @IsOptional()
  @IsString()
  @MaxLength(TEXT)
  anthropicApiKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}

export class IntegrationSettingsUpdateDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthSettingsDto)
  auth?: AuthSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => VendorSettingsDto)
  vendor?: VendorSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => InvitationParserSettingsDto)
  invitationParser?: InvitationParserSettingsDto;
}
