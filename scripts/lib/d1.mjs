import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'worker/migrations';

export function localD1(path = ':memory:') {
  const db = new DatabaseSync(path);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { prepare: (sql) => statement(sql) };
}
