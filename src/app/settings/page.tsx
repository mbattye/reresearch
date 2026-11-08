import { Suspense } from "react";
import { connection } from "next/server";
import { AccessRequestRow } from "@/components/AccessRequestRow";
import { AddPaperForm } from "@/components/AddPaperForm";
import { BackToFeed } from "@/components/BackToFeed";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import { AutoSaveForm } from "@/components/AutoSaveForm";
import { FetchButton } from "@/components/FetchButton";
import { InterestsBox } from "@/components/InterestsBox";
import { InviteForm } from "@/components/InviteForm";
import { LevelSlider } from "@/components/LevelSlider";
import { ModelPicker } from "@/components/ModelPicker";
import { RemoveReaderButton } from "@/components/RemoveReaderButton";
import { SettingsTour } from "@/components/SettingsTour";
import { TopicGroup } from "@/components/TopicGroup";
import { pendingRequests } from "@/lib/access";
import { listReaders } from "@/lib/admin";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { getSpend, getTopAffinities } from "@/lib/feed";
import type { Provider } from "@/lib/db/schema";
import { hasKeyFor, listKeys } from "@/lib/keys";
import { getOpenRouterModels } from "@/lib/openrouter";
import { getPreferences, monthlyBudget, summaryConfigFor } from "@/lib/pipeline";
import { formatUsd } from "@/lib/pricing";
import { providerLabel, PROVIDERS } from "@/lib/providers";
import {
  CATEGORY_GROUPS,
  CATEGORY_LABELS,
  categorySource,
  keywordLine,
  OPENAI_MODELS,
  SUMMARY_MODELS,
} from "@/lib/topics";
import { signOut } from "../actions";
import { timeAgo } from "@/lib/format";

export const maxDuration = 300;

