"use client";

import { useState } from "react";
import { apiPostForm, ApiError } from "@/lib/api";

interface AttachmentUploadResponse {
  data: { attachmentId: string; fileName: string };
}

export function AttachmentUploader({
  onUploaded,
}: {
  onUploaded: (attachmentId: string, fileName: string) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const json = await apiPostForm<AttachmentUploadResponse>("/attachments", formData);
      setFileName(file.name);
      onUploaded(json.data.attachmentId, file.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "파일 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800">
        ⚠ 본부장 사전승인이 필요한 신청입니다. 승인 증빙을 첨부해주세요.
      </p>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleChange}
        disabled={uploading}
        className="mt-2 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-amber-700"
      />
      {uploading && <p className="mt-1 text-sm text-amber-700">업로드 중...</p>}
      {fileName && !uploading && (
        <p className="mt-1 text-sm text-green-700">첨부됨: {fileName} ✓</p>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
