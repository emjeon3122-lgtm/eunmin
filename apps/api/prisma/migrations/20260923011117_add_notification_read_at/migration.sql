-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "read_at" DATETIME;

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
