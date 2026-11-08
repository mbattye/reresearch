"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { drawRandomPaper, type RandomResult } from "@/app/actions";

/** Draws a paper from any field. Nothing about the reader changes unless they open it. */
export function RandomPaper({ hasKey }: { hasKey: boolean }) {
  const [result, setResult] = useState<RandomResult | null>(null);
  const [drawing, startDrawing] = useTransition();
  const draw = () => startDrawing(async () => setResult(await drawRandomPaper()));
  const paper = result?.ok ? result.paper : null;
  const button = "rounded-full border border-line px-3 py-1 text-[13px] font-medium transition hover:bg-raised active:scale-95 disabled:opacity-60";

  return (
    <section aria-label="Random paper" className="border-b border-line px-4 py-2.5">
      {!paper ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[13.5px] leading-snug">
            <span className="font-semibold">Random paper</span>
            <span className="text-muted"> from any field, whatever your settings</span>
          </p>
          <button type="button" onClick={draw} disabled={drawing} className={`${button} shrink-0`}>
            {drawing ? "Finding one…" : "Surprise me"}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-[12.5px] font-medium text-accent">Random · {paper.field}</p>
            <button
              type="button"
              onClick={() => setResult(null)}
              aria-label="Dismiss random paper"
              className="-m-1 shrink-0 rounded-full p-1 text-muted hover:text-fg"
            >
              ✕
            </button>
          </div>
          <h2 className="mt-0.5 text-[15.5px] leading-snug font-semibold">{paper.title}</h2>
          <p className="mt-0.5 truncate text-[13px] text-muted">{paper.authors}</p>
          <p className="mt-1 line-clamp-4 text-[14px] leading-snug">{paper.abstract}</p>
          <div className="mt-2.5 flex items-center gap-2">
            {paper.written || hasKey ? (
              <Link
                href={`/p/${encodeURIComponent(paper.id)}`}
                className="rounded-full bg-fg px-3.5 py-1 text-[13px] font-semibold text-bg transition hover:opacity-85 active:scale-95"
              >
                {paper.written ? "Read the thread" : "Write it up"}
              </Link>
            ) : (
              <Link href="/settings" className="text-[13px] font-medium text-accent">
                Add a key to write it up
              </Link>
            )}
            <button type="button" onClick={draw} disabled={drawing} className={button}>
              {drawing ? "Finding one…" : "Another"}
            </button>
            {!paper.written && hasKey && <span className="ml-auto text-[12px] text-muted">uses your key</span>}
          </div>
        </div>
      )}
      {result && !result.ok && <p className="mt-1.5 text-[12.5px] text-like">{result.message}</p>}
    </section>
  );
}
