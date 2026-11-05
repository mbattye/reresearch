"use client";

import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard refused (older browsers, some in-app views); the text is visible to select by hand.
        }
      }}
      className="rounded-full border border-line px-3 py-1 text-[13px] font-medium hover:bg-raised"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
