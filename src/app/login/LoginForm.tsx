"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { requestAccess, requestSignInLink } from "../actions";

export function LoginForm() {
  const [asking, setAsking] = useState(false);
  const [signIn, signInAction, signingIn] = useActionState(requestSignInLink, null);
  const [access, accessAction, requesting] = useActionState(requestAccess, null);
  const state = asking ? access : signIn;
  const pending = asking ? requesting : signingIn;
  const linkExpired = useSearchParams().get("link") === "expired";
  if (state?.ok) {
    return (
      <div className="mt-6 rounded-2xl bg-accent-soft px-4 py-4 text-[15px] leading-snug text-accent" role="status">
        <p className="font-semibold">{asking ? "Request received" : "Check your email"}</p>
        <p className="mt-1 text-[14px]">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={asking ? accessAction : signInAction} className="mt-6 space-y-3">
      {linkExpired && !asking && (
        <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent">
          That link has expired or was already used. Enter your email for a new one.
        </p>
      )}
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
        {asking ? (pending ? "Sending…" : "Request access") : pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state && !state.ok && <p className="text-[13px] text-like">{state.message}</p>}
      <p className="text-[12.5px] text-muted">
        {asking ? "Already have access? " : "reresearch is invite only for now. "}
        <button type="button" onClick={() => setAsking(!asking)} className="font-medium text-accent hover:underline">
          {asking ? "Sign in" : "Request access"}
        </button>
      </p>
    </form>
  );
}
