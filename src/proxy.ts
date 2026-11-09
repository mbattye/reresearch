import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { missingProductionConfig } from "./lib/auth-config";

export function proxy(request: NextRequest) {
  const missing = missingProductionConfig();
  if (missing.length) {
    return new NextResponse(`reresearch is locked: set ${missing.join(", ")} in the deployment's environment.`, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (["/login", "/privacy"].some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();

  // Optimistic check only: every page and action verifies the session itself (requireUser).
  if (getSessionCookie(request)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Auth endpoints and cron check their own credentials; static assets and the PWA files stay public.
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|manifest.webmanifest).*)"],
};
