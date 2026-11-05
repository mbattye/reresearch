import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, safeEqual, sessionToken } from "./lib/auth";

export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken())) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Cron has its own bearer-token check; static assets and the PWA manifest/icons stay public.
  matcher: [
    "/((?!login|api/cron|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest).*)",
  ],
};
