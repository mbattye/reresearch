"use client";

import { useState } from "react";
import { AI_KEYWORDS, keywordLine } from "@/lib/topics";

/** The keywords box, with a shortcut that adds any AI starter keywords not already listed. */
export function InterestsBox({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const terms = value.split("\n").map((line) => line.split(/[:=]/)[0].trim().toLowerCase());
  const missing = AI_KEYWORDS.filter((k) => !terms.includes(k.term.toLowerCase()));
  return (
    <>
      <textarea
        name="keywords"
        rows={10}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[14px]"
      />
      {missing.length > 0 && (
        <button
          type="button"
          onClick={() => setValue([value.trimEnd(), ...missing.map(keywordLine)].filter(Boolean).join("\n"))}
          className="mt-2 rounded-full border border-line px-3 py-1 text-[13px] font-medium hover:bg-raised"
        >
          Add AI keywords
        </button>
      )}
    </>
  );
}
