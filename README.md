# reresearch

New research papers, read as threads. reresearch pulls fresh papers from arXiv, ranks them against your interests, and has Claude read the full PDF and write each one up as a short X-style thread: the finding, the context, the method, the numbers, the caveats and why it matters. It's built to be scrolled on a phone in spare moments.

Starting focus: particle physics, quantum, and fusion energy. Any arXiv category works.

## How it works

```
arXiv API ──► papers table ──► ranker ──► top N ──► Claude (full text) ──► threads table ──► feed
   ▲              (scored on         ▲                                                    │
   │               keywords +        └──── likes / saves / "less like this" ◄─────────────┘
 daily cron        learned tags)            adjust tag affinities
```

- **Sources** (`src/lib/sources/`): arXiv for now. Recent submissions in your categories are fetched on each run, and you can add any paper by arXiv link.
- **Ranking** (`src/lib/ranking.ts`): your keyword weights plus learned tag affinities matched against title (double weight) and abstract, then a four-day recency half-life at feed time. Every score keeps its reasons, which the Queue tab shows.
- **Full text** (`src/lib/fulltext.ts`): arXiv's HTML version (sections, captions and maths as LaTeX, references dropped, appendices cut first when long), falling back to text extracted from the PDF, then to the abstract.
- **Summaries** (`src/lib/summarise.ts`): Claude (Sonnet 5.5 by default, switchable in Settings) returns a structured thread: headline, hook, sectioned posts, TL;DR, key numbers, tags. The editorial voice lives in `SYSTEM_PROMPT` and is the main place to tune the writing.
- **When threads get written**: the daily run writes your top few through the half-price Message Batches API. Anything else is written when you open it, from the Queue or a link.
- **Feed**: For you (ranked), Latest, Saved, and Queue (fetched papers not yet written up).

## Run locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 and press **Fetch new**. With `DATABASE_URL` unset it uses an embedded Postgres (PGlite) in `.data/`, so there's nothing else to install. PGlite is single-process, so stop the dev server before running scripts that open the database.

## Deploy (Vercel + Neon)

1. Create a Postgres database (Neon free tier is fine) and import this repo into Vercel.
2. Set environment variables: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `APP_PASSWORD` (gates the whole app), `CRON_SECRET` (any random string).
3. Deploy. `vercel-build` runs the migrations, and `vercel.json` schedules a daily fetch at 06:00 UTC.
4. On your phone, open the site, sign in, then Share → Add to Home Screen.

## Costs

Measured on five recent physics papers (about 23k tokens of text each):

| Setup | Per paper | Batched (daily run) |
| --- | --- | --- |
| Claude Haiku 5.5, text | $0.004 | $0.002 |
| **Claude Sonnet 5.5, text (default)** | **$0.064** | **$0.032** |
| Claude Opus 5.5, text | $0.138 | $0.069 |
| Claude Opus 5.5, full PDF (the original setup) | $0.313 | $0.156 |

Settings shows spend this month, and each thread shows what it cost. The model and the full-PDF option are in Settings; `SUMMARY_MODEL`, `SUMMARY_EFFORT`, `SUMMARY_INPUT` and `SUMMARY_BATCH` set the defaults.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` / `npm run lint` | Checks |
| `npm run db:generate` | New migration after editing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (PGlite migrates itself on startup) |

## Roadmap

- Zotero connector (Web API: user id + API key) so your existing library feeds the queue
- Semantic ranking with embeddings, beyond keyword matching
- Figures from the paper inline in threads
- More sources: bioRxiv/medRxiv, Semantic Scholar, OpenAlex
