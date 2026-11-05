"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <input
        type="password"
        name="password"
        required
        autoFocus
        placeholder="Password"
        autoComplete="current-password"
        className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[15px]"
      />
      <button disabled={pending} className="w-full rounded-full bg-fg py-2.5 text-[15px] font-semibold text-bg disabled:opacity-50">
        {pending ? "Checking…" : "Sign in"}
      </button>
      {error && <p className="text-[13px] text-like">{error}</p>}
    </form>
  );
}
