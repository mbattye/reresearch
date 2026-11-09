import "server-only";
import { and, asc, count, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { adminEmails, baseURL } from "./auth-config";
import { getDb, schema } from "./db";
import { sendRequestDigestEmail } from "./email";

const { accessRequests, authAttempts } = schema;

const MAX_PENDING = 1000;
const MAX_LISTED = 100;
const MAX_IN_DIGEST = 50;
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Vercel sets x-real-ip itself; a client can't choose it. */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

/** Counts this attempt and says whether it's within `limit` per `windowMs`. Refused attempts aren't counted. */
export async function allowAttempt(key: string, limit: number, windowMs: number): Promise<boolean> {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(authAttempts)
    .where(and(eq(authAttempts.key, key), gt(authAttempts.at, new Date(Date.now() - windowMs))));
  if (n >= limit) return false;
  await db.insert(authAttempts).values({ key });
  await db.delete(authAttempts).where(lt(authAttempts.at, new Date(Date.now() - ATTEMPT_RETENTION_MS)));
  return true;
}

/** Adds someone to the waitlist. Asking again, or after being declined, changes nothing. */
export async function recordRequest(email: string): Promise<void> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(accessRequests).where(eq(accessRequests.status, "pending"));
  if (n >= MAX_PENDING) return;
  await db.insert(accessRequests).values({ email }).onConflictDoNothing();
}

/** Oldest first, so people are seen in the order they asked. */
export async function pendingRequests() {
  const db = await getDb();
  return db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.status, "pending"))
    .orderBy(asc(accessRequests.createdAt))
    .limit(MAX_LISTED);
}

/** Removes what's kept against an email outside the account itself, when that account is deleted. */
export async function forgetEmail(email: string) {
  const db = await getDb();
  await db.delete(schema.accessRequests).where(eq(schema.accessRequests.email, email));
  await db.delete(schema.authAttempts).where(eq(schema.authAttempts.key, `link:${email}`));
}

export async function clearRequest(email: string): Promise<void> {
  const db = await getDb();
  await db.delete(accessRequests).where(eq(accessRequests.email, email));
}

export async function declineRequest(email: string): Promise<void> {
  const db = await getDb();
  await db.update(accessRequests).set({ status: "declined" }).where(eq(accessRequests.email, email));
}

/** One email to the admins listing requests they haven't heard about. Returns how many it covered. */
export async function sendRequestDigest(): Promise<number> {
  const admins = adminEmails();
  if (!admins.length) return 0;
  const db = await getDb();
  const fresh = await db
    .select({ email: accessRequests.email })
    .from(accessRequests)
    .where(and(eq(accessRequests.status, "pending"), isNull(accessRequests.notifiedAt)))
    .orderBy(asc(accessRequests.createdAt));
  if (!fresh.length) return 0;
  const emails = fresh.map((r) => r.email);
  await sendRequestDigestEmail(admins, emails.slice(0, MAX_IN_DIGEST), emails.length, `${baseURL()}/settings`);
  await db.update(accessRequests).set({ notifiedAt: new Date() }).where(inArray(accessRequests.email, emails));
  return emails.length;
}
