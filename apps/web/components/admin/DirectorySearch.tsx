"use client";

import { useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { DirectoryPerson, RosterUser } from "@/lib/types";

// 직원 명단 > 회사 계정에서 찾아 추가 — 회사(Entra) 디렉터리에서 이름·메일로 찾아 바로 명단에 넣는다.
// Microsoft 계정 고유값까지 함께 연결되므로 메일 표기가 달라도 첫 로그인부터 같은 사람으로 들어온다.
// Entra 앱에 Microsoft Graph 애플리케이션 권한 User.Read.All(관리자 동의)이 있어야 한다.
export function DirectorySearch({ onAdded }: { onAdded: (users: RosterUser[]) => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<DirectoryPerson[] | null>(null);
  const [partner, setPartner] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setMessage({ kind: "error", text: "이름이나 메일을 두 글자 이상 입력하세요." });
      return;
    }
    setSearching(true);
    setMessage(null);
    try {
      const res = await apiGet<{ data: DirectoryPerson[] }>(`/admin/users/directory?q=${encodeURIComponent(q)}`);
      setPeople(res.data);
      if (res.data.length === 0) setMessage({ kind: "error", text: "찾은 사람이 없습니다." });
    } catch (err) {
      setPeople(null);
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "회사 계정을 찾지 못했습니다." });
    } finally {
      setSearching(false);
    }
  }

  async function add(p: DirectoryPerson, isAdmin: boolean) {
    setAdding(p.oid);
    setMessage(null);
    try {
      const res = await apiPost<{ data: RosterUser[] }>("/admin/users/from-directory", {
        oid: p.oid,
        isAdmin,
        isPartner: Boolean(partner[p.oid]),
      });
      onAdded(res.data);
      const added = res.data.find((u) => u.email.toLowerCase() === p.email);
      setPeople((prev) =>
        prev ? prev.map((x) => (x.oid === p.oid ? { ...x, registeredAs: added?.employeeNo ?? "추가됨" } : x)) : prev
      );
      setMessage({ kind: "ok", text: `${p.name}님을 ${isAdmin ? "관리자" : "직원"}로 추가했습니다.` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "추가하지 못했습니다." });
    } finally {
      setAdding(null);
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">회사 계정에서 찾아 추가</h2>
      <p className="mt-1 text-xs text-gray-500">
        Microsoft 365(회사) 계정을 이름이나 메일로 찾아 바로 명단에 넣습니다. 부서·휴대폰은 회사 계정 정보로 채워지고,
        사번은 회사 계정의 사번이 없으면 메일 앞부분으로 정해집니다.
      </p>

      <form onSubmit={search} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 메일 (예: 홍길동, gildong)"
          className="w-full max-w-sm"
          aria-label="회사 계정 검색어"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {searching ? "찾는 중..." : "찾기"}
        </button>
      </form>

      {message && (
        <p className={`mt-3 text-sm ${message.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
      )}

      {people && people.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-md border border-gray-100">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="px-3 py-2 font-medium">회사 이메일</th>
                <th className="px-3 py-2 font-medium">부서 / 직위</th>
                <th className="px-3 py-2 font-medium">파트너</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {people.map((p) => (
                <tr key={p.oid} className={p.enabled ? "" : "text-gray-400"}>
                  <td className="px-3 py-2">
                    {p.name}
                    {!p.enabled && <span className="ml-1 text-xs">(로그인 중지된 계정)</span>}
                  </td>
                  <td className="px-3 py-2">{p.email}</td>
                  <td className="px-3 py-2 text-gray-600">{[p.department, p.jobTitle].filter(Boolean).join(" / ") || "-"}</td>
                  <td className="px-3 py-2">
                    {p.registeredAs ? (
                      "-"
                    ) : (
                      <input
                        type="checkbox"
                        checked={Boolean(partner[p.oid])}
                        onChange={(e) => setPartner({ ...partner, [p.oid]: e.target.checked })}
                        className="h-4 w-4"
                        aria-label={`${p.name} 파트너`}
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {p.registeredAs ? (
                      <span className="text-xs text-gray-500">등록됨 ({p.registeredAs})</span>
                    ) : (
                      <span className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => add(p, false)}
                          disabled={adding !== null}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          직원으로 추가
                        </button>
                        <button
                          type="button"
                          onClick={() => add(p, true)}
                          disabled={adding !== null}
                          className="rounded-md border border-brand-500 bg-white px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                        >
                          관리자로 추가
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
