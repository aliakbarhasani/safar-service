import { NextRequest, NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth";

// ظ…ط³غŒط±ظ‡ط§غŒ ظ…ط­ط§ظپط¸طھâ€Œط´ط¯ظ‡: ط¯ط§ط´ط¨ظˆط±ط¯طŒ ظ¾ط±ظˆظپط§غŒظ„ ظˆ ظ…ط§عکظˆظ„â€Œظ‡ط§.
// ظ…ط³غŒط±ظ‡ط§غŒ ط¹ظ…ظˆظ…غŒ (authطŒ staticطŒ ...) ط®ط§ط±ط¬ ط§ط² matcher ظ‡ط³طھظ†ط¯ ظˆ ط¨ط¯ظˆظ† token ظ‚ط§ط¨ظ„ ط¨ط§ط² ط´ط¯ظ†â€Œط§ظ†ط¯.
const PROTECTED_PREFIXES = ["/dashboard", "/profile", "/modules"];

export function proxy(req: NextRequest) {
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