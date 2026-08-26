import { NextRequest, NextResponse } from "next/server";

const TOKEN_COOKIE = "wreath_token";
const ROLE_COOKIE = "wreath_role";

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
