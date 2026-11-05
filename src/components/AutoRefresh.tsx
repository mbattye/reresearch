"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches server data on an interval while something is being summarised. */
export function AutoRefresh({ active, ms = 8000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [active, ms, router]);
  return null;
}
