export function relativeTime(date: Date, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: now.getFullYear() === date.getFullYear() ? undefined : "numeric" });
}

export function authorLine(authors: string[]): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]} et al.`;
}

export const SECTION_LABELS: Record<string, string> = {
  context: "Context",
  approach: "Method",
  result: "Result",
  caveat: "Caveat",
  takeaway: "Takeaway",
};
