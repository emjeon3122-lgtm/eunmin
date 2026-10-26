"use client";

import { formatDateTime, OCCASION_TYPE_LABELS } from "@/lib/labels";
import type { DuplicateCheckResult } from "@/lib/types";

// 신청서 마지막 단계 — 같은 장소·같은 날 이미 신청된 건이 있으면 보여 준다.
// - 외부감사 고객사의 같은 경조사: 접수 차단(관리자는 사유를 적고 예외 접수)
// - 그 밖의 중복 후보: 확인 체크 후 접수
export function DuplicateNotice({
  result,
  isAdmin,
  acknowledged,
  onAcknowledge,
  overrideReason,
  onOverrideReason,
}: {
  result: DuplicateCheckResult;
  isAdmin: boolean;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
  overrideReason: string;
  onOverrideReason: (v: string) => void;
}) {
  if (result.matches.length === 0) return null;
  const blocked = result.blocked;

  return (
    <div
      className={`space-y-3 rounded-md border p-4 text-sm ${
        blocked ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold">
        {blocked
          ? "🚫 외부감사 고객사 경조사는 한 건만 발송할 수 있습니다"
          : "⚠️ 같은 장소·같은 날 이미 신청된 건이 있습니다"}
      </p>
      <ul className="space-y-1.5">
        {result.matches.map((m) => (
          <li key={m.id} className="rounded bg-white/70 px-3 py-2 text-gray-800">
            <span className="font-medium">
              {m.department} {m.requesterName}
            </span>{" "}
            님 · {OCCASION_TYPE_LABELS[m.occasionType]} · {formatDateTime(m.desiredArrivalAt)}
            {m.deliveryDetail ? ` · ${m.deliveryDetail}` : ""}
            {m.sameEvent && m.recipientName ? ` · 받는 분: ${m.recipientName}` : ""}
            <span className="mt-0.5 block text-xs text-gray-500">
              {m.sameEvent ? "같은 경조사로 보입니다" : "같은 장소·날짜의 다른 행사일 수 있습니다"}
              {m.externalAudit ? " · 외부감사 고객사 건" : ""} · 접수 {formatDateTime(m.createdAt)}
            </span>
          </li>
        ))}
      </ul>

      {blocked && !isAdmin && (
        <p>이미 신청된 건이 있어 접수할 수 없습니다. 신청하신 분과 확인하시고, 꼭 필요하면 관리자에게 문의해 주세요.</p>
      )}

      {blocked && isAdmin && (
        <div>
          <label htmlFor="duplicateOverrideReason" className="text-red-800">
            관리자 예외 접수 사유 (필수 · 기록에 남고 다른 관리자에게 알림이 갑니다)
          </label>
          <textarea
            id="duplicateOverrideReason"
            rows={2}
            value={overrideReason}
            onChange={(e) => onOverrideReason(e.target.value)}
            maxLength={500}
            className="mt-1 w-full"
            placeholder="예: 대표님 지시로 추가 발송"
          />
        </div>
      )}

      {!blocked && (
        <label className="flex items-start gap-2 font-normal">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledge(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>다른 경조사이거나, 이미 신청된 건이 있다는 것을 확인했고 그래도 신청합니다.</span>
        </label>
      )}
    </div>
  );
}
