"use client";

import { useEffect } from "react";
import { collectBatchResults } from "@/app/actions";

/** While batched papers are waiting, check for finished batches once a minute. */
export function BatchCollector({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    void collectBatchResults();
    const id = setInterval(() => void collectBatchResults(), 60_000);
    return () => clearInterval(id);
  }, [active]);
  return null;
}
