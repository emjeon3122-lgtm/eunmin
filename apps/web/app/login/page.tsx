"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE_URL, apiGet, apiPost, ApiError } from "@/lib/api";
import { setAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

type LoginMethod = "oidc" | "dev" | "none";

const ERROR_MESSAGES: Record<string, string> = {
  not_registered: "직원 명단에 등록되지 않은 계정입니다. 관리자에게 등록을 요청해주세요.",
  cancelled: "Microsoft 로그인이 취소되었습니다.",
  expired: "로그인 시간이 초과되었습니다. 다시 시도해주세요.",
  failed: "로그인 확인에 실패했습니다. 다시 시도해주세요.",
  unavailable: "Microsoft 로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/requests";
  const [method, setMethod] = useState<LoginMethod | null>(null);
  const [employeeNo, setEmployeeNo] = useState("");
  const [error, setError] = useState<string | null>(ERROR_MESSAGES[searchParams.get("error") ?? ""] ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ data: { loginMethod: LoginMethod } }>("/auth/config", { auth: false })
      .then((res) => setMethod(res.data.loginMethod))
      .catch((err) => setError(err instanceof ApiError ? err.message : "로그인 설정을 불러오지 못했습니다."));
  }, []);

  async function handleDevLogin(e: React.FormEvent) {
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
      router.push(next);
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

        {method === "oidc" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-gray-500">회사 Microsoft 365(Outlook) 계정으로 로그인합니다.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <a
              href={`${API_BASE_URL}/auth/oidc/login?next=${encodeURIComponent(next)}`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Microsoft 365로 로그인
            </a>
          </div>
        )}

        {method === "dev" && (
          <>
            <p className="mt-1 text-sm text-gray-500">회사 계정 연동 전 임시 로그인입니다</p>
            <form onSubmit={handleDevLogin} className="mt-6 space-y-4">
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
          </>
        )}

        {method === "none" && (
          <p className="mt-6 text-sm text-gray-600">
            로그인 방식이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.
          </p>
        )}

        {method === null && !error && <p className="mt-6 text-sm text-gray-400">불러오는 중...</p>}
        {method === null && error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
