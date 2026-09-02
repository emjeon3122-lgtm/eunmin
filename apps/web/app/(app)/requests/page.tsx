"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { occasionWithRequestType, formatDate } from "@/lib/labels";
import type { Paginated, WreathRequestListItem } from "@/lib/types";

export default function RequestsListPage() {
  const [items, setItems] = useState<WreathRequestListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Paginated<WreathRequestListItem>>("/wreath-requests")
      .then((res) => setItems(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다."));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">경조사 화환 신청 내역</h1>
        <Link
          href="/requests/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + 새 신청
        </Link>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {items === null && !error && <p className="mt-8 text-sm text-gray-500">불러오는 중...</p>}

      {items !== null && items.length === 0 && (
        <p className="mt-8 text-sm text-gray-500">아직 신청 내역이 없습니다.</p>
      )}

      {items !== null && items.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-x-auto rounded-lg border border-gray-200 bg-white sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">신청일</th>
                  <th className="px-4 py-3 font-medium">유형</th>
                  <th className="px-4 py-3 font-medium">수령인</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3">{occasionWithRequestType(r.occasionType, r.requestType)}</td>
                    <td className="px-4 py-3">{r.recipientName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/requests/${r.id}`} className="text-brand-600 hover:underline">
                        상세 &gt;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="mt-4 space-y-3 sm:hidden">
            {items.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-300"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">{formatDate(r.createdAt)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-2 text-sm font-medium text-gray-900">
                    {occasionWithRequestType(r.occasionType, r.requestType)}
                  </div>
                  <div className="mt-0.5 text-sm text-gray-600">수령인: {r.recipientName}</div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
