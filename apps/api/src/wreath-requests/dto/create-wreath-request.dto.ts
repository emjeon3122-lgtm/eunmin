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
import { ContractType, OccasionType, OrchidType, RequestType, WeddingSide } from '@prisma/client';

export class CreateWreathRequestDto {
  @IsEnum(RequestType)
  requestType: RequestType;

  @IsEnum(OccasionType)
  occasionType: OccasionType;

  // occasionType=wedding일 때만 의미 있음 (신랑측/신부측)
  @IsOptional()
  @IsEnum(WeddingSide)
  weddingSide?: WeddingSide;

  // occasionType=opening/promotion일 때만 의미 있음 (동양란/서양란)
  @IsOptional()
  @IsEnum(OrchidType)
  orchidType?: OrchidType;

  @IsString()
  @MinLength(1)
  recipientName: string;

  @IsString()
  @MinLength(1)
  recipientPhone: string;

  // 신청자 본인 휴대폰 번호 — 수령인 연락처와는 별개.
  @IsString()
  @MinLength(1)
  ordererPhone: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  declaredAmount?: number;

  @IsString()
  @MinLength(1)
  ribbonMessage: string;

  @IsString()
  @MinLength(1)
  ribbonSenderText: string;

  @IsOptional()
  @IsString()
  memo?: string;

  // Section 3 — Case A(existing_client)에서만 쓰임.
  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsString()
  serviceName?: string;

  // Section 3 — Case B(prospective_client)/C(self)에서만 쓰임 (발송 사유).
  @IsOptional()
  @IsString()
  sendReason?: string;

  // 정산용 비용 코드 — 내부 전용, 꽃집에게 전달되지 않는다 (WreathRequest.costCode 참고).
  @IsOptional()
  @IsString()
  costCode?: string;

  @IsOptional()
  @IsUUID()
  attachmentId?: string | null;
}
