"use client";

import { useCallback, useEffect, useState } from "react";

const STEPS = [
  {
    spot: "keys",
    title: "1. Add one AI key",
    body: "This is the only thing you have to add. Connect OpenRouter in a couple of taps, or paste a key from Anthropic, OpenAI or OpenRouter. You pay them directly. Papers come from free sources, so they need no key.",
  },
  {
    spot: "level",
    title: "2. Set your reading level",
    body: "Drag the slider from Crayons to Referee #2. It sets how much background threads assume. Going back to a level you've already read costs nothing.",
  },
  {
    spot: "topics",
    title: "3. Tick your topics",
    body: "Open a group and tick the fields you want. Each morning, and whenever you fetch, new papers in these are collected and the write-ups take turns across them.",
  },
  {
    spot: "interests",
    title: "4. Fine-tune with interests",
    body: "Optional, and empty to start. Terms here rank matching papers higher within your topics. Likes and saves teach it the same way, so you can leave this alone.",
  },
  {
    spot: "writing",
    title: "5. Choose how threads are written",
    body: "Optional. Pick the model and effort, and set a monthly budget. Writing stops for the month when it's reached.",
  },
  {
    spot: "fetch",
    title: "6. Fetch your first papers",
    body: "Tap this any time to fetch new papers and write up the best few. Everything you change here saves by itself, so there's no Save button.",
  },
];

const SEEN = "reresearch:settings-tour-seen";

/** Steps through the Settings page, spotlighting each section. Opens once by itself, then from its button. */
export function SettingsTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(SEEN);
    } catch {}
    if (seen) return;
    // Lets the page settle, so the first scroll lands in the right place.
    const open = setTimeout(() => {
      try {
        localStorage.setItem(SEEN, "1");
      } catch {}
      setStep(0);
    }, 500);
    return () => clearTimeout(open);
  }, []);

  useEffect(() => {
    if (step === null) return;
    const el = document.querySelector(`[data-tour="${STEPS[step].spot}"]`);
    el?.classList.add("tour-spot");
    // Sections are far apart, so jump rather than animate through the page.
    el?.scrollIntoView({ block: "start" });
    return () => el?.classList.remove("tour-spot");
  }, [step]);

  const close = useCallback(() => setStep(null), []);
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close]);

  return (
    <>
      <section className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-[13.5px] text-muted">New here? It only takes a minute.</p>
        <button
          type="button"
          onClick={() => setStep(0)}
          className="shrink-0 rounded-full border border-line px-3 py-1 text-[13px] font-medium transition hover:bg-raised active:scale-95"
        >
          Show me around
        </button>
      </section>
      {step !== null && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <div role="dialog" aria-label="Settings tour" className="w-full max-w-md rounded-2xl bg-fg p-4 text-bg shadow-xl">
            <p className="text-[15px] font-semibold">{STEPS[step].title}</p>
            <p className="mt-1 text-[14px] leading-snug opacity-85">{STEPS[step].body}</p>
            <div className="mt-3 flex items-center gap-2 text-[13.5px]">
              <button type="button" onClick={close} className="rounded-full px-2 py-1.5 opacity-70 hover:opacity-100">
                Skip
              </button>
              <span className="ml-auto text-[12.5px] opacity-70">
                {step + 1} of {STEPS.length}
              </span>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="rounded-full border border-current/30 px-3 py-1.5 font-medium"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (step === STEPS.length - 1 ? close() : setStep(step + 1))}
                className="rounded-full bg-bg px-4 py-1.5 font-semibold text-fg"
              >
                {step === STEPS.length - 1 ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
