import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { OccasionType, RequestType } from '@prisma/client';

export class CreateWreathRequestDto {
  @IsEnum(RequestType)
  requestType: RequestType;

  @IsEnum(OccasionType)
  occasionType: OccasionType;

  @IsString()
  @MinLength(1)
  recipientName: string;

  @IsString()
  @MinLength(1)
  recipientPhone: string;

  @IsString()
  @MinLength(1)
  venueName: string;

  @IsString()
  @MinLength(1)
  deliveryAddress: string;

  @IsOptional()
  @IsString()
  deliveryDetail?: string;

  @IsDateString()
  desiredArrivalAt: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  declaredAmount: number;

  @IsString()
  @MinLength(1)
  ribbonMessage: string;

  @IsString()
  @MinLength(1)
  ribbonSenderText: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsUUID()
  attachmentId?: string | null;
}
