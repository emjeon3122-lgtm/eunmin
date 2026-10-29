"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@/lib/types";
import { apiGet } from "@/lib/api";
import { clearAuth } from "@/lib/auth";

// 알림 페이지가 읽음 처리를 마쳤을 때 배지를 즉시 비우기 위한 신호.
export const NOTIFICATIONS_READ_EVENT = "notifications:read";

export function Nav({ user }: { user: User | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  // 폴링 대신 화면 이동 시점에만 개수를 다시 가져온다 — 알림이 자주 생기지 않는
  // 서비스라 이 정도면 충분하고 요청 수도 적다.
  useEffect(() => {
    if (!user) return;
    apiGet<{ data: { unreadCount: number } }>("/notifications/unread-count")
      .then((res) => setUnreadCount(res.data.unreadCount))
      .catch(() => {});
  }, [user, pathname]);

  useEffect(() => {
    const reset = () => setUnreadCount(0);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, reset);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, reset);
  }, []);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function handleLogout() {
    clearAuth();
    router.push("/login");
  }

  const linkClass = (href: string) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
      isActive(href) ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/requests" className="text-base font-semibold text-gray-900">
          경조사 화환 신청
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          <Link href="/requests" className={linkClass("/requests")}>
            신청 목록
          </Link>
          <Link href="/requests/new" className={linkClass("/requests/new")}>
            새 신청
          </Link>
          {user?.role === "admin" && (
            <Link href="/admin/requests" className={linkClass("/admin")}>
              관리자
            </Link>
          )}
          <Link href="/notifications" className={`relative ${linkClass("/notifications")}`}>
            알림
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          {user && (
            <span className="ml-2 hidden text-sm text-gray-500 sm:inline">
              {user.name} ({user.employeeNo})
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
          >
            로그아웃
          </button>
        </nav>
      </div>
    </header>
  );
}
