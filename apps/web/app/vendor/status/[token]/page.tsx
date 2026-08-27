"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost, apiPostForm, ApiError } from "@/lib/api";
import { OCCASION_TYPE_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/labels";
import type { VendorStatusData } from "@/lib/types";

const MAX_COMPLETION_PHOTOS = 5;

export default function VendorStatusPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<VendorStatusData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [completedNow, setCompletedNow] = useState(false);

  function load() {
    setLoading(true);
    apiGet<{ data: VendorStatusData }>(`/vendor-status/${token}`, { auth: false })
      .then((res) => {
        setData(res.data);
        setNotFound(false);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiPost<{ data: { status: string; nextAction: VendorStatusData["nextAction"] } }>(
        `/vendor-status/${token}/accept`,
        undefined,
        { auth: false }
      );
      setData((prev) => (prev ? { ...prev, status: res.data.status as VendorStatusData["status"], nextAction: res.data.nextAction } : prev));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message);
        load();
      } else {
        setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete() {
    if (photos.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      photos.forEach((p) => formData.append("photos", p));
      await apiPostForm(`/vendor-status/${token}/complete`, formData, { auth: false });
      setCompletedNow(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message);
        load();
      } else {
        setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Center>불러오는 중...</Center>;
  }

  if (notFound) {
    return <Center>이미 처리되었거나 존재하지 않는 링크입니다.</Center>;
  }

  if (!data) {
    return <Center>{error ?? "정보를 불러오지 못했습니다."}</Center>;
  }

  const showAcceptedThanks = completedNow || data.nextAction === null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs text-gray-400">경조사 화환 주문 확인</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          {OCCASION_TYPE_LABELS[data.occasionType]} 화환
        </h1>

        <dl className="mt-5 space-y-3 text-base">
          <InfoRow label="장소" value={data.venueName} />
          <InfoRow label="도착 희망" value={formatDateTime(data.desiredArrivalAt)} />
          <InfoRow label="리본 문구" value={data.ribbonMessage} />
        </dl>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6">
          {showAcceptedThanks && (
            <p className="rounded-md bg-green-50 p-4 text-center text-base font-medium text-green-700">
              처리가 완료되었습니다. 감사합니다.
            </p>
          )}

          {!showAcceptedThanks && data.nextAction === "accept" && (
            <button
              type="button"
              onClick={handleAccept}
              disabled={submitting}
              className="w-full rounded-lg bg-brand-600 py-4 text-lg font-semibold text-white active:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? "처리 중..." : "접수 확인"}
            </button>
          )}

          {!showAcceptedThanks && data.nextAction === "complete" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                배송완료 사진을 첨부하고(최대 {MAX_COMPLETION_PHOTOS}장) 완료 버튼을 눌러주세요.
              </p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, MAX_COMPLETION_PHOTOS))}
                className="block w-full text-base file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-3 file:text-base"
              />
              {photos.length > 0 && (
                <ul className="space-y-1 text-sm text-green-700">
                  {photos.map((p, i) => (
                    <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">선택됨: {p.name}</span>
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="shrink-0 text-gray-400"
                      >
                        제거
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={handleComplete}
                disabled={submitting || photos.length === 0}
                className="w-full rounded-lg bg-brand-600 py-4 text-lg font-semibold text-white active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "처리 중..." : "배송완료"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center text-base text-gray-600">
      {children}
    </div>
  );
}
