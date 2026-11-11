import { connection, NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { CONNECT_COOKIE, CONNECT_COOKIE_PATH, CONNECT_MINUTES, connectFrom, startConnect } from "@/lib/openrouter-connect";

/** Sends a signed-in reader to OpenRouter to create a key for reresearch. */
export async function GET(request: NextRequest) {
  await connection();
  await requireUser();
  const { url, cookie } = startConnect(connectFrom(request.nextUrl.searchParams.get("from")));
  const res = NextResponse.redirect(url);
  res.cookies.set(CONNECT_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: CONNECT_COOKIE_PATH,
    maxAge: CONNECT_MINUTES * 60,
  });
  return res;
}
