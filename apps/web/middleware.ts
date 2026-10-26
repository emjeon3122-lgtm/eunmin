import { NextRequest, NextResponse } from "next/server";

const TOKEN_COOKIE = "wreath_token";
const ROLE_COOKIE = "wreath_role";

// Next 16 은 이 파일 이름을 proxy.ts 로 바꾸라고 경고하지만(동작은 같음), 회사 NAS 배포 센터가
// zip 에서 빠진 옛 파일을 지우는지 확실하지 않아 이름을 유지한다 — 둘이 함께 있으면 빌드가 실패한다.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  const role = req.cookies.get(ROLE_COOKIE)?.value;

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/requests", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/requests/:path*", "/admin/:path*"],
};
