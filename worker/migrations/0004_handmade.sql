CREATE TABLE IF NOT EXISTS handmade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  player TEXT NOT NULL,
  name TEXT NOT NULL,
  remark TEXT NOT NULL,
  slots TEXT NOT NULL,
  notes TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS handmade_by_player ON handmade (player, at);
CREATE INDEX IF NOT EXISTS handmade_by_at ON handmade (at);
