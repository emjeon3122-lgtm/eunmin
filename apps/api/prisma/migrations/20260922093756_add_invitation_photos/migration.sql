-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "uploader_type" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completion_for_id" TEXT,
    "invitation_for_id" TEXT,
    CONSTRAINT "attachments_completion_for_id_fkey" FOREIGN KEY ("completion_for_id") REFERENCES "wreath_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "attachments_invitation_for_id_fkey" FOREIGN KEY ("invitation_for_id") REFERENCES "wreath_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_attachments" ("completion_for_id", "file_name", "file_url", "id", "mime_type", "type", "uploaded_at", "uploaded_by", "uploader_type") SELECT "completion_for_id", "file_name", "file_url", "id", "mime_type", "type", "uploaded_at", "uploaded_by", "uploader_type" FROM "attachments";
DROP TABLE "attachments";
ALTER TABLE "new_attachments" RENAME TO "attachments";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
