import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Better Auth's endpoints (magic-link verification, session, sign-out). The instance is built
// lazily, so resolve it per request.
export async function GET(request: Request) {
  return toNextJsHandler(await getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(await getAuth()).POST(request);
}
