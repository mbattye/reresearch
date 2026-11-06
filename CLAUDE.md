@AGENTS.md

# reresearch

Personal X-style feed of research papers summarised into threads by Claude. See README.md for the architecture.

- Next.js 16 App Router with Cache Components: pages that read the DB call `await connection()` inside a `<Suspense>` boundary. Check `node_modules/next/dist/docs/` before using Next APIs, since many changed in v16 (e.g. `proxy.ts` replaces middleware).
- Database: Drizzle over Postgres. `DATABASE_URL` set means postgres-js; unset means embedded PGlite in `.data/` (single process, auto-migrates). After changing `src/lib/db/schema.ts`, run `npm run db:generate` and commit the migration.
- Thread writing = `BASE_PROMPT` in `src/lib/summarise.ts` (structure and accuracy rules for every level) + one reading-level guide from `src/skills/levels/` (audience, vocabulary, maths, comparisons, length). Facts first, no hype, British English. Change a level's voice in its markdown file, not in code.
- Run `npm run typecheck && npm run lint && npm run build` before committing.
- Accounts: Better Auth (`src/lib/auth.ts`, built lazily because the DB is). Pages and actions call `requireUser()`; per-reader data lives in `user_settings`, `user_papers`, `user_terms`, `user_keys`. Threads are shared per (paper, reading level); `thread_jobs` holds writing/batched/failed state, and a failure only blocks the reader it failed for.
- In raw `sql` templates, a column interpolated into a correlated subquery of a single-table query renders unqualified; write `"table"."column"` explicitly there.

