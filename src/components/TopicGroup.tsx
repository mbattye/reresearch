"use client";

import { useState } from "react";

/** A collapsible group of topics. Starts open if any are ticked, then stays as the reader leaves it. */
export function TopicGroup({
  name,
  count,
  children,
}: {
  name: string;
  count: { chosen: number; of: number };
  children: React.ReactNode;
}) {
  const [open] = useState(count.chosen > 0);
  return (
    <details open={open} className="group mt-2 rounded-lg border border-line px-2 py-1">
      <summary className="flex items-center gap-2 px-1 py-1.5 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-[11px] text-muted transition-transform group-open:rotate-90">
          ▶
        </span>
        {name}
        <span className="ml-auto text-[12.5px] font-normal text-muted">
          {count.chosen > 0 ? `${count.chosen} of ${count.of}` : "None"}
        </span>
      </summary>
      {children}
    </details>
  );
}
