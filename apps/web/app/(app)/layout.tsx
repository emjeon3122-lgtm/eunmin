"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { apiGet, ApiError } from "@/lib/api";
import { clearAuth, getStoredUser, getToken, setAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Starts null (matching the server-rendered HTML) and is filled in after
  // mount — reading localStorage in the useState initializer would return
  // different values on the server vs. the client's first render and cause
  // a hydration mismatch.
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser());
    apiGet<{ data: User }>("/auth/me")
      .then((res) => {
        setUser(res.data);
        setAuth(token, res.data);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth();
          router.replace("/login");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
