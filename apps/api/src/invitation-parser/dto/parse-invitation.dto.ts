import { IsOptional, IsUrl } from 'class-validator';

export class ParseInvitationDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}
