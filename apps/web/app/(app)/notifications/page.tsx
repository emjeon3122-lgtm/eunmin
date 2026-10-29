"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import { NOTIFICATIONS_READ_EVENT } from "@/components/Nav";
import type { AppNotification } from "@/lib/types";

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(getStoredUser()?.role === "admin");
    apiGet<{ data: AppNotification[] }>("/notifications")
      .then((res) => {
        // 목록은 읽음 처리 전 상태로 보여줘서 이번에 새로 온 알림이 강조되게 한다.
        setItems(res.data);
        if (res.data.some((n) => !n.readAt)) {
          return apiPost("/notifications/read-all").then(() => {
            window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
          });
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "알림을 불러오지 못했습니다."));
  }, []);

  // 관리자는 본인 신청이 아닌 건(발송 실패 알림 등)도 받으므로 관리자 상세로 보낸다.
  const detailHref = (requestId: string) =>
    isAdmin ? `/admin/requests/${requestId}` : `/requests/${requestId}`;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-gray-900">알림</h1>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!error && items === null && <p className="mt-4 text-sm text-gray-500">불러오는 중...</p>}
      {items?.length === 0 && (
        <p className="mt-4 rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          아직 받은 알림이 없습니다.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? "" : "bg-brand-50"}`}>
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-600"}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">{n.message}</p>
                <p className="mt-0.5 text-xs text-gray-400">{formatDateTime(n.sentAt)}</p>
              </div>
              {n.requestId && (
                <Link
                  href={detailHref(n.requestId)}
                  className="shrink-0 text-sm font-medium text-brand-600 hover:underline"
                >
                  신청 보기
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
