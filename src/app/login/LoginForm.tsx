"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { requestAccess, requestSignInLink } from "../actions";

export function LoginForm() {
  // A new key starts the form over, clearing what the last attempt returned.
  const [attempt, setAttempt] = useState(0);
  return <Form key={attempt} onStartOver={() => setAttempt((n) => n + 1)} />;
}

function Form({ onStartOver }: { onStartOver: () => void }) {
  const [email, setEmail] = useState("");
  // null until the reader chooses; an email without access moves them to the request form.
  const [choice, setChoice] = useState<boolean | null>(null);
  const [signIn, signInAction, signingIn] = useActionState(requestSignInLink, null);
  const [access, accessAction, requesting] = useActionState(requestAccess, null);
  const asking = choice ?? !!signIn?.needsAccess;
  const state = asking ? access : signIn;
  const pending = asking ? requesting : signingIn;
  const params = useSearchParams();
  const linkExpired = params.get("link") === "expired";
  const deleted = params.get("account") === "deleted";
  if (state?.ok) {
    return (
      <div className="mt-6">
        <div className="rounded-2xl bg-accent-soft px-4 py-4 text-[15px] leading-snug text-accent" role="status">
          <p className="font-semibold">{asking ? "Request received" : "Check your email"}</p>
          <p className="mt-1 text-[14px]">{state.message}</p>
        </div>
        <button type="button" onClick={onStartOver} className="mt-3 text-[13px] font-medium text-accent hover:underline">
          Use a different email
        </button>
      </div>
    );
  }
  return (
    <form
      action={asking ? accessAction : signInAction}
      onSubmit={() => {
        if (!asking) setChoice(null);
      }}
      className="mt-6 space-y-3"
    >
      {deleted && (
        <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent">
          Your account and data have been deleted.
        </p>
      )}
      {linkExpired && !asking && (
        <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent">
          That link has expired or was already used. Enter your email for a new one.
        </p>
      )}
      {asking && signIn?.needsAccess && (
        <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent">
          {signIn.message}
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
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[15px]"
      />
      <button
        disabled={pending}
        className="w-full rounded-full bg-fg py-2.5 text-[15px] font-semibold text-bg transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      >
        {asking ? (pending ? "Sending…" : "Request access") : pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state && !state.ok && !(state === signIn && signIn?.needsAccess) && <p className="text-[13px] text-like">{state.message}</p>}
      <p className="text-[12.5px] text-muted">
        {asking ? "Already have access? " : "reresearch is invite only for now. "}
        <button type="button" onClick={() => setChoice(!asking)} className="font-medium text-accent hover:underline">
          {asking ? "Sign in" : "Request access"}
        </button>
      </p>
    </form>
  );
}
