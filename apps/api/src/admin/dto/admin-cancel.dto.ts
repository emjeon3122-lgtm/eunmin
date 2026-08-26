import { IsString, MinLength } from 'class-validator';

export class AdminCancelDto {
  @IsString()
  @MinLength(1)
  reason: string;
}
