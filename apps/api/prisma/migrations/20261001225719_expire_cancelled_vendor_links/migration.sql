-- 취소 시 꽃집 링크를 만료시키도록 바뀌기 전에 취소된 건도 같은 상태로 맞춘다.
UPDATE "wreath_requests" SET "vendor_status_token" = NULL WHERE "status" = 'cancelled';
