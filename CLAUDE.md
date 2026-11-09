@AGENTS.md

# reresearch

X-style feed of research papers summarised into threads by each reader's own AI key (Anthropic, OpenAI or OpenRouter). See README.md for the architecture.

- Next.js 16 App Router with Cache Components: pages that read the DB call `await connection()` inside a `<Suspense>` boundary. Check `node_modules/next/dist/docs/` before using Next APIs, since many changed in v16 (e.g. `proxy.ts` replaces middleware).
- Database: Drizzle over Postgres. `DATABASE_URL` set means postgres-js; unset means embedded PGlite in `.data/` (single process, auto-migrates). After changing `src/lib/db/schema.ts`, run `npm run db:generate` and commit the migration.
- Thread writing = `BASE_PROMPT` in `src/lib/summarise.ts` (structure and accuracy rules for every level) + one reading-level guide from `src/skills/levels/` (audience, vocabulary, maths, comparisons, length). Facts first, no hype, British English. Change a level's voice in its markdown file, not in code.
- Run `npm run typecheck && npm run lint && npm run build` before committing.
- Accounts: Better Auth (`src/lib/auth.ts`, built lazily because the DB is). Pages and actions call `requireUser()`; per-reader data lives in `user_settings`, `user_papers`, `user_terms`, `user_keys`. Threads are shared per (paper, reading level); `thread_jobs` holds writing/batched/failed state, and a failure only blocks the reader it failed for.
- Sign-in links are sent only by server actions, which rate limit (`src/lib/access.ts`); the HTTP route is disabled in `src/lib/auth.ts` because it would email any address. Rate limits live in the database because serverless instances share no memory.
- Reader categories are arXiv codes, or `biorxiv:<subject>` and `openalex:<subfield id>` for the other sources (`src/lib/topics.ts`). Each run's picks take turns across the reader's topics (`diversify` in `src/lib/ranking.ts`).
- The daily cron only hands out work (`src/lib/daily.ts`): each reader gets their own function, staggered for arXiv, and `last_daily_run_at` stops anyone being done twice.
- A written thread is never replaced: there's one per (paper, reading level), so returning to a level is free.
- In raw `sql` templates, a column interpolated into a correlated subquery of a single-table query renders unqualified; write `"table"."column"` explicitly there.

