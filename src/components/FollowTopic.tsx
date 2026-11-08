"use client";

import { useTransition } from "react";
import { followTopic } from "@/app/actions";

/** Offered on a liked or saved paper from a field the reader doesn't follow yet. */
export function FollowTopic({ category, label }: { category: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px]">
      <span className="text-muted">Want more like this?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => followTopic(category))}
        className="rounded-full border border-line px-3 py-1 font-medium transition hover:bg-raised active:scale-95 disabled:opacity-60"
      >
        {pending ? "Adding…" : `Add ${label} to my topics`}
      </button>
    </p>
  );
}
