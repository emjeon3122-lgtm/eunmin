import { IsOptional, IsUrl } from 'class-validator';

export class ParseInvitationDto {
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;
}
