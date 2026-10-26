import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ContractType, OccasionType, OrchidType, RequestType, WeddingSide } from '../../common/enums';

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

  // 모바일 청첩장/부고장 링크 — 꽃집에게 그대로 전달되고 상세 화면에서 링크로
  // 렌더링되므로, javascript: 같은 스킴이 섞이지 않도록 http/https만 허용한다.
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  invitationUrl?: string;

  // 같은 신청 화면에서의 재제출을 한 건으로 묶는 멱등 키(신청 화면이 열릴 때 생성).
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;

  // 자동 채우기에 쓴 청첩장/부고장 사진(POST /api/invitation-parser/parse가 돌려준 id).
  // 신청자 본인이 올린 청첩장 사진만 연결된다 — 검증은 서비스에서 한다.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsUUID('all', { each: true })
  invitationAttachmentIds?: string[];

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

  // 같은 장소·같은 날 신청이 이미 있다는 경고를 신청자가 확인했는지(duplicate-check.service.ts).
  @IsOptional()
  @IsBoolean()
  acknowledgeDuplicate?: boolean;

  // 외부감사 고객사 중복으로 막힌 신청을 관리자가 예외로 접수할 때의 사유(관리자만 유효).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  duplicateOverrideReason?: string;
}

// POST /api/wreath-requests/duplicate-check — 신청서 마지막 단계 전에 중복 후보를 미리 보여 준다.
export class DuplicateCheckDto {
  @IsString()
  @MinLength(1)
  deliveryAddress!: string;

  @IsDateString()
  desiredArrivalAt!: string;

  @IsString()
  @MinLength(1)
  recipientName!: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;
}
