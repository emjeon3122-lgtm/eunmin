"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiDownload, apiGet, ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { UnmatchedPhotosPanel } from "@/components/UnmatchedPhotosPanel";
import { occasionWithRequestType } from "@/lib/labels";
import type { AdminWreathRequestListItem, Paginated, WreathStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: WreathStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "submitted", label: "신청완료" },
  { value: "submitted_to_vendor", label: "신청완료(전달됨)" },
  { value: "accepted", label: "배송중" },
  { value: "completed", label: "완료" },
  { value: "cancelled", label: "취소됨" },
];

export default function AdminRequestsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState<WreathStatus | "">("");

  const [items, setItems] = useState<AdminWreathRequestListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function buildQuery() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (department) params.set("department", department);
    if (status) params.set("status", status);
    return params;
  }

  function load() {
    setError(null);
    const query = buildQuery().toString();
    apiGet<Paginated<AdminWreathRequestListItem>>(`/admin/wreath-requests${query ? `?${query}` : ""}`)
      .then((res) => setItems(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const params = buildQuery();
      params.set("format", "xlsx");
      await apiDownload(`/admin/export?${params.toString()}`, "화환발송이력.xlsx");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "엑셀 다운로드에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">전체 신청 관리</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? "다운로드 중..." : "⬇ 엑셀 다운로드"}
        </button>
      </div>

      <UnmatchedPhotosPanel onLinked={load} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4"
      >
        <div>
          <label htmlFor="from">시작일</label>
          <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="to">종료일</label>
          <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label htmlFor="department">부서</label>
          <input id="department" placeholder="예: 영업1팀" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        <div>
          <label htmlFor="status">상태</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as WreathStatus | "")}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          검색
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {items === null && !error && <p className="mt-8 text-sm text-gray-500">불러오는 중...</p>}
      {items !== null && items.length === 0 && <p className="mt-8 text-sm text-gray-500">조건에 맞는 신청이 없습니다.</p>}

      {items !== null && items.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">신청자</th>
                <th className="px-4 py-3 font-medium">부서</th>
                <th className="px-4 py-3 font-medium">유형</th>
                <th className="px-4 py-3 font-medium">사전승인</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{r.requesterName}</td>
                  <td className="px-4 py-3">{r.department}</td>
                  <td className="px-4 py-3">{occasionWithRequestType(r.occasionType, r.requestType)}</td>
                  <td className="px-4 py-3">{r.requiresPreApproval ? "✓ 첨부됨" : "불필요"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/requests/${r.id}`} className="text-brand-600 hover:underline">
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
