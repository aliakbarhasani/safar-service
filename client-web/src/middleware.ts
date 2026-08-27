import { NextRequest, NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth";

// مسیرهای محافظت‌شده: داشبورد، پروفایل و ماژول‌ها.
// مسیرهای عمومی (auth، static، ...) خارج از matcher هستند و بدون token قابل باز شدن‌اند.
const PROTECTED_PREFIXES = ["/dashboard", "/profile", "/modules"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/modules/:path*"],
};