import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AddPaperForm } from "@/components/AddPaperForm";
import { BackIcon } from "@/components/icons";
import { getSpend, getTopAffinities } from "@/lib/feed";
import { getPreferences, getSummaryConfig } from "@/lib/pipeline";
import { formatUsd } from "@/lib/pricing";
import { CATEGORY_LABELS, SUMMARY_MODELS } from "@/lib/topics";
import { runIngest, savePreferences } from "../actions";

export const maxDuration = 300;

export default function SettingsPage() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-12 items-center gap-6 border-b border-line bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <Link href="/" className="-m-2 p-2" aria-label="Back to feed">
          <BackIcon className="size-5" />
        </Link>
        <span className="text-[17px] font-bold">Settings</span>
      </header>
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    </>
  );
}

const sectionTitle = "text-[15px] font-semibold";
const hint = "mt-0.5 text-[13px] text-muted";

async function Settings() {
  await connection();
  const [prefs, affinities, config, spend] = await Promise.all([
    getPreferences(),
    getTopAffinities(),
    getSummaryConfig(),
    getSpend(),
  ]);
  const extra = prefs.categories.filter((c) => !(c in CATEGORY_LABELS));

  return (
    <main className="divide-y divide-line">
      <section className="px-4 py-4">
        <h2 className={sectionTitle}>Add a paper</h2>
        <p className={hint}>Paste arXiv links or ids (one or more). They&apos;re summarised straight away and go to the top of For you.</p>
        <AddPaperForm />
      </section>

      <form action={savePreferences}>
        <section className="px-4 py-4">
          <h2 className={sectionTitle}>arXiv categories</h2>
          <p className={hint}>New submissions in these categories are fetched on each run.</p>
          <div className="mt-3 grid gap-1">
            {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
              <label key={cat} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-[14px] hover:bg-raised">
                <input
                  type="checkbox"
                  name="category"
                  value={cat}
                  defaultChecked={prefs.categories.includes(cat)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span>{label}</span>
                <span className="ml-auto font-mono text-[12px] text-muted">{cat}</span>
              </label>
            ))}
          </div>
          <label className="mt-3 block text-[13px] text-muted">
            Other categories (space separated)
            <input
              name="extraCategories"
              defaultValue={extra.join(" ")}
              placeholder="e.g. cond-mat.str-el astro-ph.GA"
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[14px] text-fg"
            />
          </label>
        </section>

        <section className="px-4 py-4">
          <h2 className={sectionTitle}>Interests</h2>
          <p className={hint}>
            One per line. Optional weight after a colon (default 1; negative to steer away). Title matches count double.
          </p>
          <textarea
            name="keywords"
            rows={10}
            defaultValue={prefs.keywords.map((k) => (k.weight === 1 ? k.term : `${k.term}: ${k.weight}`)).join("\n")}
            className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[14px]"
          />
          <label className="mt-3 flex items-center justify-between text-[14px]">
            Papers summarised per run
            <input
              type="number"
              name="summariesPerRun"
              min={1}
              max={20}
              defaultValue={prefs.summariesPerRun}
              className="w-20 rounded-lg border border-line bg-bg px-3 py-1.5 text-right"
            />
          </label>
        </section>

        <section className="px-4 py-4">
          <h2 className={sectionTitle}>Writing threads</h2>
          <p className={hint}>
            Cheaper models are faster but less careful with nuance and numbers. Scheduled runs use the half-price batch API.
          </p>
          <div className="mt-3 grid gap-1">
            {SUMMARY_MODELS.map((m) => (
              <label key={m.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-[14px] hover:bg-raised">
                <input
                  type="radio"
                  name="summaryModel"
                  value={m.id}
                  defaultChecked={config.model === m.id}
                  className="size-4 accent-[var(--accent)]"
                />
                <span>{m.label}</span>
                <span className="ml-auto text-[12.5px] text-muted">{m.note}</span>
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-start gap-3 px-1 text-[14px]">
            <input
              type="checkbox"
              name="summaryInput"
              value="pdf"
              defaultChecked={config.input === "pdf"}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              Read the full PDF, figures included
              <span className="block text-[12.5px] text-muted">About 3× the cost. Off reads the extracted text.</span>
            </span>
          </label>
          <button className="mt-4 w-full rounded-full bg-fg py-2 text-[14px] font-semibold text-bg hover:opacity-90">
            Save
          </button>
        </section>
      </form>

      <section className="px-4 py-4">
        <h2 className={sectionTitle}>Spend</h2>
        <p className="mt-1 text-[14px]">
          {formatUsd(spend.month)} this month across {spend.monthCount} thread{spend.monthCount === 1 ? "" : "s"}
          {spend.count > 0 && <span className="text-muted"> · {formatUsd(spend.total / spend.count)} average</span>}
        </p>
        <p className={hint}>Estimated from token usage at list prices.</p>
      </section>

      <section className="px-4 py-4">
        <h2 className={sectionTitle}>Learned from your reading</h2>
        <p className={hint}>Likes and saves boost a thread&apos;s tags; &ldquo;less like this&rdquo; lowers them.</p>
        {affinities.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Nothing yet.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {affinities.map((a) => (
              <span
                key={a.term}
                className={`rounded-full px-2.5 py-1 text-[12.5px] ${a.weight > 0 ? "bg-accent-soft text-accent" : "bg-raised text-muted line-through"}`}
              >
                {a.term} {a.weight > 0 ? "+" : ""}
                {a.weight.toFixed(1)}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="px-4 py-4">
        <h2 className={sectionTitle}>Fetch now</h2>
        <p className={hint}>Runs automatically once a day when deployed. This fetches and summarises in the background.</p>
        <form action={runIngest} className="mt-3">
          <button className="rounded-full border border-line px-4 py-1.5 text-[14px] font-semibold hover:bg-raised">
            Fetch &amp; summarise
          </button>
        </form>
      </section>
    </main>
  );
}
