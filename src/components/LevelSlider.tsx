"use client";

import { useState } from "react";
import { LEVEL_META } from "@/lib/level-meta";

/** Reading-level slider for the settings form; submits as `readingLevel`. */
export function LevelSlider({ initial }: { initial: number }) {
  const [level, setLevel] = useState(initial);
  const meta = LEVEL_META.find((l) => l.level === level) ?? LEVEL_META[3];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold">{meta.name}</span>
        <span className="text-right text-[12.5px] text-muted">{meta.tagline}</span>
      </div>
      <input
        type="range"
        name="readingLevel"
        min={1}
        max={6}
        step={1}
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        aria-label="Reading level"
        aria-valuetext={meta.name}
        className="mt-3 w-full accent-[var(--accent)]"
        list="reading-levels"
      />
      <datalist id="reading-levels">
        {LEVEL_META.map((l) => (
          <option key={l.level} value={l.level} label={l.name} />
        ))}
      </datalist>
      <div className="mt-1 flex justify-between text-[11.5px] text-muted">
        <span>Crayons</span>
        <span>Referee #2</span>
      </div>
    </div>
  );
}
