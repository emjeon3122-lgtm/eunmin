import { IsISO8601, IsOptional, IsString, IsUrl } from 'class-validator';

// 2순위 매칭 경로(docs 신규 요구사항): 꽃집이 원터치 링크를 쓰지 않고 카카오톡
// 채널 대화방에 사진만 올리는 경우, CPaaS가 이 웹훅으로 이미지를 전달한다고
// 가정한 형태 — 실제 필드명은 선정된 CPaaS의 상담톡/채널 메시지 웹훅 스펙에
// 맞춰 교체가 필요하다 (docs/04 section 8-1과 동일한 성격의 미확정 항목).
export class KakaoInboundPhotoDto {
  @IsString()
  vendorKakaoChannelId: string;

  @IsUrl({ require_tld: false })
  imageUrl: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
