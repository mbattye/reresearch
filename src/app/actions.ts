"use server";

import { eq, gt, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { after } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, authEnabled, createSessionToken, safeEqual } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import type { Keyword } from "@/lib/db/schema";
import { markRead, setFlag } from "@/lib/feed";
import { SUMMARY_MODELS } from "@/lib/topics";
import { collectBatches, getPreferences, ingest, requestPapers, summariseByIds } from "@/lib/pipeline";

export async function toggleFlag(paperId: string, flag: "liked" | "saved" | "hidden", value: boolean) {
  await setFlag(paperId, flag, value);
  refresh();
}

export async function markThreadRead(paperId: string) {
  await markRead(paperId);
}

/** Fetch and summarise in the background so the button returns immediately. */
export async function runIngest() {
  after(async () => {
    const report = await ingest();
    console.log("[ingest]", JSON.stringify(report));
  });
  redirect("/?tab=queue");
}

export type AddPaperState = { ok: boolean; message: string } | null;

export async function addPapers(_prev: AddPaperState, formData: FormData): Promise<AddPaperState> {
  const raw = String(formData.get("papers") ?? "");
  const inputs = raw.split(/[\s,]+/).filter(Boolean).slice(0, 10);
  try {
    const ids = await requestPapers(inputs);
    after(async () => {
      const report = await summariseByIds(ids);
      console.log("[request]", JSON.stringify(report));
    });
    refresh();
    return { ok: true, message: `Added ${ids.length} paper${ids.length === 1 ? "" : "s"}. Summarising now, it'll appear at the top of For you in a minute or two.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Polled by the app while batched papers are waiting, so results show up without the next cron run. */
export async function collectBatchResults() {
  if ((await collectBatches()) > 0) refresh();
}

export async function summariseNow(paperId: string) {
  after(async () => {
    await summariseByIds([paperId]);
  });
  const db = await getDb();
  await db.update(schema.papers).set({ requested: true }).where(eq(schema.papers.id, paperId));
  refresh();
}

export async function savePreferences(formData: FormData) {
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
  const model = String(formData.get("summaryModel") ?? "");
  const input = formData.get("summaryInput") === "pdf" ? "pdf" : "text";
  const effort = String(formData.get("summaryEffort") ?? "");
  const budget = Number(formData.get("monthlyBudgetUsd"));

  await getPreferences();
  const db = await getDb();
  await db
    .update(schema.preferences)
    .set({
      categories: [...new Set(categories)],
      keywords,
      summariesPerRun,
      summaryModel: SUMMARY_MODELS.some((m) => m.id === model) ? model : null,
      summaryInput: input,
      summaryEffort: effort === "low" || effort === "medium" || effort === "high" ? effort : null,
      monthlyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? Math.min(budget, 1000) : null,
      sources: {
        inspireTrending: formData.get("inspireTrending") === "on",
        recommendations: formData.get("recommendations") === "on",
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.preferences.id, 1));
  refresh();
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 8;
const MAX_FAILURES_TOTAL = 40;

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  if (!authEnabled()) redirect("/");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const db = await getDb();
  const { authFailures } = schema;
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [counts] = await db
    .select({
      ip: sql<number>`count(*) filter (where ${authFailures.ip} = ${ip})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(authFailures)
    .where(gt(authFailures.at, since));
  if (counts.ip >= MAX_FAILURES_PER_IP || counts.total >= MAX_FAILURES_TOTAL) {
    return "Too many attempts. Try again in 15 minutes.";
  }

  const password = String(formData.get("password") ?? "");
  // Compare digests so the check takes the same time whatever the password's length.
  if (!safeEqual(await sha256(password), await sha256(process.env.APP_PASSWORD ?? ""))) {
    await db.insert(authFailures).values({ ip });
    await db.delete(authFailures).where(lt(authFailures.at, new Date(Date.now() - 86_400_000)));
    await new Promise((r) => setTimeout(r, 750));
    return "Wrong password";
  }

  await db.delete(authFailures).where(eq(authFailures.ip, ip));
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_S,
    path: "/",
  });
  redirect("/");
}

async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Buffer.from(digest).toString("hex");
}
