"use client";

import { useEffect, useRef } from "react";
import { summariseNow } from "@/app/actions";

/** Starts writing a thread the first time an unwritten paper is opened. */
export function WriteOnOpen({ paperId }: { paperId: string }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void summariseNow(paperId);
  }, [paperId]);
  return null;
}
