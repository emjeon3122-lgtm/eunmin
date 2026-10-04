"use client";

import { useEffect, useRef, useState } from "react";
import { apiDownload, apiGet, apiPostForm, ApiError } from "@/lib/api";
import type { RosterImportResult, RosterUser } from "@/lib/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<RosterUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RosterImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function load() {
    apiGet<{ data: RosterUser[] }>("/admin/users")
      .then((res) => setUsers(res.data))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "직원 명단을 불러오지 못했습니다."));
  }

  useEffect(load, []);

  async function upload(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiPostForm<{ data: RosterImportResult }>(
        `/admin/users/import?dryRun=${dryRun}`,
        form
      );
      if (dryRun) {
        setPreview(res.data);
      } else if (res.data.applied) {
        setMessage({
          type: "success",
          text: `반영했습니다. 새로 추가 ${res.data.created}명, 변경 ${res.data.updated}명.`,
        });
        reset();
        load();
      } else {
        setPreview(res.data);
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof ApiError ? err.message : "엑셀을 처리하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const canApply = preview && preview.errors.length === 0 && preview.created + preview.updated > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">직원 명단</h1>
        <button
          type="button"
          onClick={() => apiDownload("/admin/users/export", "직원명단.xlsx").catch(() => setMessage({ type: "error", text: "내려받지 못했습니다." }))}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ⬇ 현재 명단 엑셀로 받기
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Microsoft 365 로그인은 이 명단의 회사 이메일과 대조해 등록된 직원만 들어올 수 있습니다.
      </p>

      <section className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">엑셀로 명단 올리기</h2>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-gray-600">
          <li>위의 &quot;현재 명단 엑셀로 받기&quot;로 양식을 내려받아 직원을 추가·수정합니다.</li>
          <li>파일을 선택하고 &quot;확인하기&quot;를 누르면 바뀔 내용을 먼저 보여드립니다.</li>
          <li>오류가 없으면 &quot;명단에 반영하기&quot;를 눌러 한 번에 반영합니다. 엑셀에 없는 직원은 삭제되지 않습니다.</li>
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setMessage(null);
            }}
            className="text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-2 file:text-sm"
          />
          <button
            type="button"
            onClick={() => upload(true)}
            disabled={!file || busy}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy && !preview ? "확인 중..." : "확인하기"}
          </button>
        </div>

        {preview && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge label="엑셀 인원" value={preview.total} />
              <Badge label="새로 추가" value={preview.created} tone="brand" />
              <Badge label="변경" value={preview.updated} tone="brand" />
              <Badge label="그대로" value={preview.unchanged} />
              {preview.errors.length > 0 && <Badge label="오류" value={preview.errors.length} tone="red" />}
            </div>

            {preview.errors.length > 0 ? (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">
                  오류가 있어 반영할 수 없습니다. 엑셀을 고친 뒤 다시 올려주세요.
                </p>
                <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-sm text-red-700">
                  {preview.errors.map((e) => (
                    <li key={e.row}>
                      <span className="font-medium">{e.row}행</span> — {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : preview.created + preview.updated === 0 ? (
              <p className="text-sm text-gray-600">바뀌는 내용이 없습니다.</p>
            ) : null}

            {canApply && (
              <button
                type="button"
                onClick={() => upload(false)}
                disabled={busy}
                className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "반영 중..." : "명단에 반영하기"}
              </button>
            )}
          </div>
        )}

        {message && (
          <p className={`mt-3 text-sm ${message.type === "error" ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
        )}
      </section>

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-gray-900">
          등록된 직원 {users ? `(${users.length}명)` : ""}
        </h2>
        {loadError && <p className="mt-2 text-sm text-red-600">{loadError}</p>}
        {users && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">사번</th>
                  <th className="px-4 py-2 font-medium">이름</th>
                  <th className="px-4 py-2 font-medium">부서</th>
                  <th className="px-4 py-2 font-medium">회사 이메일</th>
                  <th className="px-4 py-2 font-medium">휴대폰</th>
                  <th className="px-4 py-2 font-medium">파트너</th>
                  <th className="px-4 py-2 font-medium">권한</th>
                  <th className="px-4 py-2 font-medium">로그인 연결</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.employeeNo}>
                    <td className="px-4 py-2">{u.employeeNo}</td>
                    <td className="px-4 py-2">{u.name}</td>
                    <td className="px-4 py-2">{u.department}</td>
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">{u.phone ?? "-"}</td>
                    <td className="px-4 py-2">{u.isPartner ? "Y" : "-"}</td>
                    <td className="px-4 py-2">{u.role === "admin" ? "관리자" : "직원"}</td>
                    <td className="px-4 py-2 text-gray-500">{u.loginLinked ? "연결됨" : "첫 로그인 전"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Badge({ label, value, tone }: { label: string; value: number; tone?: "brand" | "red" }) {
  const color =
    tone === "red" ? "bg-red-100 text-red-700" : tone === "brand" ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-700";
  return (
    <span className={`rounded-full px-3 py-1 ${color}`}>
      {label} <span className="font-semibold">{value}</span>
    </span>
  );
}
