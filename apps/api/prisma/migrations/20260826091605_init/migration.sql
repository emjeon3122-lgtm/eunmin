-- CreateEnum
CREATE TYPE "Role" AS ENUM ('employee', 'admin');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('self', 'colleague', 'vendor_partner');

-- CreateEnum
CREATE TYPE "OccasionType" AS ENUM ('wedding', 'funeral', 'opening', 'etc');

-- CreateEnum
CREATE TYPE "OccasionTypeFilter" AS ENUM ('wedding', 'funeral', 'opening', 'etc', 'all');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('draft', 'submitted', 'submitted_to_vendor', 'accepted', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('pre_approval_proof', 'delivery_completion_photo');

-- CreateEnum
CREATE TYPE "UploaderType" AS ENUM ('employee', 'vendor');

-- CreateEnum
CREATE TYPE "VendorChannelType" AS ENUM ('kakao_friendtalk', 'kakao_alimtalk', 'api', 'email');

-- CreateEnum
CREATE TYPE "FallbackChannel" AS ENUM ('manual_admin_alert', 'sms', 'none');

-- CreateEnum
CREATE TYPE "TransmissionChannel" AS ENUM ('kakao_friendtalk', 'kakao_alimtalk', 'sms_fallback', 'api', 'email');

-- CreateEnum
CREATE TYPE "TransmissionStatus" AS ENUM ('pending', 'sent', 'failed', 'acked');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'kakao_alimtalk', 'in_app');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employee_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "sso_subject_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'employee',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wreath_requests" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "request_type" "RequestType" NOT NULL,
    "occasion_type" "OccasionType" NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "venue_name" TEXT NOT NULL,
    "delivery_address" TEXT NOT NULL,
    "delivery_detail" TEXT,
    "desired_arrival_at" TIMESTAMP(3) NOT NULL,
    "ribbon_message" TEXT NOT NULL,
    "ribbon_sender_text" TEXT NOT NULL,
    "declared_amount" INTEGER NOT NULL,
    "memo" TEXT,
    "requires_pre_approval" BOOLEAN NOT NULL DEFAULT false,
    "attachment_id" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'draft',
    "vendor_id" TEXT,
    "product_id" TEXT,
    "vendor_status_token" TEXT,
    "accepted_at" TIMESTAMP(3),
    "completion_photo_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "admin_override_note" TEXT,
    "cancelled_by" TEXT,
    "cancelled_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wreath_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "uploader_type" "UploaderType" NOT NULL,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL,
    "occasion_type" "OccasionTypeFilter" NOT NULL,
    "min_amount" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_type" "VendorChannelType" NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "kakao_channel_id" TEXT,
    "is_channel_friend_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "fallback_channel" "FallbackChannel" NOT NULL DEFAULT 'manual_admin_alert',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ribbon_templates" (
    "id" TEXT NOT NULL,
    "occasion_type" "OccasionType" NOT NULL,
    "phrase_ko" TEXT NOT NULL,
    "phrase_hanja" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ribbon_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_transmissions" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "channel" "TransmissionChannel" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "TransmissionStatus" NOT NULL DEFAULT 'pending',
    "provider_message_id" TEXT,
    "response_body" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_transmissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_id" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'sent',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_no_key" ON "users"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_sso_subject_id_key" ON "users"("sso_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "wreath_requests_attachment_id_key" ON "wreath_requests"("attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "wreath_requests_vendor_status_token_key" ON "wreath_requests"("vendor_status_token");

-- CreateIndex
CREATE UNIQUE INDEX "wreath_requests_completion_photo_id_key" ON "wreath_requests"("completion_photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_transmissions_provider_message_id_key" ON "order_transmissions"("provider_message_id");

-- AddForeignKey
ALTER TABLE "wreath_requests" ADD CONSTRAINT "wreath_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wreath_requests" ADD CONSTRAINT "wreath_requests_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wreath_requests" ADD CONSTRAINT "wreath_requests_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wreath_requests" ADD CONSTRAINT "wreath_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wreath_requests" ADD CONSTRAINT "wreath_requests_completion_photo_id_fkey" FOREIGN KEY ("completion_photo_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wreath_requests" ADD CONSTRAINT "wreath_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_transmissions" ADD CONSTRAINT "order_transmissions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "wreath_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "wreath_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
