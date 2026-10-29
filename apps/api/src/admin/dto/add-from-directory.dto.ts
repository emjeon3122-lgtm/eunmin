import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

// 회사(Entra) 디렉터리에서 찾은 계정을 직원 명단에 추가.
export class AddFromDirectoryDto {
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: '회사 계정 식별값 형식이 올바르지 않습니다.' })
  oid!: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  isPartner?: boolean;
}