export default function SettingsPage() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-[calc(3rem+env(safe-area-inset-top))] items-center gap-6 border-b border-line bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <BackToFeed />
        <span className="text-[17px] font-bold">Settings</span>
        <div data-tour="fetch" className="ml-auto rounded-full">
          <FetchButton variant="icon" />
        </div>
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
  const reader = await requireUser();
  const [prefs, affinities, spend, keys, openrouterModels] = await Promise.all([
    getPreferences(reader),
    getTopAffinities(reader.id),
    getSpend(reader.id),
    listKeys(reader.id),
    getOpenRouterModels(),
  ]);
  const config = summaryConfigFor(prefs);
  const budget = monthlyBudget(prefs);
  const extra = prefs.categories.filter((c) => !(c in CATEGORY_LABELS));
  const keyHint = (p: Provider) => keys.find((k) => k.provider === p)?.hint ?? null;
  // Admins can fall back to the deployment's own Anthropic key.
  const canWrite = await hasKeyFor(reader.id, reader.email, config.provider);

  return (
    <main className="divide-y divide-line">
      <SettingsTour />
      <section className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <h2 className={sectionTitle}>Signed in</h2>
          <p className="truncate text-[13px] text-muted">
            {reader.email}
            {reader.isAdmin && " · admin"}
          </p>
        </div>
        <form action={signOut}>
          <button className="shrink-0 rounded-full border border-line px-3 py-1 text-[13px] font-medium transition hover:bg-raised active:scale-95">
            Sign out
          </button>
        </form>
      </section>

      <section data-tour="keys" className="px-4 py-4">
        <h2 className={sectionTitle}>Your API keys</h2>
        <p className={hint}>
          Threads are written with your own key, so you pay your provider directly. Keys are encrypted, never shown
          again, and only used to write your threads. Setting a spending limit with your provider is a good idea.
        </p>
        {!canWrite && (
          <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent">
            Add a key for {providerLabel(config.provider)} (or switch provider below) to start writing threads.
          </p>
        )}
        <div className="mt-3 grid gap-2">
          {PROVIDERS.map((p) => (
            <ApiKeyForm key={p.id} provider={p} hint={keyHint(p.id)} />
          ))}
        </div>
      </section>

      {reader.isAdmin && <AdminSection reader={reader} />}

      <section className="px-4 py-4">
        <h2 className={sectionTitle}>Add a paper</h2>
        <p className={hint}>
          Paste arXiv links or ids, or DOIs (one or more). Journal papers are read from their free legal copy when one
          exists, otherwise from the abstract.
        </p>
        <AddPaperForm />
      </section>

      <AutoSaveForm>
        <section data-tour="level" className="px-4 py-4">
          <h2 className={sectionTitle}>Reading level</h2>
          <p className={hint}>
            How much background threads assume. Changes save as you make them and apply to threads written from now on.
            Threads you already have keep their level. Open one to rewrite it at yours, which costs about the same as
            writing it did and only ever happens once: every version is kept, so going back to a level is free.
          </p>
          <div className="mt-3">
            <LevelSlider initial={prefs.readingLevel} />
          </div>
        </section>

        <section data-tour="topics" className="px-4 py-4">
          <h2 className={sectionTitle}>Topics</h2>
          <p className={hint}>New papers in these are fetched on each run. Changes save as you make them.</p>
          {CATEGORY_GROUPS.map((group) => {
            const chosen = Object.keys(group.labels).filter((c) => prefs.categories.includes(c)).length;
            return (
            <TopicGroup key={group.name} name={group.name} count={{ chosen, of: Object.keys(group.labels).length }}>
              <div className="mt-1 grid gap-1 pb-1">
                {Object.entries(group.labels).map(([cat, label]) => (
                  <label key={cat} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-[14px] hover:bg-raised">
                    <input
                      type="checkbox"
                      name="category"
                      value={cat}
                      defaultChecked={prefs.categories.includes(cat)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span className="min-w-0">{label}</span>
                    <span className="ml-auto max-w-[45%] truncate font-mono text-[12px] text-muted">{categorySource(cat)}</span>
                  </label>
                ))}
              </div>
            </TopicGroup>
            );
          })}
          <label className="mt-3 block text-[13px] text-muted">
            Other arXiv categories (space separated)
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
          <p className={hint}>Checked on every run alongside your topics. Only the best matches get written up.</p>
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

        <section data-tour="interests" className="px-4 py-4">
          <h2 className={sectionTitle}>Interests</h2>
          <p className={hint}>
            One per line. Optional weight after a colon (default 1; negative to steer away). Title matches count double.
          </p>
          <InterestsBox initial={prefs.keywords.map(keywordLine).join("\n")} />
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

        <section data-tour="writing" className="px-4 py-4">
          <h2 className={sectionTitle}>Writing threads</h2>
          <p className={hint}>
            Cheaper models are faster but less careful with nuance and numbers. With Anthropic, the daily run uses the
            half-price batch API.
          </p>
          <div className="mt-3">
            <ModelPicker
              provider={config.provider}
              model={config.model}
              anthropicModels={SUMMARY_MODELS}
              openaiModels={OPENAI_MODELS}
              openrouterModels={openrouterModels}
              hasKey={{
                anthropic: !!keyHint("anthropic") || reader.isAdmin,
                openai: !!keyHint("openai"),
                openrouter: !!keyHint("openrouter"),
              }}
            />
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
              <span className="block text-[12.5px] text-muted">
                Anthropic only. About 3× the cost. Off reads the extracted text.
              </span>
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
        </section>
      </AutoSaveForm>

      <section className="px-4 py-4">
        <h2 className={sectionTitle}>Spend</h2>
        <p className="mt-1 text-[14px]">
          {formatUsd(spend.month)} of {formatUsd(budget)} this month across {spend.monthCount} thread
          {spend.monthCount === 1 ? "" : "s"}
          {spend.count > 0 && <span className="text-muted"> · {formatUsd(spend.total / spend.count)} average</span>}
        </p>
        <p className={hint}>
          Threads your key paid for, estimated from token usage at list prices (OpenRouter reports its own cost). Threads
          someone else already wrote at your level are free.
        </p>
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

async function AdminSection({ reader }: { reader: CurrentUser }) {
  const [readers, requests] = await Promise.all([listReaders(), pendingRequests()]);
  return (
    <section className="px-4 py-4">
      <h2 className={sectionTitle}>Readers</h2>
      <p className={hint}>
        reresearch is invite only. Inviting someone creates their account and emails them a sign-in link; they add their
        own API key.
      </p>
      <InviteForm />
      {requests.length > 0 && (
        <>
          <h3 className="mt-4 px-1 text-[13px] font-medium text-muted">Asking for access</h3>
          <ul className="mt-1 divide-y divide-line rounded-xl border border-line">
            {requests.map((r) => (
              <AccessRequestRow key={r.email} email={r.email} age={timeAgo(r.createdAt)} />
            ))}
          </ul>
        </>
      )}
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        {readers.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
            <div className="min-w-0">
              <div className="truncate font-medium">{r.email}</div>
              <div className="text-muted">
                {r.lastSeen ? `seen ${timeAgo(r.lastSeen)}` : "hasn't signed in yet"}
                {" · "}
                {r.hasKey ? "has a key" : "no key"}
                {r.monthSpend > 0 && ` · ${formatUsd(r.monthSpend)} this month`}
              </div>
            </div>
            {r.id === reader.id ? (
              <span className="text-[12.5px] text-muted">you</span>
            ) : (
              <RemoveReaderButton userId={r.id} email={r.email} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
