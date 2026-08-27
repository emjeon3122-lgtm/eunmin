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

  // 정산용 비용 코드 — 내부 전용, 꽃집에게 전달되지 않는다 (WreathRequest.costCode 참고).
  @IsOptional()
  @IsString()
  costCode?: string;

  @IsOptional()
  @IsUUID()
  attachmentId?: string | null;
}
