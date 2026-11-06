// Lightweight auth helpers with no database access, safe to import from proxy.ts.

/** Secrets the deployment needs; without them, production refuses to run rather than run insecurely. */
const REQUIRED_IN_PRODUCTION = ["BETTER_AUTH_SECRET", "KEY_ENCRYPTION_SECRET", "ADMIN_EMAILS"] as const;

export function missingProductionConfig(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  return REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

/** Constant-time comparison (for equal lengths; a length mismatch returns early, which reveals only the length). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
