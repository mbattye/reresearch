import Link from "next/link";
import type { FeedItem } from "@/lib/feed";
import { creditLine, discoveryLabel, institutionLine, relativeTime } from "@/lib/format";
import { categoryShort } from "@/lib/topics";
import { ActionBar } from "./ActionBar";
import { Avatar } from "./Avatar";

export function PostCard({ item }: { item: FeedItem }) {
  const { paper, thread, interaction } = item;
  const read = !!interaction?.readAt;
  const href = `/p/${encodeURIComponent(paper.id)}`;
  const why = discoveryLabel(paper);

  return (
    <article className="relative flex gap-3 border-b border-line px-4 py-3">
      <Avatar category={paper.primaryCategory} />
      <div className="min-w-0 flex-1">
        <header className="flex items-baseline gap-1 text-[14px] leading-5">
          <span className="truncate font-semibold">{creditLine(paper)}</span>
          <span className="max-w-[60%] shrink-0 truncate text-muted">
            · {paper.primaryCategory ? categoryShort(paper.primaryCategory) : (paper.venue ?? "journal")} ·{" "}
            {relativeTime(paper.publishedAt)}
          </span>
        </header>

        {institutionLine(paper.institutions) && (
          <div className="truncate text-[12.5px] text-muted">{institutionLine(paper.institutions)}</div>
        )}
        {why && <div className="mt-0.5 text-[12.5px] font-medium text-accent">{why}</div>}
        <Link href={href} className="block after:absolute after:inset-0 after:content-['']">
          <h2 className={`mt-0.5 text-[15.5px] leading-snug font-semibold ${read ? "text-muted" : ""}`}>
            {thread.headline}
          </h2>
          <p className="post-text mt-1">{thread.hook}</p>
        </Link>

        {thread.keyNumbers.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {thread.keyNumbers.slice(0, 3).map((k) => (
              <li key={k.label} className="rounded-lg bg-raised px-2 py-1 text-[12.5px] leading-4">
                <span className="font-semibold">{k.value}</span> <span className="text-muted">{k.label}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex items-center gap-2 text-[13px] text-muted">
          <span className="font-medium text-accent">Show thread · {thread.posts.length + 1}</span>
          {thread.inputMode === "abstract" && <span>· from abstract only</span>}
          {read && <span>· read</span>}
        </div>

        {/* Above the card-wide link overlay so the buttons stay clickable. */}
        <div className="relative z-10">
          <ActionBar
            paperId={paper.id}
            liked={!!interaction?.liked}
            saved={!!interaction?.saved}
            hidden={!!interaction?.hidden}
            absUrl={paper.absUrl}
          />
        </div>
      </div>
    </article>
  );
}
