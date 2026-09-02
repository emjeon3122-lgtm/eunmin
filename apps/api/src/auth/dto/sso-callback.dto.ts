import { IsString, IsNotEmpty } from 'class-validator';

export class SsoCallbackDto {
  // In AUTH_MODE=mock this "code" is just the employeeNo (see module docstring).
  @IsString()
  @IsNotEmpty()
  code: string;
}
