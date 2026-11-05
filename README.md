# reresearch

New research papers, read as threads. reresearch pulls fresh papers from arXiv, ranks them against your interests, and has Claude read the full PDF and write each one up as a short X-style thread: the finding, the context, the method, the numbers, the caveats and why it matters. It's built to be scrolled on a phone in spare moments.

Starting focus: particle physics, quantum, and fusion energy. Any arXiv category works.

## How it works

```
arXiv API ──► papers table ──► ranker ──► top N ──► Claude (full PDF) ──► threads table ──► feed
   ▲              (scored on         ▲                                                    │
   │               keywords +        └──── likes / saves / "less like this" ◄─────────────┘
 daily cron        learned tags)            adjust tag affinities
```

- **Sources** (`src/lib/sources/`): arXiv for now. Recent submissions in your categories are fetched on each run, and you can add any paper by arXiv link.
- **Ranking** (`src/lib/ranking.ts`): your keyword weights plus learned tag affinities matched against title (double weight) and abstract, then a four-day recency half-life at feed time. Every score keeps its reasons, which the Queue tab shows.
- **Summaries** (`src/lib/summarise.ts`): the PDF goes to Claude (`claude-opus-5-5`, medium effort), which returns a structured thread (headline, hook, sectioned posts, TL;DR, key numbers, tags). The editorial voice lives in `SYSTEM_PROMPT` and is the main place to tune the writing. If the PDF can't be fetched it falls back to the abstract and says so.
- **Feed**: For you (ranked), Latest, Saved, and Queue (papers fetched but not yet summarised, where you can summarise any on demand).

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

Each summary reads the full PDF with Claude Opus 5.5 ($4 per million input tokens, $20 per million output). A typical 15 to 30 page paper costs roughly $0.10 to $0.30. The default is 4 papers per run, set in Settings. `SUMMARY_MODEL` and `SUMMARY_EFFORT` override the model and effort.

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
