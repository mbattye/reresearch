import Link from "next/link";
import type { QueueItem } from "@/lib/feed";
import { creditLine, relativeTime } from "@/lib/format";
import { categoryShort } from "@/lib/topics";
import { SummariseButton } from "./SummariseButton";

const STATUS_LABEL = {
  writing: "Writing…",
  batched: "In the half-price batch, usually ready within the hour",
};

export function QueueList({ items }: { items: QueueItem[] }) {
  return (
    <ul>
      {items.map(({ paper: p, interaction, job }) => (
        <li key={p.id} className="border-b border-line px-4 py-3">
          <div className="flex items-baseline gap-1 text-[13px] text-muted">
            <span className="truncate">{creditLine(p)}</span>
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
          {interaction.scoreReasons.length > 0 && (
            <p className="mt-1 text-[12.5px] text-muted">
              Matches: {interaction.scoreReasons.slice(0, 4).map((r) => r.term).join(", ")}
            </p>
          )}
          {job?.status === "failed" && job.error && <p className="mt-1 text-[12.5px] text-like">{job.error}</p>}
          <div className="mt-2 flex items-center gap-3 text-[13px]">
            {job && job.status !== "failed" ? (
              <span className="animate-pulse text-accent">{STATUS_LABEL[job.status]}</span>
            ) : (
              <SummariseButton paperId={p.id} retry={job?.status === "failed"} />
            )}
            {interaction.score !== 0 && <span className="text-muted">score {interaction.score.toFixed(1)}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
