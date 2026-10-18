import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'worker/migrations';

export function localD1(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)');
  const applied = new Set(db.prepare('SELECT name FROM d1_migrations').all().map((r) => r.name));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    db.exec('BEGIN');
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(file);
    db.exec('COMMIT');
  }
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { prepare: (sql) => statement(sql) };
}
