import { IsIn, IsOptional, IsDateString } from 'class-validator';

export class ExportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['department'])
  groupBy?: 'department';
}
