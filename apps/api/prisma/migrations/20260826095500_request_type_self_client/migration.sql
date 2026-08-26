-- Collapse RequestType from {self, colleague, vendor_partner} down to
-- {self, client} (신청 유형: 본인 / 고객사). Existing "colleague" and
-- "vendor_partner" rows are folded into "client" rather than dropped.
ALTER TYPE "RequestType" RENAME TO "RequestType_old";
CREATE TYPE "RequestType" AS ENUM ('self', 'client');

ALTER TABLE "wreath_requests"
  ALTER COLUMN "request_type" TYPE "RequestType"
  USING (
    CASE "request_type"::text
      WHEN 'self' THEN 'self'
      ELSE 'client'
    END
  )::"RequestType";

DROP TYPE "RequestType_old";
