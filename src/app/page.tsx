import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AutoRefresh } from "@/components/AutoRefresh";
import { RememberFeed } from "@/components/BackToFeed";
import { BatchCollector } from "@/components/BatchCollector";
import { Header } from "@/components/Header";
import { PostCard } from "@/components/PostCard";
import { QueueList } from "@/components/QueueList";
import { RandomPaper } from "@/components/RandomPaper";
import { Welcome } from "@/components/Welcome";
import { requireUser } from "@/lib/auth";
import { getFeed, getJobCounts, getQueue, getRecentFailures, type FeedItem, type FeedTab, type QueueItem } from "@/lib/feed";
import { canWrite, getPreferences, summaryConfigFor } from "@/lib/pipeline";
import { countTopics, isTopic, topicsOf, TOPICS, OTHER_TOPIC, type TopicId } from "@/lib/topics";
import { FetchButton, FetchNotice } from "@/components/FetchButton";

export const maxDuration = 300;

const TAB_IDS: FeedTab[] = ["foryou", "latest", "saved", "queue"];
const QUEUE_SHOWN = 150;

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Header tab="foryou" />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const tab = TAB_IDS.includes(params.tab as FeedTab) ? (params.tab as FeedTab) : "foryou";
  const topic = isTopic(params.topic) ? params.topic : null;
  const reader = await requireUser();
  const prefs = await getPreferences(reader);
  const { readingLevel } = prefs;
  const [counts, failures, hasKey] = await Promise.all([
    getJobCounts(reader.id),
    getRecentFailures(reader.id),
    canWrite(reader, summaryConfigFor(prefs).provider),
  ]);
  const writing = counts.writing ?? 0;
  const summarising = writing > 0;

  // Filtering happens after the fact, on what the tab already holds, so the chips only offer topics it has.
  const all: (FeedItem | QueueItem)[] =
    tab === "queue" ? await getQueue(reader.id, readingLevel) : await getFeed(reader.id, readingLevel, tab);
  const topics = countTopics(all.map((i) => i.paper.categories));
  const shown = topic ? all.filter((i) => topicsOf(i.paper.categories).includes(topic)) : all;

  return (
    <>
      <Header tab={tab} topic={topic} topics={topics} total={all.length} />
      <RememberFeed />
      {!prefs.welcomedAt && <Welcome hasKey={hasKey} />}
      <AutoRefresh active={summarising || tab === "queue"} />
      <BatchCollector active={(counts.batched ?? 0) > 0} />
      {summarising && tab !== "queue" && (
        <Link href="/?tab=queue" className="block border-b border-line bg-accent-soft px-4 py-2 text-[13px] text-accent">
          Writing {writing} thread{writing === 1 ? "" : "s"}…
        </Link>
      )}
      <FetchNotice />
      {failures.count > 0 && tab !== "queue" && (
        <Link href="/?tab=queue" className="block border-b border-line bg-raised px-4 py-2.5 text-[13px] leading-snug">
          <span className="font-semibold text-like">
            {failures.count} write-up{failures.count === 1 ? "" : "s"} failed.
          </span>{" "}
          {failures.latest} <span className="font-medium text-accent">Open Queue to retry</span>
        </Link>
      )}
      {(tab === "foryou" || tab === "latest") && <RandomPaper hasKey={hasKey} />}
      {tab === "queue" ? (
        <Queue items={shown as QueueItem[]} topic={topic} />
      ) : (
        <Feed items={shown as FeedItem[]} tab={tab} topic={topic} hasKey={hasKey} />
      )}
    </>
  );
}

function topicLabel(topic: TopicId) {
  return [...TOPICS, OTHER_TOPIC].find((t) => t.id === topic)?.label ?? topic;
}

function NoneInTopic({ tab, topic }: { tab: FeedTab; topic: TopicId }) {
  return (
    <p className="px-6 py-16 text-center text-[15px] text-muted">
      Nothing in {topicLabel(topic)} here.{" "}
      <Link href={tab === "foryou" ? "/" : `/?tab=${tab}`} className="text-accent">
        Show all topics
      </Link>
    </p>
  );
}

function Feed({
  items,
  tab,
  topic,
  hasKey,
}: {
  items: FeedItem[];
  tab: Exclude<FeedTab, "queue">;
  topic: TopicId | null;
  hasKey: boolean;
}) {
  if (items.length === 0 && topic) return <NoneInTopic tab={tab} topic={topic} />;
  if (items.length === 0) return <EmptyState tab={tab} hasKey={hasKey} />;
  return (
    <main>
      {items.map((item) => (
        <PostCard key={item.paper.id} item={item} />
      ))}
      <p className="px-4 py-10 text-center text-[13px] text-muted">You&apos;re up to date.</p>
    </main>
  );
}

function Queue({ items, topic }: { items: QueueItem[]; topic: TopicId | null }) {
  return (
    <main>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-[13px] text-muted">
          Fetched papers not yet in your feed, best matches first. Summarise any you want to read.
        </p>
        <FetchButton />
      </div>
      {items.length === 0 && topic ? (
        <NoneInTopic tab="queue" topic={topic} />
      ) : items.length === 0 ? (
        <p className="px-4 py-10 text-center text-[14px] text-muted">Nothing queued. Fetch new papers to fill it.</p>
      ) : (
        <QueueList items={items.slice(0, QUEUE_SHOWN)} />
      )}
    </main>
  );
}

function EmptyState({ tab, hasKey }: { tab: FeedTab; hasKey: boolean }) {
  if (tab === "saved") {
    return <p className="px-6 py-16 text-center text-[15px] text-muted">Nothing saved yet. Tap the bookmark on a post to keep it here.</p>;
  }
  if (!hasKey) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-[17px] font-semibold">Add an API key to get started</p>
        <p className="mt-1 text-[14px] text-muted">
          Threads are written with your own Anthropic, OpenAI or OpenRouter key, so your feed stays empty until you add
          one. Connecting OpenRouter takes a couple of taps.
        </p>
        <Link
          href="/settings"
          className="mt-5 inline-block rounded-full bg-fg px-4 py-1.5 text-[13px] font-semibold text-bg transition hover:opacity-85 active:scale-95"
        >
          Add a key in Settings
        </Link>
      </div>
    );
  }
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[17px] font-semibold">Your feed is empty</p>
      <p className="mt-1 text-[14px] text-muted">
        Fetch the latest papers in your topics and the best matches get written up as threads.
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
