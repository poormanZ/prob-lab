import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// Minimal D1 stand-in over node:sqlite so tests run the real migrations and SQL.
export const createTestDb = (): D1Database => {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));
  const statement = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values as SQLInputValue[]),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params), success: true, meta: {} }),
    run: async () => ({ results: [], success: true, meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
};
