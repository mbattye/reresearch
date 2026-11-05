import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, misconfigured, verifySessionToken } from "./lib/auth";

export async function proxy(request: NextRequest) {
  if (misconfigured()) {
    return new NextResponse("reresearch is locked: set APP_PASSWORD (and CRON_SECRET) in the deployment's environment.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!authEnabled() || request.nextUrl.pathname.startsWith("/login")) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (cookie && (await verifySessionToken(cookie))) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Cron has its own bearer-token check; static assets and the PWA manifest/icons stay public.
  // /login is matched so a misconfigured production deployment is locked there too.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest).*)"],
};
