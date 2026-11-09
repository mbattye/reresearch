/** Names for the reading-level slider; usable from client components. Mirrors the frontmatter in src/skills/levels. */
export interface LevelMeta {
  level: number;
  slug: string;
  name: string;
  tagline: string;
}

export const LEVEL_META: LevelMeta[] = [
  { level: 1, slug: "crayons", name: "Crayons", tagline: "Explain it like I'm five" },
  { level: 2, slug: "pub-quiz", name: "Pub quiz", tagline: "Curious, no science background needed" },
  { level: 3, slug: "science-section", name: "Science section", tagline: "Keen reader of popular science" },
  { level: 4, slug: "undergraduate", name: "Undergraduate", tagline: "Comfortable with university-level science (the default)" },
  { level: 5, slug: "journal-club", name: "Journal club", tagline: "Grad student, or working in an adjacent field" },
  { level: 6, slug: "referee-2", name: "Referee #2", tagline: "Expert in the field, here to be convinced" },
];

export function levelName(level: number): string {
  return LEVEL_META.find((l) => l.level === level)?.name ?? `Level ${level}`;
}
