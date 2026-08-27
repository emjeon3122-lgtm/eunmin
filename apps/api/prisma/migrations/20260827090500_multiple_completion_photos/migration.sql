-- 배송완료 사진을 여러 장 업로드할 수 있도록, 1:1(wreath_requests.completion_photo_id)
-- 대신 attachments 쪽에서 request를 가리키는 1:N 관계로 바꾼다.

ALTER TABLE "attachments" ADD COLUMN "completion_for_id" TEXT;

-- 기존에 이미 완료 처리된 신청의 단일 사진을 새 컬럼으로 이관.
UPDATE "attachments" AS a
SET "completion_for_id" = w."id"
FROM "wreath_requests" AS w
WHERE w."completion_photo_id" = a."id";

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_completion_for_id_fkey"
  FOREIGN KEY ("completion_for_id") REFERENCES "wreath_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wreath_requests" DROP COLUMN "completion_photo_id";
