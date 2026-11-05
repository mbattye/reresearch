@AGENTS.md

# reresearch

Personal X-style feed of research papers summarised into threads by Claude. See README.md for the architecture.

- Next.js 16 App Router with Cache Components: pages that read the DB call `await connection()` inside a `<Suspense>` boundary. Check `node_modules/next/dist/docs/` before using Next APIs, since many changed in v16 (e.g. `proxy.ts` replaces middleware).
- Database: Drizzle over Postgres. `DATABASE_URL` set means postgres-js; unset means embedded PGlite in `.data/` (single process, auto-migrates). After changing `src/lib/db/schema.ts`, run `npm run db:generate` and commit the migration.
- The thread-writing voice is `SYSTEM_PROMPT` in `src/lib/summarise.ts`. Facts first, no hype, no forced analogies, British English.
- Run `npm run typecheck && npm run lint && npm run build` before committing.
