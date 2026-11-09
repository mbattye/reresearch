"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { allowAttempt, clearRequest, clientIp, declineRequest, forgetEmail, recordRequest } from "@/lib/access";
import { accountExists, ensureAccount, getAuth, requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-config";
import { getDb, schema } from "@/lib/db";
import type { Keyword, Provider } from "@/lib/db/schema";
import { markRead, setFlag } from "@/lib/feed";
import { deleteKey, saveKey } from "@/lib/keys";
import {
  canWrite,
  claimRewrite,
  collectBatches,
  getPreferences,
  ingest,
  randomPaper,
  requestPapers,
  rewriteForReader,
  summariseByIds,
  type RandomPick,
} from "@/lib/pipeline";
import { PROVIDERS } from "@/lib/providers";
import { CATEGORY_LABELS, OPENAI_MODELS, SUMMARY_MODELS } from "@/lib/topics";

type Result = { ok: boolean; message: string } | null;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export async function toggleFlag(paperId: string, flag: "liked" | "saved" | "hidden", value: boolean) {
  const reader = await requireUser();
  await setFlag(reader.id, paperId, flag, value);
  refresh();
}

export async function markThreadRead(paperId: string) {
  const reader = await requireUser();
  await markRead(reader.id, paperId);
}

export type FetchState = (NonNullable<Result> & { writing?: boolean }) | null;

/**
 * Fetch and rank now (a few seconds) so the reader gets a real answer, then write the picks
 * up in the background; the feed shows them as they land.
 */
export async function fetchPapers(): Promise<FetchState> {
  const reader = await requireUser();
  try {
    const report = await ingest(reader, { defer: true });
    const picked = report.picked ?? [];
    const found =
      report.newToReader === 0
        ? "No new papers since the last fetch."
        : `Found ${report.newToReader} new paper${report.newToReader === 1 ? "" : "s"}.`;
    if (picked.length && !(await canWrite(reader))) {
      refresh();
      return { ok: true, message: `${found} Add your API key in Settings to have the best ones written up.` };
    }
    if (picked.length) {
      after(async () => {
        const result = await summariseByIds(reader, picked);
        console.log("[fetch]", reader.id, JSON.stringify(result));
      });
    }
    refresh();
    const writing = picked.length
      ? ` Writing up the best ${picked.length}; they'll appear in For you within a minute or two.`
      : " Nothing left to write up.";
    return { ok: true, message: found + writing, writing: picked.length > 0 };
  } catch (err) {
    return { ok: false, message: `Fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export type RandomResult = { ok: true; paper: RandomPick } | { ok: false; message: string };

/** Draws a random paper to preview. Reader-specific data is left alone. */
export async function drawRandomPaper(): Promise<RandomResult> {
  const reader = await requireUser();
  if (!(await allowAttempt(`random:${reader.id}`, 60, HOUR))) {
    return { ok: false, message: "That's a lot of surprises for one hour. Try again later." };
  }
  const paper = await randomPaper(reader).catch(() => null);
  return paper ? { ok: true, paper } : { ok: false, message: "Couldn't find one just now. Try again." };
}

/** Adds one offered topic to the reader's list. */
export async function followTopic(category: string) {
  const reader = await requireUser();
  if (!(category in CATEGORY_LABELS)) return;
  const prefs = await getPreferences(reader);
  if (prefs.categories.includes(category)) return;
  const db = await getDb();
  await db
    .update(schema.userSettings)
    .set({ categories: [...prefs.categories, category], updatedAt: new Date() })
    .where(eq(schema.userSettings.userId, reader.id));
  refresh();
}

export type AddPaperState = Result;

export async function addPapers(_prev: AddPaperState, formData: FormData): Promise<AddPaperState> {
  const reader = await requireUser();
  const inputs = String(formData.get("papers") ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 10);
  try {
    const ids = await requestPapers(reader, inputs);
    after(async () => {
      const report = await summariseByIds(reader, ids);
      console.log("[request]", reader.id, JSON.stringify(report));
    });
    refresh();
    return {
      ok: true,
      message: `Added ${ids.length} paper${ids.length === 1 ? "" : "s"}. Writing now; it'll appear at the top of For you in a minute or two.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Write a thread at the reader's current level, replacing any there; the page updates when done. */
export async function rewriteThread(paperId: string) {
  const reader = await requireUser();
  if (await claimRewrite(reader, paperId)) after(() => rewriteForReader(reader, paperId));
  refresh();
}

/** Polled by the app while this reader's batched papers are waiting, so results show up before the next cron run. */
export async function collectBatchResults() {
  const reader = await requireUser();
  if ((await collectBatches(reader.id)) > 0) refresh();
}

export async function summariseNow(paperId: string) {
  const reader = await requireUser();
  const db = await getDb();
  await db
    .insert(schema.userPapers)
    .values({ userId: reader.id, paperId, requested: true })
    .onConflictDoUpdate({
      target: [schema.userPapers.userId, schema.userPapers.paperId],
      set: { requested: true, updatedAt: new Date() },
    });
  after(() => summariseByIds(reader, [paperId]));
  refresh();
}

const OPENROUTER_MODEL = /^[a-z0-9-]+\/[a-z0-9.:_-]+$/i;

function knownProvider(value: unknown): Provider | null {
  return PROVIDERS.find((p) => p.id === value)?.id ?? null;
}

export async function savePreferences(formData: FormData) {
  const reader = await requireUser();
  const categories = formData
    .getAll("category")
    .map(String)
    .concat(
      String(formData.get("extraCategories") ?? "")
        .split(/[\s,]+/)
        .filter(Boolean),
    );
  const keywords: Keyword[] = String(formData.get("keywords") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s*[:=]\s*(-?\d+(?:\.\d+)?)$/);
      return m ? { term: m[1].trim(), weight: Number(m[2]) } : { term: line, weight: 1 };
    });
  const summariesPerRun = Math.min(20, Math.max(1, Number(formData.get("summariesPerRun")) || 4));
  const provider = knownProvider(formData.get("summaryProvider")) ?? "anthropic";
  const listedModel = String(formData.get("summaryModel") ?? "");
  const openrouterModel = String(formData.get("openrouterModel") ?? "").trim();
  const input = formData.get("summaryInput") === "pdf" ? "pdf" : "text";
  const effort = String(formData.get("summaryEffort") ?? "");
  const readingLevel = Math.round(Number(formData.get("readingLevel")));
  const budget = Number(formData.get("monthlyBudgetUsd"));

  await getPreferences(reader);
  const db = await getDb();
  await db
    .update(schema.userSettings)
    .set({
      categories: [...new Set(categories)].slice(0, 100),
      keywords: keywords.slice(0, 100),
      summariesPerRun,
      summaryProvider: provider,
      summaryModel:
        provider === "openrouter"
          ? OPENROUTER_MODEL.test(openrouterModel)
            ? openrouterModel
            : null
          : (provider === "openai" ? OPENAI_MODELS : SUMMARY_MODELS).some((m) => m.id === listedModel)
            ? listedModel
            : null,
      summaryInput: input,
      readingLevel: readingLevel >= 1 && readingLevel <= 6 ? readingLevel : 4,
      summaryEffort: effort === "low" || effort === "medium" || effort === "high" ? effort : null,
      monthlyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? Math.min(budget, 1000) : null,
      sources: {
        inspireTrending: formData.get("inspireTrending") === "on",
        recommendations: formData.get("recommendations") === "on",
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.userSettings.userId, reader.id));
  refresh();
}

// ---------------------------------------------------------------------------------------------
// API keys

export async function saveApiKey(_prev: Result, formData: FormData): Promise<Result> {
  const reader = await requireUser();
  const provider = knownProvider(formData.get("provider"));
  if (!provider) return { ok: false, message: "Unknown provider" };
  try {
    await saveKey(reader.id, provider, String(formData.get("key") ?? ""));
    // A first key should just work, whichever provider it's for.
    if (!(await canWrite(reader))) {
      const db = await getDb();
      await db
        .update(schema.userSettings)
        .set({ summaryProvider: provider, summaryModel: null, updatedAt: new Date() })
        .where(eq(schema.userSettings.userId, reader.id));
    }
    refresh();
    return { ok: true, message: "Key checked and saved." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function removeApiKey(provider: Provider) {
  const reader = await requireUser();
  if (!knownProvider(provider)) return;
  await deleteKey(reader.id, provider);
  refresh();
}

export async function dismissWelcome() {
  const reader = await requireUser();
  const db = await getDb();
  await db
    .update(schema.userSettings)
    .set({ welcomedAt: new Date() })
    .where(eq(schema.userSettings.userId, reader.id));
  refresh();
}

// ---------------------------------------------------------------------------------------------
// Sign-in and invites

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendLink(email: string, invite = false) {
  const auth = await getAuth();
  await auth.api.signInMagicLink({ body: { email, callbackURL: "/", errorCallbackURL: "/login?link=expired", metadata: { invite } }, headers: await headers() });
}

type SignInResult = (NonNullable<Result> & { needsAccess?: boolean }) | null;

/**
 * Sends a sign-in link to existing accounts (and creates an admin's account on first use). An email
 * without access is offered the request form, which does show who has an account, deliberately:
 * being stranded on "check your email" was the worse problem. Requests are still rate limited.
 */
export async function requestSignInLink(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, message: "Enter a valid email address." };
  try {
    const ip = clientIp(await headers());
    const allowed = (await allowAttempt(`sign-in:${ip}`, 10, HOUR)) && (await allowAttempt(`link:${email}`, 3, 15 * MINUTE));
    if (allowed) {
      if (isAdmin(email)) await ensureAccount(email);
      if (!(await accountExists(email))) {
        return { ok: false, needsAccess: true, message: "That email doesn't have access yet. You can request it here." };
      }
      await sendLink(email);
    }
  } catch (err) {
    console.error("[sign-in] couldn't send link", err);
  }
  return {
    ok: true,
    message: "A sign-in link is on its way. It works once and expires in an hour. If it's not there, check your spam folder.",
  };
}

/** Puts the email on the waitlist. The reply never changes, so it can't show who's a member or who was declined. */
export async function requestAccess(_prev: Result, formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, message: "Enter a valid email address." };
  try {
    if (await allowAttempt(`access:${clientIp(await headers())}`, 5, HOUR)) {
      if (!(await accountExists(email))) await recordRequest(email);
    }
  } catch (err) {
    console.error("[access] couldn't record request", err);
  }
  return { ok: true, message: "If you're approved, we'll email you an invite." };
}

export async function signOut() {
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function inviteReader(_prev: Result, formData: FormData): Promise<Result> {
  const reader = await requireUser();
  if (!reader.isAdmin) return { ok: false, message: "Only admins can invite people." };
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, message: "Enter a valid email address." };
  try {
    await ensureAccount(email);
    await sendLink(email, true);
    await clearRequest(email);
    refresh();
    return { ok: true, message: `Invited ${email}. They've been sent a sign-in link.` };
  } catch (err) {
    return { ok: false, message: `Account created, but the email failed: ${err instanceof Error ? err.message : err}` };
  }
}

export async function approveRequest(email: string): Promise<Result> {
  const reader = await requireUser();
  if (!reader.isAdmin) return { ok: false, message: "Only admins can approve requests." };
  try {
    await ensureAccount(email);
    await sendLink(email, true);
    await clearRequest(email);
    refresh();
    return { ok: true, message: `Invited ${email}.` };
  } catch (err) {
    return { ok: false, message: `The invite failed: ${err instanceof Error ? err.message : err}` };
  }
}

export async function rejectRequest(email: string) {
  const reader = await requireUser();
  if (!reader.isAdmin) return;
  await declineRequest(email);
  refresh();
}

/** A reader deleting their own account. Admins are set by ADMIN_EMAILS, and would just be recreated. */
export async function deleteAccount() {
  const reader = await requireUser();
  if (reader.isAdmin) return;
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  const db = await getDb();
  // Cascades to their sessions, settings, keys, likes and jobs; threads they paid for stay shared.
  await db.delete(schema.user).where(eq(schema.user.id, reader.id));
  await forgetEmail(reader.email);
  redirect("/login?account=deleted");
}

export async function removeReader(userId: string) {
  const reader = await requireUser();
  if (!reader.isAdmin || userId === reader.id) return;
  const db = await getDb();
  // Cascades to their sessions, settings, keys, likes and jobs; threads they paid for stay shared.
  await db.delete(schema.user).where(eq(schema.user.id, userId));
  refresh();
}
