"use client";

import { useTransition } from "react";
import { rewriteThread } from "@/app/actions";

export function RewriteButton({ paperId, levelName }: { paperId: string; levelName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => rewriteThread(paperId))}
      className="rounded-full border border-line px-3 py-1 text-[13px] font-medium transition hover:bg-raised active:scale-95 disabled:opacity-60"
    >
      {pending ? "Starting…" : `Rewrite at ${levelName}`}
    </button>
  );
}
