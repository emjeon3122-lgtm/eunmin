import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

class ApprovalRuleUpdateItemDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

// PUT /api/admin/approval-rules — the doc's path has no {id}, so this accepts a
// batch of per-rule updates in one call (best-effort interpretation, see doc 02
// section 5-2: exact admin UI shape for this screen is still TBD).
export class ApprovalRulesUpdateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalRuleUpdateItemDto)
  rules: ApprovalRuleUpdateItemDto[];
}
