import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "./auth-config";
import { getDb, schema } from "./db";
import { sendSignInEmail } from "./email";

const SESSION_DAYS = 90;

function baseURL(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

async function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("BETTER_AUTH_SECRET is not set");
  const db = await getDb();
  return betterAuth({
    baseURL: baseURL(),
    secret: secret ?? "dev-only-secret-not-for-production-use",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    session: { expiresIn: 60 * 60 * 24 * SESSION_DAYS, updateAge: 60 * 60 * 24 },
    plugins: [
      magicLink({
        // Invite only: links go to existing accounts. Invites (and an admin's first sign-in) create the account.
        disableSignUp: true,
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          await sendSignInEmail(email, url);
        },
      }),
      // Lets server actions set and clear the session cookie (must be last).
      nextCookies(),
    ],
  });
}

type Auth = Awaited<ReturnType<typeof createAuth>>;
const globalForAuth = globalThis as unknown as { __reresearchAuth?: Promise<Auth> };

/** Built lazily because the database connection is (PGlite locally needs async start-up). */
export function getAuth(): Promise<Auth> {
  globalForAuth.__reresearchAuth ??= createAuth().catch((err) => {
    globalForAuth.__reresearchAuth = undefined;
    throw err;
  });
  return globalForAuth.__reresearchAuth;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name, isAdmin: isAdmin(email) };
}

/** For pages and actions: the signed-in reader, or a redirect to sign in. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Create an account without signing it in (used by invites and an admin's first sign-in). */
export async function ensureAccount(email: string): Promise<string> {
  const db = await getDb();
  const normalised = email.trim().toLowerCase();
  const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, normalised));
  if (existing) return existing.id;
  const [created] = await db
    .insert(schema.user)
    .values({ id: crypto.randomUUID(), email: normalised, name: normalised.split("@")[0], emailVerified: false })
    .onConflictDoNothing()
    .returning({ id: schema.user.id });
  if (created) return created.id;
  const [raced] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, normalised));
  return raced.id;
}

export async function accountExists(email: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email.trim().toLowerCase()));
  return !!row;
}
