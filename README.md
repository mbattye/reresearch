# reresearch

New research papers, read as threads. reresearch pulls fresh papers from arXiv, ranks them against your interests, and has Claude read the full PDF and write each one up as a short X-style thread: the finding, the context, the method, the numbers, the caveats and why it matters. It's built to be scrolled on a phone in spare moments.

Starting focus: particle physics, quantum, and fusion energy, with AI categories one tick away in Settings. Any arXiv category works.

## How it works

```
arXiv API ──► papers table ──► ranker ──► top N ──► Claude (full text) ──► threads table ──► feed
   ▲              (scored on         ▲                                                    │
   │               keywords +        └──── likes / saves / "less like this" ◄─────────────┘
 daily cron        learned tags)            adjust tag affinities
```

- **Sources** (`src/lib/sources/`), each switchable in Settings:
  - **arXiv**: new submissions in your categories.
  - **INSPIRE-HEP trending**: the most-cited particle-physics papers of the last six weeks.
  - **Semantic Scholar**: recommendations from the papers you like and save (and away from the ones you hide).
  - **Add a paper**: any arXiv link or DOI. DOIs are looked up on OpenAlex, which finds the arXiv version if there is one, otherwise the best legal free copy.

  Anything with an arXiv version is stored under its arXiv id so it gets the cheap HTML full text. Discovered papers carry a boost (citations, "similar to your likes") on top of the keyword score, and at most half of each run's write-ups go to them, so new submissions always get a look in.
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
2. Set environment variables (see `.env.example`): `DATABASE_URL`, `CRON_SECRET`, `ADMIN_EMAILS`, `BETTER_AUTH_SECRET`, `KEY_ENCRYPTION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, and optionally `ANTHROPIC_API_KEY` as the admins' fallback key.
3. Deploy. `vercel-build` runs the migrations, and `vercel.json` schedules a daily fetch at 06:00 UTC.
4. On your phone, open the site, request a sign-in link with an admin email, then Share → Add to Home Screen. Invite others from Settings.

## Reading levels

A slider in Settings pitches threads from **Crayons** (explain it like I'm five) through Pub quiz, Science section, **Undergraduate** (the default), Journal club, to **Referee #2** (expert in the field). Each level is a plain markdown guide in `src/skills/levels/`, appended to the shared writing rules in `src/lib/summarise.ts`; edit the guides to change the voice, no code needed. Threads record the level they were written at, and a thread written at a different level offers "Rewrite at {your level}".

## Crediting the research

Every thread page has an "Original paper" block: the full author list (or the collaboration, for big teams), institutions, journal, arXiv id, DOI, licence, and a copyable APA-style citation and BibTeX entry. Cards show the lead institution. Institutions come from INSPIRE-HEP where it indexes the paper, otherwise from the affiliations in arXiv's HTML, or OpenAlex for journal papers, looked up only when a paper is written up.

## Accounts

- **Sign-in** is by emailed link (Better Auth's magic-link plugin, emails via Resend). There are no passwords.
- **Invite only, with a waitlist.** Admins (`ADMIN_EMAILS`) invite people from Settings, which creates their account and emails a link. Anyone else can request access from the login page: requests appear in Settings to approve or decline, and the daily run emails admins a digest of new ones. Nothing is sent to the person until they're approved. Sign-up is otherwise switched off, sign-in and requests are rate limited, and both forms give the same reply whether or not an email has access.
- **Readers bring their own key** for Anthropic, OpenAI or OpenRouter (Claude, GPT, Gemini, Grok and others). New readers get a welcome on the feed that walks them through adding one. Keys are checked with a free request, encrypted with AES-256-GCM bound to the reader's id, decrypted only to make a call, and never sent back to the browser (Settings shows `…a1b2`). Admins can fall back to the deployment's `ANTHROPIC_API_KEY`.
- **What's shared and what isn't.** Papers and threads are shared: a thread is written once per paper and reading level, by whoever's key gets there first, and is free for everyone else at that level. Interests, likes, saves, learned ranking, the queue, budget and spend are per reader.
- **Before accounts**, everything belonged to one reader; the first admin to sign in inherits it.

## Security

- **Sessions**: Better Auth database sessions, 90 days, httpOnly cookies. Every page and action checks the session server-side; the proxy only redirects early.
- **Fails closed**: production without `BETTER_AUTH_SECRET`, `KEY_ENCRYPTION_SECRET` or `ADMIN_EMAILS` answers every request with 503. The cron endpoint needs `CRON_SECRET`.
- **Spend cap**: each reader's summaries stop for the month at their budget (default $10).
- **Outbound fetches**: PDF and full-text links from third-party metadata only go to public http(s) hosts on standard ports, with every redirect re-checked.
- **Headers**: content security policy, no framing, nosniff, strict referrer policy and HSTS in production.
- **Model output** is rendered as plain text, so a paper can't inject markup into the app. It can still mislead a summary, which is why every thread links to the paper.

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

- Zotero connector (Web API: user id + API key) so your existing library feeds the queue, plus BibTeX/RIS upload
- "Connect OpenRouter" sign-in (OAuth) instead of pasting a key
- OSTI.gov (fusion reports), bioRxiv/medRxiv and Europe PMC
- Semantic ranking with embeddings, beyond keyword matching
- Figures from the paper inline in threads
