import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class KakaoTransmissionCallbackDto {
  @IsString()
  providerMessageId: string;

  @IsIn(['sent', 'failed', 'acked'])
  status: 'sent' | 'failed' | 'acked';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
