"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { clearAuth, setAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

// Microsoft 365 로그인 후 서버가 보내는 도착 지점. 로그인 토큰은 주소의 # 뒤에 실려 와서
// 서버 로그에는 남지 않는다 — 읽자마자 주소에서 지우고 저장한다.
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
    const token = params.get("token");
    const rawNext = params.get("next") ?? "/requests";
    const next = /^\/(?![/\\])/.test(rawNext) ? rawNext : "/requests";
    if (!token) {
      router.replace("/login?error=failed");
      return;
    }
    window.localStorage.setItem("wreath_token", token);
    apiGet<{ data: User }>("/auth/me")
      .then((res) => {
        setAuth(token, res.data);
        router.replace(next);
      })
      .catch(() => {
        clearAuth();
        router.replace("/login?error=failed");
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">로그인 중...</div>
  );
}
