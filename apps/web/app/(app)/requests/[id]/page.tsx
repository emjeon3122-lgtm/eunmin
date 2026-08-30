"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError, resolveFileUrl } from "@/lib/api";
import { StatusTracker } from "@/components/StatusTracker";
import {
  occasionWithRequestType,
  formatDateTime,
  CONTRACT_TYPE_LABELS,
  ORCHID_TYPE_LABELS,
  WEDDING_SIDE_LABELS,
} from "@/lib/labels";
import type { WreathRequestDetail } from "@/lib/types";

export default function WreathRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<WreathRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);

  function load() {
    apiGet<{ data: WreathRequestDetail }>(`/wreath-requests/${params.id}`)
      .then((res) => setRequest(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "신청 정보를 불러오지 못했습니다."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleCancel() {
    if (!request) return;
    if (!confirm("신청을 취소하시겠습니까?")) return;
    setCancelling(true);
    try {
      await apiPost(`/wreath-requests/${request.id}/cancel`);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        alert("이미 꽃집이 접수하여 취소할 수 없습니다. 총무팀에 문의해주세요.");
      } else {
        alert(err instanceof ApiError ? err.message : "취소 처리 중 오류가 발생했습니다.");
      }
    } finally {
      setCancelling(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!request) return <p className="text-sm text-gray-500">불러오는 중...</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => router.push("/requests")} className="mb-4 text-sm text-gray-500 hover:underline">
        &lt; 목록으로
      </button>
      <h1 className="text-lg font-semibold text-gray-900">신청 상세</h1>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
        {request.status === "cancelled" ? (
          <div>
            <p className="font-medium text-red-600">이 신청은 취소되었습니다.</p>
            {request.cancelledReason && (
              <p className="mt-1 text-sm text-gray-600">사유: {request.cancelledReason}</p>
            )}
          </div>
        ) : (
          <StatusTracker status={request.status} />
        )}
      </div>

      <dl className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
        <Row
          label="경조사 유형"
          value={
            occasionWithRequestType(request.occasionType, request.requestType) +
            (request.orchidType ? ` / ${ORCHID_TYPE_LABELS[request.orchidType]}` : "") +
            (request.weddingSide ? ` / ${WEDDING_SIDE_LABELS[request.weddingSide]}` : "")
          }
        />
        <Row label="수령인" value={`${request.recipientName} / ${request.recipientPhone}`} />
        <Row label="장소" value={`${request.venueName}${request.deliveryDetail ? ` ${request.deliveryDetail}` : ""}`} />
        <Row label="배송 주소" value={request.deliveryAddress} />
        <Row label="도착 희망" value={formatDateTime(request.desiredArrivalAt)} />
        <Row label="리본 문구" value={`${request.ribbonMessage} / ${request.ribbonSenderText}`} />
        <Row label="주문자 연락처" value={request.ordererPhone} />
        {request.clientName && <Row label="고객사명" value={request.clientName} />}
        {request.contractType && <Row label="계약구분" value={CONTRACT_TYPE_LABELS[request.contractType]} />}
        {request.serviceName && <Row label="용역명" value={request.serviceName} />}
        {request.sendReason && <Row label="발송 사유" value={request.sendReason} />}
        {request.costCode && <Row label="비용 코드" value={request.costCode} />}
        {request.memo && <Row label="기타요청사항" value={request.memo} />}
      </dl>

      {(request.status === "submitted" || request.status === "submitted_to_vendor") && (
        <div className="mt-4">
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {cancelling ? "취소 처리 중..." : "신청 취소"}
          </button>
          <p className="mt-1 text-xs text-gray-400">꽃집이 접수를 확인하기 전까지 취소할 수 있습니다.</p>
        </div>
      )}
      {request.status === "accepted" && (
        <p className="mt-4 text-sm text-gray-500">
          이미 꽃집이 접수하여 취소할 수 없습니다. 변경이 필요하면 총무팀에 문의해주세요.
        </p>
      )}

      {request.status === "completed" && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">
            📷 배송완료 사진{request.completionPhotoUrls.length > 1 ? ` (${request.completionPhotoUrls.length}장)` : ""}
          </h2>
          {request.completionPhotoUrls.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {request.completionPhotoUrls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setOpenPhotoIndex(i)}
                  className="aspect-square overflow-hidden rounded-md border border-gray-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveFileUrl(url) ?? undefined}
                    alt={`배송완료 사진 ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">사진 없음 (관리자 수동 처리)</p>
          )}
        </div>
      )}

      {openPhotoIndex !== null && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setOpenPhotoIndex(null)}
        >
          <div className="max-h-[90vh] max-w-2xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveFileUrl(request.completionPhotoUrls[openPhotoIndex]) ?? undefined}
              alt={`배송완료 사진 ${openPhotoIndex + 1} 크게 보기`}
              className="max-h-[80vh] w-full rounded-md object-contain"
            />
            {request.completionPhotoUrls.length > 1 && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setOpenPhotoIndex(
                      (openPhotoIndex - 1 + request.completionPhotoUrls.length) % request.completionPhotoUrls.length
                    )
                  }
                  className="rounded-md bg-white/90 px-3 py-2 text-sm font-medium text-gray-800"
                >
                  &lt; 이전
                </button>
                <span className="text-sm text-white">
                  {openPhotoIndex + 1} / {request.completionPhotoUrls.length}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenPhotoIndex((openPhotoIndex + 1) % request.completionPhotoUrls.length)}
                  className="rounded-md bg-white/90 px-3 py-2 text-sm font-medium text-gray-800"
                >
                  다음 &gt;
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setOpenPhotoIndex(null)}
              className="mt-3 w-full rounded-md bg-white/90 py-2 text-sm font-medium text-gray-800"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="col-span-2 text-gray-900">{value}</dd>
    </div>
  );
}
