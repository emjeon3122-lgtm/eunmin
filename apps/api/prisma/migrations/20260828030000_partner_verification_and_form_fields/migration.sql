-- 파트너 검증 게이팅 + 신청서 다단계 폼 신규 필드.

-- 1. Users: 파트너 여부 (금액 기준 사전승인 대신 이걸로 게이팅한다)
ALTER TABLE "users" ADD COLUMN "is_partner" BOOLEAN NOT NULL DEFAULT false;

-- 2. RequestType: self/client -> self/existing_client/prospective_client
--    (기존 'client' 행은 'existing_client'로 이관 — 어느 쪽인지 구분할 근거가
--    없어 임의로 선택한 기본값이며, 필요하면 관리자가 사후에 개별 정정한다.)
ALTER TYPE "RequestType" RENAME TO "RequestType_old";
CREATE TYPE "RequestType" AS ENUM ('self', 'existing_client', 'prospective_client');

ALTER TABLE "wreath_requests"
  ALTER COLUMN "request_type" TYPE "RequestType"
  USING (
    CASE "request_type"::text
      WHEN 'self' THEN 'self'
      ELSE 'existing_client'
    END
  )::"RequestType";

DROP TYPE "RequestType_old";

-- 3. 새 enum 타입
CREATE TYPE "WeddingSide" AS ENUM ('groom', 'bride');
CREATE TYPE "OrchidType" AS ENUM ('oriental', 'western');
CREATE TYPE "ContractType" AS ENUM (
  'external_audit', 'voluntary_audit', 'tax', 'bookkeeping', 'internal_accounting', 'other_advisory'
);

-- 4. wreath_requests 신규 컬럼
ALTER TABLE "wreath_requests" ADD COLUMN "wedding_side" "WeddingSide";
ALTER TABLE "wreath_requests" ADD COLUMN "orchid_type" "OrchidType";
ALTER TABLE "wreath_requests" ADD COLUMN "orderer_phone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "wreath_requests" ADD COLUMN "client_name" TEXT;
ALTER TABLE "wreath_requests" ADD COLUMN "contract_type" "ContractType";
ALTER TABLE "wreath_requests" ADD COLUMN "service_name" TEXT;
ALTER TABLE "wreath_requests" ADD COLUMN "send_reason" TEXT;
