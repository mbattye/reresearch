import Link from "next/link";
import type { FeedTab } from "@/lib/feed";
import { FetchButton } from "./FetchButton";
import { SettingsIcon } from "./icons";

const TABS: { id: FeedTab; label: string }[] = [
  { id: "foryou", label: "For you" },
  { id: "latest", label: "Latest" },
  { id: "saved", label: "Saved" },
  { id: "queue", label: "Queue" },
];

export function Header({ tab }: { tab: FeedTab }) {
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
            href={t.id === "foryou" ? "/" : `/?tab=${t.id}`}
            className={`relative flex-1 py-3 text-center text-[14px] ${
              tab === t.id ? "font-semibold text-fg" : "text-muted hover:bg-raised"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-1/2 bottom-0 h-1 w-12 -translate-x-1/2 rounded-full bg-accent" />}
          </Link>
        ))}
      </nav>
    </header>
  );
}
