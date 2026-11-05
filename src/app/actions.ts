"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { after } from "next/server";
import { SESSION_COOKIE, authEnabled, safeEqual, sessionToken } from "@/lib/auth";
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
  const inputs = raw.split(/[\s,]+/).filter(Boolean);
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
      sources: {
        inspireTrending: formData.get("inspireTrending") === "on",
        recommendations: formData.get("recommendations") === "on",
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.preferences.id, 1));
  refresh();
}

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  if (!authEnabled()) redirect("/");
  const password = String(formData.get("password") ?? "");
  if (!safeEqual(password, process.env.APP_PASSWORD ?? "")) return "Wrong password";
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  redirect("/");
}
