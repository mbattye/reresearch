"use client";

import { useActionState } from "react";
import { inviteReader } from "@/app/actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteReader, null);
  return (
    <form action={action} className="mt-3">
      <div className="flex gap-2">
        <input
          type="email"
          name="email"
          required
          inputMode="email"
          autoComplete="off"
          placeholder="friend@example.com"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-[14px]"
        />
        <button
          disabled={pending}
          className="shrink-0 rounded-full bg-fg px-4 text-[14px] font-semibold text-bg transition hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {state && <p className={`mt-2 text-[13px] ${state.ok ? "text-accent" : "text-like"}`}>{state.message}</p>}
    </form>
  );
}
