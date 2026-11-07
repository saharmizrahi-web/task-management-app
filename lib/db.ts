import { Pool, types } from "pg";

// DATE -> plain "YYYY-MM-DD" string, bigint -> number
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => Number(v));

const g = globalThis as unknown as { __pool?: Pool; __schemaReady?: Promise<void> };

export function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(url);
    g.__pool = new Pool({
      connectionString: url,
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 20000,
    });
  }
  return g.__pool;
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ms_spaces (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f46e5',
  view TEXT NOT NULL DEFAULT 'kanban' CHECK (view IN ('kanban','todo','calendar')),
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ms_tasks (
  id SERIAL PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES ms_spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','paused','done')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ms_tasks_space_idx ON ms_tasks(space_id);
CREATE TABLE IF NOT EXISTS ms_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
`;

/** Creates tables once per server instance (idempotent). */
export function ensureSchema(): Promise<void> {
  if (!g.__schemaReady) {
    g.__schemaReady = pool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        g.__schemaReady = undefined;
        throw e;
      });
  }
  return g.__schemaReady;
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query(text, params as any[]);
  return res.rows as T[];
}
