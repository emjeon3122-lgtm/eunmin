import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// 직원 한 명 추가(관리자 화면). 엑셀 업로드와 같은 규칙을 쓴다.
export class CreateUserDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,30}$/, { message: '사번은 영문·숫자·-·_ 30자 이내여야 합니다.' })
  employeeNo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  department!: string;

  @IsEmail({}, { message: '회사 이메일 형식이 아닙니다.' })
  @MaxLength(100)
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(/^$|^[0-9+\- ]{9,20}$/, { message: '휴대폰 번호 형식이 아닙니다.' })
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isPartner?: boolean;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;
}

export class SetRoleDto {
  @IsIn(['admin', 'employee'])
  role!: 'admin' | 'employee';
}
