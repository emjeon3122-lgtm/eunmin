import { IsString, MaxLength, MinLength } from 'class-validator';

export class LocalLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
