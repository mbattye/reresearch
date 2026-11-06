"use client";

import { useActionState, useTransition } from "react";
import { removeApiKey, saveApiKey } from "@/app/actions";
import type { Provider } from "@/lib/db/schema";

interface Props {
  provider: Provider;
  label: string;
  /** Last four characters of the stored key, if there is one. */
  hint: string | null;
  placeholder: string;
  help: string;
}

/** Add, replace or remove one provider's key. The key itself never comes back to the browser. */
export function ApiKeyForm({ provider, label, hint, placeholder, help }: Props) {
  const [state, action, pending] = useActionState(saveApiKey, null);
  const [removing, startRemoving] = useTransition();
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium">{label}</span>
        {hint ? (
          <span className="flex items-center gap-2 text-[13px]">
            <span className="font-mono text-muted">…{hint}</span>
            <button
              type="button"
              disabled={removing}
              onClick={() => startRemoving(() => removeApiKey(provider))}
              className="rounded-full px-2 py-0.5 text-like hover:bg-raised disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </span>
        ) : (
          <span className="text-[12.5px] text-muted">Not set</span>
        )}
      </div>
      <form action={action} className="mt-2 flex gap-2">
        <input type="hidden" name="provider" value={provider} />
        <input
          name="key"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={hint ? "Paste a new key to replace it" : placeholder}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px]"
        />
        <button
          disabled={pending}
          className="shrink-0 rounded-full bg-fg px-4 text-[13px] font-semibold text-bg transition hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Save"}
        </button>
      </form>
      {state ? (
        <p className={`mt-1.5 text-[12.5px] ${state.ok ? "text-accent" : "text-like"}`}>{state.message}</p>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-muted">{help}</p>
      )}
    </div>
  );
}
