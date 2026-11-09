"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/actions";

/** Asks first, because this can&apos;t be undone. */
export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-3 rounded-full border border-line px-3 py-1 text-[13px] font-medium text-like transition hover:bg-raised active:scale-95"
      >
        Delete my account
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-like p-3">
      <p className="text-[14px] font-medium">Delete your account for good?</p>
      <p className="mt-1 text-[13px] leading-snug text-muted">
        Your email, API keys, settings and reading history go immediately, and this can&apos;t be undone. Threads your key paid
        for stay available to other readers, with no link to you.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => deleteAccount())}
          className="rounded-full bg-like px-3.5 py-1 text-[13px] font-semibold text-white transition active:scale-95 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Yes, delete everything"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-full border border-line px-3 py-1 text-[13px] font-medium hover:bg-raised"
        >
          Keep my account
        </button>
      </div>
    </div>
  );
}
