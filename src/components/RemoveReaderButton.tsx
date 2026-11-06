"use client";

import { useState, useTransition } from "react";
import { removeReader } from "@/app/actions";

/** Two taps: the first asks, the second removes. */
export function RemoveReaderButton({ userId, email }: { userId: string; email: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="rounded-full px-2 py-0.5 text-[12.5px] text-muted hover:bg-raised hover:text-like">
        Remove
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[12.5px]">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => removeReader(userId))}
        className="rounded-full bg-like px-2.5 py-0.5 font-medium text-white disabled:opacity-50"
        aria-label={`Remove ${email}`}
      >
        {pending ? "Removing…" : "Remove for good"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-2 py-0.5 text-muted hover:bg-raised">
        Cancel
      </button>
    </span>
  );
}
