"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, ApiError, resolveFileUrl } from "@/lib/api";
import { occasionWithRequestType, formatDateTime } from "@/lib/labels";
import type { AdminWreathRequestListItem, Paginated, UnmatchedPhoto } from "@/lib/types";

// 2순위(카톡 채널 대화방) 사진 매칭 경로가 "접수 확인된 진행 중 주문"이 0건이거나
// 2건 이상이라 자동으로 연결하지 못한 사진들을 관리자가 직접 연결하는 패널.
export function UnmatchedPhotosPanel({ onLinked }: { onLinked?: () => void }) {
  const [photos, setPhotos] = useState<UnmatchedPhoto[] | null>(null);
  const [candidates, setCandidates] = useState<AdminWreathRequestListItem[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiGet<{ data: UnmatchedPhoto[] }>("/admin/unmatched-photos")
      .then((res) => setPhotos(res.data))
      .catch(() => setPhotos([]));
    apiGet<Paginated<AdminWreathRequestListItem>>("/admin/wreath-requests?status=accepted&size=50")
      .then((res) => setCandidates(res.data))
      .catch(() => setCandidates([]));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLink(photoId: string) {
    const requestId = selection[photoId];
    if (!requestId) return;
    setLinking(photoId);
    setError(null);
    try {
      await apiPatch(`/admin/wreath-requests/${requestId}/attach-photo`, { attachmentId: photoId });
      load();
      onLinked?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "연결 중 오류가 발생했습니다.");
    } finally {
      setLinking(null);
    }
  }

  if (!photos || photos.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-900">
        ⚠ 미매칭 사진 ({photos.length}건) — 카톡 대화방으로 온 사진이 자동으로 연결되지 않았습니다
      </h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ul className="mt-3 space-y-3">
        {photos.map((photo) => (
          <li key={photo.id} className="flex flex-wrap items-center gap-3 rounded-md bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveFileUrl(photo.fileUrl) ?? undefined}
              alt={photo.fileName}
              className="h-16 w-16 rounded object-cover"
            />
            <span className="text-xs text-gray-500">{formatDateTime(photo.uploadedAt)} 수신</span>
            <select
              value={selection[photo.id] ?? ""}
              onChange={(e) => setSelection((prev) => ({ ...prev, [photo.id]: e.target.value }))}
              className="flex-1 min-w-[220px]"
            >
              <option value="">연결할 주문 선택 (접수 확인된 주문만 표시)</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.requesterName} · {occasionWithRequestType(c.occasionType, c.requestType)} · {c.recipientName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleLink(photo.id)}
              disabled={!selection[photo.id] || linking === photo.id}
              className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {linking === photo.id ? "연결 중..." : "연결"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
