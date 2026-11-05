import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { ActionBar } from "@/components/ActionBar";
import { Avatar } from "@/components/Avatar";
import { BackIcon } from "@/components/icons";
import { MarkRead } from "@/components/MarkRead";
import { AutoRefresh } from "@/components/AutoRefresh";
import { WriteOnOpen } from "@/components/WriteOnOpen";
import type { Paper } from "@/lib/db/schema";
import { getPaperView } from "@/lib/feed";
import { levelName } from "@/lib/level-meta";
import { getPreferences } from "@/lib/pipeline";
import { RewriteButton } from "@/components/RewriteButton";
import { CopyButton } from "@/components/CopyButton";
import { formatBibtex, formatCitation } from "@/lib/citation";
import { SECTION_LABELS, creditLine } from "@/lib/format";
import { formatUsd } from "@/lib/pricing";
import { CATEGORY_LABELS, categoryShort } from "@/lib/topics";

export default function ThreadPage({ params }: PageProps<"/p/[id]">) {
  return (
    <Suspense fallback={<TopBar />}>
      <Thread params={params} />
    </Suspense>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-6 border-b border-line bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <Link href="/" className="-m-2 p-2" aria-label="Back to feed">
        <BackIcon className="size-5" />
      </Link>
      <span className="text-[17px] font-bold">Thread</span>
    </header>
  );
}

