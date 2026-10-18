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
  const execute = (sql, args) => {
    const prepared = db.prepare(sql);
    if (prepared.columns().length) return { results: prepared.all(...args), success: true, meta: { changes: 0 } };
    const { changes, lastInsertRowid } = prepared.run(...args);
    return { results: [], success: true, meta: { changes, last_row_id: Number(lastInsertRowid) } };
  };
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...values) => statement(sql, values),
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return execute(sql, args); },
    async run() { return execute(sql, args); },
  });
  async function batch(statements) {
    db.exec('BEGIN');
    try {
      const results = statements.map((s) => execute(s.sql, s.args));
      db.exec('COMMIT');
      return results;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return { prepare: (sql) => statement(sql), batch };
}
