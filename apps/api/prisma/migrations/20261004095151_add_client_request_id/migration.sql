-- AlterTable
ALTER TABLE "wreath_requests" ADD COLUMN "client_request_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "wreath_requests_requester_id_client_request_id_key" ON "wreath_requests"("requester_id", "client_request_id");

