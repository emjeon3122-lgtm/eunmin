-- 상품 선택/금액 입력란을 신청서에서 제거함에 따라 declared_amount를 선택 입력으로 변경.
ALTER TABLE "wreath_requests" ALTER COLUMN "declared_amount" DROP NOT NULL;
