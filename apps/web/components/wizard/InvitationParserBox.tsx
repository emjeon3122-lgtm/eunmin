"use client";

import { useState } from "react";
import { apiPostForm, ApiError } from "@/lib/api";
import type { ParsedInvitationFields } from "@/lib/types";

const MAX_IMAGES = 2;

// 신규 요구사항 Section 4-1 — 청첩장/부고장 URL 또는 사진(최대 2장)으로 아래 주문
// 정보 입력란을 자동으로 채워보는 선택 기능. 실제 OCR/URL 파싱 서비스가 아직
// 없어 지금은 항상 "자동으로 채우지 못했습니다"로 끝나지만, 입력 자체는 신청을
// 막지 않으므로 구조만 미리 갖춰둔다.
export function InvitationParserBox({
  onParsed,
  onUrlChange,
  onPhotosUploaded,
}: {
  onParsed: (fields: ParsedInvitationFields) => void;
  // 입력된 링크는 자동 채우기에만 쓰고 끝내지 않고 신청서와 함께 저장된다 — 꽃집이
  // 알림톡으로 같은 링크를 받아 배송 정보를 원본과 대조할 수 있게 하기 위함이다.
  onUrlChange: (url: string) => void;
  // 사진은 분석과 동시에 서버에 저장되고, 여기서 받은 id를 제출 시 같이 보내
  // 신청서에 연결한다(꽃집 상태 확인 페이지에서 원본으로 보여준다).
  onPhotosUploaded: (attachmentIds: string[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleParse() {
    if (!url && images.length === 0) {
      setMessage("URL을 입력하거나 이미지를 1장 이상 첨부해주세요.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      if (url) formData.append("url", url);
      images.forEach((img) => formData.append("images", img));
      const res = await apiPostForm<{
        data: ParsedInvitationFields;
        matched: boolean;
        attachmentIds: string[];
      }>("/invitation-parser/parse", formData);
      onPhotosUploaded(res.attachmentIds);
      const attached =
        res.attachmentIds.length > 0 ? ` 사진 ${res.attachmentIds.length}장은 꽃집에 함께 전달됩니다.` : "";
      if (res.matched) {
        onParsed(res.data);
        setMessage(`자동으로 채웠습니다. 아래 내용을 확인해주세요.${attached}`);
      } else {
        setMessage(`자동으로 채우지 못했습니다. 아래 항목을 직접 입력해주세요.${attached}`);
      }
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-800">📎 청첩장/부고장 첨부 (선택)</p>
      <p className="mt-1 text-xs text-gray-600">
        아래 주문 정보를 자동으로 채워보고, 첨부한 링크·사진은 <b>꽃집에도 함께 전달</b>되어 배송
        정보를 원본과 대조하는 데 쓰입니다. 사진은 <b>아래 버튼을 눌러야</b> 첨부됩니다.
      </p>
      <div className="mt-2 space-y-2">
        <input
          type="url"
          placeholder="모바일 청첩장/부고장 URL"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            onUrlChange(e.target.value);
          }}
          className="w-full"
        />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setImages(Array.from(e.target.files ?? []).slice(0, MAX_IMAGES))}
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-2 file:text-sm"
        />
        <p className="text-xs text-gray-400">이미지는 JPG/PNG/WEBP, 장당 최대 10MB, 최대 {MAX_IMAGES}장</p>
        {images.length > 0 && (
          <p className="text-xs text-gray-600">선택됨: {images.map((f) => f.name).join(", ")}</p>
        )}
        <button
          type="button"
          onClick={handleParse}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? "분석 중..." : "첨부하고 자동 채우기"}
        </button>
        {message && <p className="text-xs text-gray-600">{message}</p>}
      </div>
    </div>
  );
}
