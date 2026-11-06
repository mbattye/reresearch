import "server-only";
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

export interface ReaderSummary {
  id: string;
  email: string;
  createdAt: Date;
  lastSeen: Date | null;
  hasKey: boolean;
  monthSpend: number;
}

/** Everyone with an account, newest first, for the admin section of Settings. */
export async function listReaders(): Promise<ReaderSummary[]> {
  const db = await getDb();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const since = monthStart.toISOString();
  // Columns are written as "user"."id" explicitly: interpolated into raw sql, Drizzle emits a bare
  // "id", which inside these subqueries would bind to the inner table's own id.
  const { user } = schema;
  return db
    .select({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      lastSeen: sql<Date | null>`(select max(s.updated_at) from session s where s.user_id = "user"."id")`.mapWith(
        (v: string | null) => (v ? new Date(v) : null),
      ),
      hasKey: sql<boolean>`exists (select 1 from user_keys k where k.user_id = "user"."id")`,
      monthSpend: sql<number>`(select coalesce(sum(t.cost_usd), 0)::float from threads t where t.written_by = "user"."id" and t.created_at >= ${since}::timestamptz)`,
    })
    .from(user)
    .orderBy(desc(user.createdAt));
}