async function Thread({ params }: Pick<PageProps<"/p/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const item = await getPaperView(decodeURIComponent(id));
  if (!item) notFound();
  const { paper, thread, interaction } = item;
  if (!thread) return <PendingThread paper={paper} />;
  const { readingLevel } = await getPreferences();
  const rewriting = paper.status === "summarising" || paper.status === "new";
  const date = formatDate(paper.publishedAt);

  const posts = [{ section: null, text: thread.hook }, ...thread.posts];

  return (
    <>
      <TopBar />
      <MarkRead paperId={paper.id} />
      <AutoRefresh active={rewriting} ms={5000} />
      <main>
        <article className="px-4 pt-3">
          <div className="flex items-center gap-3">
            <Avatar category={paper.primaryCategory} size={44} />
            <div className="min-w-0 text-[14px] leading-5">
              <div className="truncate font-semibold">{creditLine(paper)}</div>
              <div className="truncate text-muted">
                {fieldLabel(paper)} · {date}
              </div>
            </div>
          </div>
          <h1 className="mt-3 text-[21px] leading-tight font-bold">{thread.headline}</h1>
        </article>

        <ol className="mt-3">
          {posts.map((post, i) => (
            <li key={i} className="relative flex gap-3 px-4">
              {/* Connector line between posts, X-thread style. */}
              <div className="flex w-[10px] shrink-0 flex-col items-center">
                <span className="mt-2 size-2.5 rounded-full bg-accent" />
                {i < posts.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-line" />}
              </div>
              <div className="min-w-0 flex-1 pb-5">
                {post.section && (
                  <div className="text-[11.5px] font-semibold tracking-wider text-muted uppercase">
                    {SECTION_LABELS[post.section] ?? post.section}
                  </div>
                )}
                <p className={`post-text ${i === 0 ? "text-[17px] leading-relaxed" : "mt-0.5"}`}>{post.text}</p>
              </div>
            </li>
          ))}
        </ol>

        {thread.keyNumbers.length > 0 && (
          <section className="mx-4 grid grid-cols-2 gap-2">
            {thread.keyNumbers.map((k) => (
              <div key={k.label} className="rounded-xl bg-raised px-3 py-2.5">
                <div className="text-[17px] font-semibold">{k.value}</div>
                <div className="text-[12.5px] leading-snug text-muted">{k.label}</div>
              </div>
            ))}
          </section>
        )}

        <section className="mx-4 mt-4 rounded-xl border border-line p-3">
          <div className="text-[11.5px] font-semibold tracking-wider text-muted uppercase">TL;DR</div>
          <p className="post-text mt-0.5">{thread.tldr}</p>
        </section>

        <div className="mx-4 mt-3 flex flex-wrap gap-1.5">
          {thread.tags.map((t) => (
            <span key={t} className="rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] text-accent">
              {t}
            </span>
          ))}
          <span className="rounded-full bg-raised px-2.5 py-1 text-[12.5px] text-muted">{thread.level}</span>
          <span className="rounded-full bg-raised px-2.5 py-1 text-[12.5px] text-muted">{thread.paperType}</span>
        </div>

        <div className="mx-4 mt-2 border-b border-line pb-3">
          <ActionBar
            paperId={paper.id}
            liked={!!interaction?.liked}
            saved={!!interaction?.saved}
            hidden={!!interaction?.hidden}
            absUrl={paper.absUrl}
          />
        </div>

        <section className="px-4 py-4">
          <Credits paper={paper} />
          <details className="mt-3 text-[14px]">
            <summary className="cursor-pointer text-accent">Original abstract</summary>
            <p className="mt-2 leading-relaxed text-muted">{paper.abstract}</p>
          </details>
          <PaperLinks paper={paper} />
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">
              Written for {levelName(thread.readingLevel)}
            </span>
            {rewriting ? (
              <span className="animate-pulse text-accent">Rewriting at {levelName(readingLevel)}…</span>
            ) : (
              thread.readingLevel !== readingLevel && <RewriteButton paperId={paper.id} levelName={levelName(readingLevel)} />
            )}
          </div>
          <p className="mt-3 text-[12px] text-muted">
            Written by {thread.model} from the {INPUT_LABELS[thread.inputMode] ?? thread.inputMode}
            {thread.costUsd != null && ` for ${formatUsd(thread.costUsd)}${thread.batched ? " (batched)" : ""}`}. Check
            the paper before citing anything.
          </p>
        </section>
      </main>
    </>
  );
}

const INPUT_LABELS: Record<string, string> = {
  html: "full text",
  "pdf-text": "full text (from PDF)",
  pdf: "full PDF",
  abstract: "abstract only",
};

function fieldLabel(paper: Paper) {
  if (!paper.primaryCategory) return paper.venue ?? "Journal article";
  return CATEGORY_LABELS[paper.primaryCategory] ?? categoryShort(paper.primaryCategory);
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** A paper that hasn't been written up yet: show what we have and write the thread now. */
function PendingThread({ paper }: { paper: Paper }) {
  return (
    <>
      <TopBar />
      <AutoRefresh active ms={5000} />
      {(paper.status === "new" || paper.status === "failed") && <WriteOnOpen paperId={paper.id} />}
      <main className="px-4 pt-3">
        <div className="flex items-center gap-3">
          <Avatar category={paper.primaryCategory} size={44} />
          <div className="min-w-0 text-[14px] leading-5">
            <div className="truncate font-semibold">{creditLine(paper)}</div>
            <div className="truncate text-muted">
              {fieldLabel(paper)} ·{" "}
              {formatDate(paper.publishedAt)}
            </div>
          </div>
        </div>
        <h1 className="mt-3 text-[19px] leading-tight font-bold">{paper.title}</h1>
        <div className="mt-4 rounded-xl bg-accent-soft px-3 py-2.5 text-[14px] text-accent">
          {paper.status === "batched"
            ? "This one is in the half-price overnight batch. It'll appear here as soon as it's ready."
            : paper.status !== "failed"
              ? "Writing the thread. This usually takes under a minute; the page updates itself."
              : `Last attempt failed: ${paper.error ?? "unknown error"}. Retrying.`}
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">{paper.abstract}</p>
        <PaperLinks paper={paper} />
      </main>
    </>
  );
}

/** Who did the work, where, and how to cite it. */
function Credits({ paper }: { paper: Paper }) {
  const many = paper.authors.length > 12;
  const citation = formatCitation(paper);
  return (
    <div className="grid gap-3">
      <div>
        <div className="text-[11.5px] font-semibold tracking-wider text-muted uppercase">Original paper</div>
        <h2 className="mt-0.5 text-[15px] leading-snug font-semibold">{paper.title}</h2>
      </div>
      <div className="text-[13.5px] leading-relaxed">
        {paper.collaboration && <div className="font-medium">{paper.collaboration}</div>}
        {many ? (
          <details>
            <summary className="cursor-pointer text-muted">
              {paper.authors.slice(0, 6).join(", ")} and {paper.authors.length - 6} more
            </summary>
            <p className="mt-1 text-muted">{paper.authors.join(", ")}</p>
          </details>
        ) : (
          <p className="text-muted">{paper.authors.join(", ")}</p>
        )}
      </div>
      {paper.institutions.length > 0 && (
        <div className="text-[13.5px] leading-relaxed">
          <div className="text-[11.5px] font-semibold tracking-wider text-muted uppercase">Institutions</div>
          <p className="mt-0.5">
            {paper.institutions.slice(0, 10).join(" · ")}
            {paper.institutions.length > 10 && <span className="text-muted"> · and {paper.institutions.length - 10} more</span>}
          </p>
        </div>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        {paper.venue && (
          <>
            <dt className="text-muted">Published in</dt>
            <dd>{paper.venue}</dd>
          </>
        )}
        {paper.source === "arxiv" && (
          <>
            <dt className="text-muted">arXiv</dt>
            <dd>
              <a href={paper.absUrl} target="_blank" rel="noreferrer" className="text-accent">
                {paper.externalId}
              </a>
            </dd>
          </>
        )}
        {paper.doi && (
          <>
            <dt className="text-muted">DOI</dt>
            <dd className="truncate">
              <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" className="text-accent">
                {paper.doi}
              </a>
            </dd>
          </>
        )}
        {paper.license && (
          <>
            <dt className="text-muted">Licence</dt>
            <dd>
              {paper.licenseUrl ? (
                <a href={paper.licenseUrl} target="_blank" rel="noreferrer" className="text-accent">
                  {paper.license}
                </a>
              ) : (
                paper.license
              )}
            </dd>
          </>
        )}
      </dl>
      <div className="rounded-xl bg-raised p-3">
        <div className="text-[11.5px] font-semibold tracking-wider text-muted uppercase">Cite as</div>
        <p className="mt-1 text-[13px] leading-relaxed select-all">{citation}</p>
        <div className="mt-2 flex gap-2">
          <CopyButton text={citation} label="Copy citation" />
          <CopyButton text={formatBibtex(paper)} label="Copy BibTeX" />
        </div>
      </div>
    </div>
  );
}

function PaperLinks({ paper }: { paper: Paper }) {
  return (
    <div className="mt-4 flex gap-2 text-[14px]">
      {paper.pdfUrl && (
        <a href={paper.pdfUrl} target="_blank" rel="noreferrer" className="rounded-full bg-fg px-4 py-1.5 font-semibold text-bg">
          Read the PDF
        </a>
      )}
      <a href={paper.absUrl} target="_blank" rel="noreferrer" className="rounded-full border border-line px-4 py-1.5 font-semibold">
        {paper.source === "arxiv" ? "arXiv page" : "Publisher page"}
      </a>
    </div>
  );
}
