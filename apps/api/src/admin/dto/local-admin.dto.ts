import { IsString, MaxLength, MinLength } from 'class-validator';

export class LocalAdminDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
