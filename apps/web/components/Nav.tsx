"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@/lib/types";
import { clearAuth } from "@/lib/auth";

export function Nav({ user }: { user: User | null }) {
  const pathname = usePathname();
  const router = useRouter();

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
