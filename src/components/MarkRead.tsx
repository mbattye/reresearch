"use client";

import { useEffect } from "react";
import { markThreadRead } from "@/app/actions";

export function MarkRead({ paperId }: { paperId: string }) {
  useEffect(() => {
    // Only count it as read if the thread stayed open for a moment.
    const id = setTimeout(() => void markThreadRead(paperId), 4000);
    return () => clearTimeout(id);
  }, [paperId]);
  return null;
}
