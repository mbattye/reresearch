"use client";

import { useTransition } from "react";
import { summariseNow } from "@/app/actions";

export function SummariseButton({ paperId, retry }: { paperId: string; retry?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => summariseNow(paperId))}
      className="rounded-full border border-line px-3 py-1 font-medium hover:bg-raised disabled:opacity-50"
    >
      {pending ? "Starting…" : retry ? "Retry" : "Summarise"}
    </button>
  );
}
