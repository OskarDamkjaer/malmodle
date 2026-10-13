CREATE TABLE IF NOT EXISTS results (
  day TEXT NOT NULL,
  player TEXT NOT NULL,
  set_id TEXT NOT NULL,
  total INTEGER NOT NULL,
  scores TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (day, player)
);

CREATE INDEX IF NOT EXISTS results_by_set ON results (day, set_id);
