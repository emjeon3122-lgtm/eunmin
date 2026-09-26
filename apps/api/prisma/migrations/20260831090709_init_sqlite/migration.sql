-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "sso_subject_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "is_partner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "wreath_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requester_id" TEXT NOT NULL,
    "request_type" TEXT NOT NULL,
    "occasion_type" TEXT NOT NULL,
    "wedding_side" TEXT,
    "orchid_type" TEXT,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "orderer_phone" TEXT NOT NULL,
    "delivery_address" TEXT NOT NULL,
    "delivery_detail" TEXT,
    "desired_arrival_at" DATETIME NOT NULL,
    "ribbon_message" TEXT NOT NULL,
    "ribbon_sender_text" TEXT NOT NULL,
    "declared_amount" INTEGER,
    "client_name" TEXT,
    "contract_type" TEXT,
    "service_name" TEXT,
    "send_reason" TEXT,
    "cost_code" TEXT,
    "memo" TEXT,
    "requires_pre_approval" BOOLEAN NOT NULL DEFAULT false,
    "attachment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "vendor_id" TEXT,
    "product_id" TEXT,
    "vendor_status_token" TEXT,
    "accepted_at" DATETIME,
    "completed_at" DATETIME,
    "admin_override_note" TEXT,
    "cancelled_by" TEXT,
    "cancelled_reason" TEXT,
    "cancelled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "wreath_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "wreath_requests_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "wreath_requests_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "wreath_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "wreath_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "uploader_type" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completion_for_id" TEXT,
    CONSTRAINT "attachments_completion_for_id_fkey" FOREIGN KEY ("completion_for_id") REFERENCES "wreath_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "occasion_type" TEXT NOT NULL,
    "min_amount" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "channel_type" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "kakao_channel_id" TEXT,
    "is_channel_friend_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "fallback_channel" TEXT NOT NULL DEFAULT 'manual_admin_alert',
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ribbon_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "occasion_type" TEXT NOT NULL,
    "phrase_ko" TEXT NOT NULL,
    "phrase_hanja" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "order_transmissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider_message_id" TEXT,
    "response_body" TEXT,
    "attempted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_transmissions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "wreath_requests" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "request_id" TEXT,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sent_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notifications_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "wreath_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "order_transmissions_provider_message_id_key" ON "order_transmissions"("provider_message_id");
