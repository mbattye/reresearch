"use client";

import { useActionState } from "react";
import { requestSignInLink } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(requestSignInLink, null);
  if (state?.ok) {
    return (
      <div className="mt-6 rounded-2xl bg-accent-soft px-4 py-4 text-[15px] leading-snug text-accent" role="status">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-[14px]">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-3">
      <input
        type="email"
        name="email"
        required
        autoFocus
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[15px]"
      />
      <button
        disabled={pending}
        className="w-full rounded-full bg-fg py-2.5 text-[15px] font-semibold text-bg transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state && !state.ok && <p className="text-[13px] text-like">{state.message}</p>}
      <p className="text-[12.5px] text-muted">reresearch is invite only for now.</p>
    </form>
  );
}
