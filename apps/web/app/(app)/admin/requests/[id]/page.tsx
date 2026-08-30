"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost, ApiError, resolveFileUrl } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import {
  occasionWithRequestType,
  formatDateTime,
  CONTRACT_TYPE_LABELS,
  ORCHID_TYPE_LABELS,
  WEDDING_SIDE_LABELS,
} from "@/lib/labels";
import type { AdminWreathRequestDetail } from "@/lib/types";

export default function AdminWreathRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [request, setRequest] = useState<AdminWreathRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [overrideStatus, setOverrideStatus] = useState<"accepted" | "completed">("accepted");
  const [overrideNote, setOverrideNote] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  function load() {
    apiGet<{ data: AdminWreathRequestDetail }>(`/admin/wreath-requests/${params.id}`)
      .then((res) => setRequest(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "신청 정보를 불러오지 못했습니다."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleCancel() {
    if (!request) return;
    if (!cancelReason.trim()) {
      setCancelError("취소 사유를 입력해주세요.");
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await apiPost(`/admin/wreath-requests/${request.id}/cancel`, { reason: cancelReason.trim() });
      setShowCancelModal(false);
      setCancelReason("");
      load();
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "취소 처리 중 오류가 발생했습니다.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!request) return;
    setOverriding(true);
    setOverrideError(null);
    try {
      await apiPatch(`/admin/wreath-requests/${request.id}/delivery-status`, {
        status: overrideStatus,
        note: overrideNote.trim() || undefined,
      });
      setOverrideNote("");
      load();
    } catch (err) {
      setOverrideError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setOverriding(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!request) return <p className="text-sm text-gray-500">불러오는 중...</p>;

  const canCancel = request.status !== "completed" && request.status !== "cancelled";

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => router.push("/admin/requests")} className="mb-4 text-sm text-gray-500 hover:underline">
        &lt; 전체 신청 관리
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">신청 상세 (관리자)</h1>
        <StatusBadge status={request.status} />
      </div>

      <dl className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
        <Row label="신청자" value={`${request.requesterName} (${request.department})`} />
        <Row
          label="경조사 유형"
          value={
            occasionWithRequestType(request.occasionType, request.requestType) +
            (request.orchidType ? ` / ${ORCHID_TYPE_LABELS[request.orchidType]}` : "") +
            (request.weddingSide ? ` / ${WEDDING_SIDE_LABELS[request.weddingSide]}` : "")
          }
        />
        <Row label="수령인" value={`${request.recipientName} / ${request.recipientPhone}`} />
        <Row label="주문자 연락처" value={request.ordererPhone} />
        <Row label="장소" value={`${request.venueName}${request.deliveryDetail ? ` ${request.deliveryDetail}` : ""}`} />
        <Row label="배송 주소" value={request.deliveryAddress} />
        <Row label="도착 희망" value={formatDateTime(request.desiredArrivalAt)} />
        <Row label="리본 문구" value={`${request.ribbonMessage} / ${request.ribbonSenderText}`} />
        <Row label="선언 금액" value={`${request.declaredAmount.toLocaleString("ko-KR")}원`} />
        {request.clientName && <Row label="고객사명" value={request.clientName} />}
        {request.contractType && <Row label="계약구분" value={CONTRACT_TYPE_LABELS[request.contractType]} />}
        {request.serviceName && <Row label="용역명" value={request.serviceName} />}
        {request.sendReason && <Row label="발송 사유" value={request.sendReason} />}
        {request.costCode && <Row label="비용 코드" value={request.costCode} />}
        <Row label="파트너 승인" value={request.requiresPreApproval ? "증빙 필요(비파트너)" : "불필요(파트너)"} />
        {request.requiresPreApproval && (
          <Row
            label="증빙 파일"
            value=""
            valueNode={
              request.attachmentUrl ? (
                <a href={resolveFileUrl(request.attachmentUrl) ?? "#"} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  {request.attachmentFileName ?? "증빙 파일 보기"}
                </a>
              ) : (
                <span className="text-gray-400">첨부 없음</span>
              )
            }
          />
        )}
        {request.memo && <Row label="메모" value={request.memo} />}
        {request.cancelledReason && <Row label="취소 사유" value={request.cancelledReason} />}
        {request.adminOverrideNote && <Row label="관리자 수동 처리 메모" value={request.adminOverrideNote} />}
      </dl>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">알림톡 발송 로그</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">채널</th>
                <th className="px-4 py-2 font-medium">상태</th>
                <th className="px-4 py-2 font-medium">시도 시각</th>
                <th className="px-4 py-2 font-medium">메시지 ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {request.orderTransmissions && request.orderTransmissions.length > 0 ? (
                request.orderTransmissions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2">{t.channel}</td>
                    <td className="px-4 py-2">{t.status}</td>
                    <td className="px-4 py-2">{formatDateTime(t.attemptedAt)}</td>
                    <td className="px-4 py-2">{t.providerMessageId ?? "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-gray-400">
                    전송 로그가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canCancel && (
        <div className="mt-6">
          <button
            onClick={() => setShowCancelModal(true)}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            취소
          </button>
        </div>
      )}

      {request.status !== "completed" && request.status !== "cancelled" && (
        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">수동 상태 변경 (꽃집 미클릭 시)</h2>
          <p className="mt-1 text-xs text-gray-500">전화로 확인 후, 사진 없이 접수/완료 상태로 강제 변경합니다.</p>
          <form onSubmit={handleOverride} className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="overrideStatus">상태</label>
              <select
                id="overrideStatus"
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value as "accepted" | "completed")}
              >
                <option value="accepted">접수(accepted)</option>
                <option value="completed">완료(completed)</option>
              </select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <label htmlFor="overrideNote">메모</label>
              <input
                id="overrideNote"
                placeholder="예: 꽃집 전화 확인 후 수동 완료 처리 (사진 미확보)"
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                className="w-full"
              />
            </div>
            <button
              type="submit"
              disabled={overriding}
              className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {overriding ? "처리 중..." : "적용"}
            </button>
          </form>
          {overrideError && <p className="mt-2 text-sm text-red-600">{overrideError}</p>}
        </section>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-gray-900">신청 취소</h3>
            <p className="mt-1 text-sm text-gray-500">취소 사유를 입력해주세요.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="mt-3 w-full"
              placeholder="예: 증빙 서류 확인 결과 결재선이 맞지 않아 취소 처리"
            />
            {cancelError && <p className="mt-1 text-sm text-red-600">{cancelError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelError(null);
                }}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                닫기
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? "처리 중..." : "취소 확정"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueNode }: { label: string; value: string; valueNode?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="col-span-2 text-gray-900">{valueNode ?? value}</dd>
    </div>
  );
}
