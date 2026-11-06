import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BatchCollector } from "@/components/BatchCollector";
import { Header } from "@/components/Header";
import { PostCard } from "@/components/PostCard";
import { QueueList } from "@/components/QueueList";
import { requireUser } from "@/lib/auth";
import { getFeed, getJobCounts, getQueue, type FeedTab } from "@/lib/feed";
import { getPreferences } from "@/lib/pipeline";
import { FetchButton } from "@/components/FetchButton";

export const maxDuration = 300;

const TAB_IDS: FeedTab[] = ["foryou", "latest", "saved", "queue"];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Header tab="foryou" />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  const raw = (await searchParams).tab;
  const tab = TAB_IDS.includes(raw as FeedTab) ? (raw as FeedTab) : "foryou";
  const reader = await requireUser();
  const { readingLevel } = await getPreferences(reader);
  const counts = await getJobCounts(reader.id);
  const writing = counts.writing ?? 0;
  const summarising = writing > 0;

  return (
    <>
      <Header tab={tab} />
      <AutoRefresh active={summarising || tab === "queue"} />
      <BatchCollector active={(counts.batched ?? 0) > 0} />
      {summarising && tab !== "queue" && (
        <Link href="/?tab=queue" className="block border-b border-line bg-accent-soft px-4 py-2 text-[13px] text-accent">
          Writing {writing} thread{writing === 1 ? "" : "s"}…
        </Link>
      )}
      {tab === "queue" ? (
        <Queue userId={reader.id} level={readingLevel} />
      ) : (
        <Feed userId={reader.id} level={readingLevel} tab={tab} />
      )}
    </>
  );
}

async function Feed({ userId, level, tab }: { userId: string; level: number; tab: Exclude<FeedTab, "queue"> }) {
  const items = await getFeed(userId, level, tab);
  if (items.length === 0) return <EmptyState tab={tab} />;
  return (
    <main>
      {items.map((item) => (
        <PostCard key={item.paper.id} item={item} />
      ))}
      <p className="px-4 py-10 text-center text-[13px] text-muted">You&apos;re up to date.</p>
    </main>
  );
}

async function Queue({ userId, level }: { userId: string; level: number }) {
  const items = await getQueue(userId, level);
  return (
    <main>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-[13px] text-muted">
          Fetched papers not yet in your feed, best matches first. Summarise any you want to read.
        </p>
        <FetchButton />
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-[14px] text-muted">Nothing queued. Fetch new papers to fill it.</p>
      ) : (
        <QueueList items={items} />
      )}
    </main>
  );
}

function EmptyState({ tab }: { tab: FeedTab }) {
  if (tab === "saved") {
    return <p className="px-6 py-16 text-center text-[15px] text-muted">Nothing saved yet. Tap the bookmark on a post to keep it here.</p>;
  }
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[17px] font-semibold">Your feed is empty</p>
      <p className="mt-1 text-[14px] text-muted">
        Fetch the latest papers from your arXiv categories and the best matches get written up as threads.
      </p>
      <div className="mt-5 flex justify-center">
        <FetchButton />
      </div>
      <p className="mt-4 text-[13px] text-muted">
        Or add a specific paper in <Link href="/settings" className="text-accent">settings</Link>.
      </p>
    </div>
  );
}
