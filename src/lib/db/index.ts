import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __reresearchDb?: Promise<DB> };

/**
 * DATABASE_URL set -> any Postgres (Neon, Supabase, local).
 * Unset -> embedded PGlite stored in .data/, migrated on first use, so local dev needs no setup.
 */
export function getDb(): Promise<DB> {
  globalForDb.__reresearchDb ??= createDb().catch((err) => {
    // Don't cache a failed connection; the next request retries.
    globalForDb.__reresearchDb = undefined;
    throw err;
  });
  return globalForDb.__reresearchDb;
}

async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { prepare: false, max: 5 });
    return drizzle({ client, schema }) as unknown as DB;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { mkdir } = await import("node:fs/promises");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  await mkdir(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as DB;
}

export { schema };
