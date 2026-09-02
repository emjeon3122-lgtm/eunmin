"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { setAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [employeeNo, setEmployeeNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeNo.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const loginRes = await apiPost<{ data: { token: string } }>(
        "/auth/dev-login",
        { employeeNo: employeeNo.trim() },
        { auth: false }
      );
      const token = loginRes.data.token;
      // Temporarily stash the token so the /auth/me call below can attach it.
      window.localStorage.setItem("wreath_token", token);
      const meRes = await apiGet<{ data: User }>("/auth/me");
      setAuth(token, meRes.data);
      router.push("/requests");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "로그인에 실패했습니다.");
      window.localStorage.removeItem("wreath_token");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">경조사 화환 신청</h1>
        <p className="mt-1 text-sm text-gray-500">회사 SSO 연동 전 임시 로그인입니다</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="employeeNo">사번 (Employee No)</label>
            <input
              id="employeeNo"
              type="text"
              autoFocus
              value={employeeNo}
              onChange={(e) => setEmployeeNo(e.target.value)}
              placeholder="예: A0001"
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-400">
              임시 계정 예시 — 관리자: A0001 / 직원: E1001, E1002
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || !employeeNo.trim()}
            className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
