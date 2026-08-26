import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FallbackChannel, VendorChannelType } from '@prisma/client';

export class VendorUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(VendorChannelType)
  channelType?: VendorChannelType;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  kakaoChannelId?: string;

  @IsOptional()
  @IsBoolean()
  isChannelFriendConfirmed?: boolean;

  @IsOptional()
  @IsEnum(FallbackChannel)
  fallbackChannel?: FallbackChannel;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
