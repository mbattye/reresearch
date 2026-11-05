import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { LEVEL_META, type LevelMeta } from "./level-meta";

// The level guides are plain markdown in src/skills/levels (shipped to Vercel via
// outputFileTracingIncludes in next.config.ts). Edit them there; no code changes needed.
const DIR = path.join(process.cwd(), "src/skills/levels");

export interface Level extends LevelMeta {
  /** The guide itself, without frontmatter or the calibration example's heading level changes. */
  body: string;
}

let cache: Map<number, Level> | undefined;

function load(): Map<number, Level> {
  const levels = new Map<number, Level>();
  for (const file of readdirSync(DIR).filter((f) => /^\d-.*\.md$/.test(f))) {
    const raw = readFileSync(path.join(DIR, file), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`Level guide ${file} has no frontmatter`);
    const meta = Object.fromEntries(
      m[1].split("\n").map((line) => {
        const i = line.indexOf(":");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
    );
    const level = Number(meta.level);
    levels.set(level, { level, slug: meta.slug, name: meta.name, tagline: meta.tagline, body: m[2].trim() });
  }
  for (const meta of LEVEL_META) {
    if (!levels.has(meta.level)) throw new Error(`Missing level guide for level ${meta.level}`);
  }
  return levels;
}

export function getLevel(level: number): Level {
  // Re-read in development so edits to the guides apply without a restart.
  if (!cache || process.env.NODE_ENV !== "production") cache = load();
  return cache.get(level) ?? cache.get(DEFAULT_LEVEL)!;
}

export const DEFAULT_LEVEL = 4;
