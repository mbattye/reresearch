import Link from "next/link";
import type { FeedTab } from "@/lib/feed";
import type { TopicCount, TopicId } from "@/lib/topics";
import { FetchButton } from "./FetchButton";
import { SettingsIcon } from "./icons";

const TABS: { id: FeedTab; label: string }[] = [
  { id: "foryou", label: "For you" },
  { id: "latest", label: "Latest" },
  { id: "saved", label: "Saved" },
  { id: "queue", label: "Queue" },
];

function href(tab: FeedTab, topic: TopicId | null) {
  const params = new URLSearchParams();
  if (tab !== "foryou") params.set("tab", tab);
  if (topic) params.set("topic", topic);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

interface Props {
  tab: FeedTab;
  topic?: TopicId | null;
  /** Topics in the current tab, for the filter chips. */
  topics?: TopicCount[];
  total?: number;
}

export function Header({ tab, topic = null, topics = [], total = 0 }: Props) {
  // Chips only help when there's a choice to make (or a filter to clear).
  const showChips = topics.length > 1 || topic !== null;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex h-12 items-center justify-between px-4">
        <Link href="/" className="text-[17px] font-bold tracking-tight">
          re<span className="text-accent">research</span>
        </Link>
        <div className="flex items-center gap-5">
          <FetchButton variant="icon" />
          <Link
            href="/settings"
            className="-m-2 rounded-full p-2 text-muted transition hover:bg-raised hover:text-fg"
            aria-label="Settings"
          >
            <SettingsIcon className="size-5" />
          </Link>
        </div>
      </div>
      <nav className="flex">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={href(t.id, topic)}
            className={`relative flex-1 py-3 text-center text-[14px] ${
              tab === t.id ? "font-semibold text-fg" : "text-muted hover:bg-raised"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-1/2 bottom-0 h-1 w-12 -translate-x-1/2 rounded-full bg-accent" />}
          </Link>
        ))}
      </nav>
      {showChips && (
        <nav aria-label="Filter by topic" className="flex gap-2 overflow-x-auto border-t border-line px-4 py-2 [scrollbar-width:none] sm:flex-wrap">
          <Chip href={href(tab, null)} active={topic === null} label="All" count={total} />
          {topics.map((t) => (
            <Chip key={t.id} href={href(tab, t.id)} active={topic === t.id} label={t.label} count={t.count} />
          ))}
        </nav>
      )}
    </header>
  );
}

function Chip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-3 py-1 text-[13px] whitespace-nowrap transition active:scale-95 ${
        active ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-raised"
      }`}
    >
      {label}
      <span className={active ? "ml-1.5 opacity-70" : "ml-1.5 text-muted"}>{count}</span>
    </Link>
  );
}
