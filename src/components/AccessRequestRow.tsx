"use client";

import { useState, useTransition } from "react";
import { approveRequest, rejectRequest } from "@/app/actions";

/** Approving emails them an invite; declining tells them nothing. */
export function AccessRequestRow({ email, age }: { email: string; age: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const approve = () =>
    startTransition(async () => {
      const result = await approveRequest(email);
      setError(result?.ok ? null : (result?.message ?? "The invite failed."));
    });
  return (
    <li className="px-3 py-2.5 text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{email}</div>
          <div className="text-muted">asked {age}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[12.5px]">
          <button
            type="button"
            disabled={pending}
            onClick={approve}
            className="rounded-full bg-fg px-2.5 py-0.5 font-medium text-bg disabled:opacity-50"
            aria-label={`Approve ${email}`}
          >
            {pending ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => rejectRequest(email))}
            className="rounded-full px-2 py-0.5 text-muted hover:bg-raised hover:text-like disabled:opacity-50"
            aria-label={`Decline ${email}`}
          >
            Decline
          </button>
        </span>
      </div>
      {error && <p className="mt-1 text-like">{error}</p>}
    </li>
  );
}
