import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AddPaperForm } from "@/components/AddPaperForm";
import { BackIcon } from "@/components/icons";
import { getSpend, getTopAffinities } from "@/lib/feed";
import { getPreferences, getSummaryConfig, monthlyBudget } from "@/lib/pipeline";
import { formatUsd } from "@/lib/pricing";
import { CATEGORY_LABELS, SUMMARY_MODELS } from "@/lib/topics";
import { FetchButton } from "@/components/FetchButton";
import { LevelSlider } from "@/components/LevelSlider";
import { savePreferences } from "../actions";

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

const EFFORT_OPTIONS = [
  { id: "low", label: "Quick", note: "Fastest, cheapest; fine for skimming" },
  { id: "medium", label: "Balanced", note: "Default; what the costs assume" },
  { id: "high", label: "Thorough", note: "More careful reading; costs a little more" },
] as const;

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
  const budget = monthlyBudget(prefs);
  const extra = prefs.categories.filter((c) => !(c in CATEGORY_LABELS));

  return (
    <main className="divide-y divide-line">
      <section className="px-4 py-4">
        <h2 className={sectionTitle}>Add a paper</h2>
        <p className={hint}>
          Paste arXiv links or ids, or DOIs (one or more). Journal papers are read from their free legal copy when one
          exists, otherwise from the abstract.
        </p>
        <AddPaperForm />
      </section>

      <form action={savePreferences}>
        <section className="px-4 py-4">
          <h2 className={sectionTitle}>Reading level</h2>
          <p className={hint}>How much background threads assume. New threads use it; older ones can be rewritten from the thread page.</p>
          <div className="mt-3">
            <LevelSlider initial={prefs.readingLevel} />
          </div>
        </section>

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
          <h2 className={sectionTitle}>Other sources</h2>
          <p className={hint}>Checked on every run alongside your arXiv categories. Only the best matches get written up.</p>
          <div className="mt-3 grid gap-2">
            <label className="flex items-start gap-3 px-1 text-[14px]">
              <input
                type="checkbox"
                name="inspireTrending"
                defaultChecked={prefs.sources.inspireTrending}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                Trending in particle physics
                <span className="block text-[12.5px] text-muted">
                  The most-cited papers of the last six weeks on INSPIRE-HEP: what the field is arguing about.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 px-1 text-[14px]">
              <input
                type="checkbox"
                name="recommendations"
                defaultChecked={prefs.sources.recommendations}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                Recommended from your likes
                <span className="block text-[12.5px] text-muted">
                  Semantic Scholar suggests papers like the ones you like and save, and unlike the ones you hide. Papers
                  take a few days to be indexed.
                </span>
              </span>
            </label>
          </div>
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
          <fieldset className="mt-4">
            <legend className="text-[14px] font-medium">Effort</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {EFFORT_OPTIONS.map((e) => (
                <label
                  key={e.id}
                  className="flex cursor-pointer flex-col rounded-lg border border-line px-2.5 py-2 text-[13.5px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="summaryEffort"
                      value={e.id}
                      defaultChecked={config.effort === e.id}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                    {e.label}
                  </span>
                  <span className="mt-0.5 text-[12px] leading-snug text-muted">{e.note}</span>
                </label>
              ))}
            </div>
          </fieldset>
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
          <label className="mt-4 flex items-center justify-between text-[14px]">
            <span>
              Monthly budget
              <span className="block text-[12.5px] text-muted">Writing stops for the month once this is spent.</span>
            </span>
            <span className="flex items-center gap-1">
              $
              <input
                type="number"
                name="monthlyBudgetUsd"
                min={0}
                step={1}
                defaultValue={budget}
                className="w-20 rounded-lg border border-line bg-bg px-3 py-1.5 text-right"
              />
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
          {formatUsd(spend.month)} of {formatUsd(budget)} this month across {spend.monthCount} thread
          {spend.monthCount === 1 ? "" : "s"}
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
        <p className={hint}>Runs automatically every morning. Fetching now writes up the best few straight away.</p>
        <div className="mt-3">
          <FetchButton />
        </div>
      </section>
    </main>
  );
}
