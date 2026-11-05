import Link from "next/link";
import type { Paper } from "@/lib/db/schema";
import { authorLine, relativeTime } from "@/lib/format";
import { categoryShort } from "@/lib/topics";
import { SummariseButton } from "./SummariseButton";

const STATUS_LABEL: Record<Paper["status"], string> = {
  new: "",
  summarising: "Summarising…",
  batched: "In the half-price batch, usually ready within the hour",
  ready: "Ready",
  failed: "Failed",
};

export function QueueList({ papers }: { papers: Paper[] }) {
  return (
    <ul>
      {papers.map((p) => (
        <li key={p.id} className="border-b border-line px-4 py-3">
          <div className="flex items-baseline gap-1 text-[13px] text-muted">
            <span className="truncate">{authorLine(p.authors)}</span>
            <span className="shrink-0">
              · {p.primaryCategory ? categoryShort(p.primaryCategory) : (p.venue ?? "journal")} · {relativeTime(p.publishedAt)}
            </span>
          </div>
          <Link href={`/p/${encodeURIComponent(p.id)}`} className="mt-0.5 block text-[15px] leading-snug font-medium">
            {p.title}
          </Link>
          {p.boostReasons.length > 0 && (
            <p className="mt-1 text-[12.5px] text-accent">{p.boostReasons.map((r) => r.term).join(" · ")}</p>
          )}
          {p.scoreReasons.length > 0 && (
            <p className="mt-1 text-[12.5px] text-muted">
              Matches: {p.scoreReasons.slice(0, 4).map((r) => r.term).join(", ")}
            </p>
          )}
          {p.status === "failed" && p.error && <p className="mt-1 text-[12.5px] text-like">{p.error}</p>}
          <div className="mt-2 flex items-center gap-3 text-[13px]">
            {p.status === "summarising" || p.status === "batched" ? (
              <span className="animate-pulse text-accent">{STATUS_LABEL[p.status]}</span>
            ) : (
              <SummariseButton paperId={p.id} retry={p.status === "failed"} />
            )}
            {p.score !== 0 && <span className="text-muted">score {p.score.toFixed(1)}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
