-- 주문 정보 입력 화면에서 장소명 입력란을 제거함에 따라 컬럼 삭제.
ALTER TABLE "wreath_requests" DROP COLUMN "venue_name";
