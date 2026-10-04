import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { AppConfig } from '../config/configuration';

// 업로드 파일은 주소만 알면 열리던 방식을 버리고, 볼 권한을 확인한 API(본인 신청 상세,
// 관리자 상세, 꽃집 토큰 페이지)가 응답할 때만 만료 시간이 붙은 서명 주소를 발급한다.
// <img src>는 Authorization 헤더를 실을 수 없어 쿠키 대신 주소 자체에 권한을 담는다.
@Injectable()
export class FileUrlService {
  private readonly key: Buffer;
  private readonly ttlSeconds: number;

  constructor(configService: ConfigService) {
    const jwtSecret = configService.get<AppConfig['jwtSecret']>('app.jwtSecret')!;
    // 로그인 토큰 서명과 용도를 분리하기 위해 같은 비밀값에서 파일 전용 키를 파생한다.
    this.key = createHash('sha256').update(`file-url:${jwtSecret}`).digest();
    this.ttlSeconds = configService.get<AppConfig['fileUrlTtlSeconds']>('app.fileUrlTtlSeconds')!;
  }

  // DB에 저장된 경로("/uploads/<파일명>")를 다운로드용 서명 주소로 바꾼다.
  sign(storedUrl: string | null | undefined): string | null {
    if (!storedUrl) return null;
    const fileName = storedUrl.slice(storedUrl.lastIndexOf('/') + 1);
    const exp = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    return `/api/files/${fileName}?exp=${exp}&sig=${this.signature(fileName, exp)}`;
  }

  verify(fileName: string, exp: string | undefined, sig: string | undefined): boolean {
    const expNum = Number(exp);
    if (!sig || !Number.isInteger(expNum) || expNum < Date.now() / 1000) return false;
    const expected = Buffer.from(this.signature(fileName, expNum));
    const provided = Buffer.from(sig);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  }

  private signature(fileName: string, exp: number): string {
    return createHmac('sha256', this.key).update(`${fileName}:${exp}`).digest('base64url');
  }
}
