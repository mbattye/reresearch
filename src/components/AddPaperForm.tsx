"use client";

import { useActionState } from "react";
import { addPapers, type AddPaperState } from "@/app/actions";

export function AddPaperForm() {
  const [state, action, pending] = useActionState<AddPaperState, FormData>(addPapers, null);
  return (
    <form action={action} className="mt-3">
      <div className="flex gap-2">
        <input
          name="papers"
          required
          placeholder="https://arxiv.org/abs/2611.06729"
          autoComplete="off"
          autoCapitalize="off"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-[14px]"
        />
        <button
          disabled={pending}
          className="shrink-0 rounded-full bg-fg px-4 text-[14px] font-semibold text-bg disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state && <p className={`mt-2 text-[13px] ${state.ok ? "text-accent" : "text-like"}`}>{state.message}</p>}
    </form>
  );
}
