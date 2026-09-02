import { Type } from 'class-transformer';
import { IsEnum, IsInt, Min } from 'class-validator';
import { OccasionType } from '../../common/enums';

export class CheckApprovalRuleDto {
  @IsEnum(OccasionType)
  occasionType: OccasionType;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  declaredAmount: number;
}
