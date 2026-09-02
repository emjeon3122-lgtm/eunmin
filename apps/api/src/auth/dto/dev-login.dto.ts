import { IsString, IsNotEmpty } from 'class-validator';

export class DevLoginDto {
  @IsString()
  @IsNotEmpty()
  employeeNo: string;
}
