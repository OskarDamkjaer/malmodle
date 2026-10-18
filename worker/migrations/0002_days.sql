CREATE TABLE IF NOT EXISTS days (
  day TEXT NOT NULL,
  set_id TEXT NOT NULL,
  players INTEGER NOT NULL DEFAULT 0,
  totals TEXT NOT NULL DEFAULT '{}',
  questions TEXT NOT NULL DEFAULT '[]',
  written INTEGER NOT NULL DEFAULT 0,
  written_players INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, set_id)
);

DROP INDEX IF EXISTS results_by_set;
CREATE INDEX IF NOT EXISTS results_by_time ON results (day, set_id, at);

CREATE TRIGGER IF NOT EXISTS results_count AFTER INSERT ON results
BEGIN
  INSERT OR IGNORE INTO days (day, set_id) VALUES (NEW.day, NEW.set_id);
  UPDATE days SET
    players = players + 1,
    totals = json_set(totals, '$."' || NEW.total || '"', coalesce(json_extract(totals, '$."' || NEW.total || '"'), 0) + 1),
    questions = (
      SELECT json_group_array(json(counted)) FROM (
        SELECT json_set(coalesce(q.value, '{}'), '$."' || s.value || '"', coalesce(json_extract(q.value, '$."' || s.value || '"'), 0) + 1) AS counted
        FROM json_each(NEW.scores) AS s
        LEFT JOIN json_each(days.questions) AS q ON q.key = s.key
        ORDER BY s.key
      )
    )
  WHERE day = NEW.day AND set_id = NEW.set_id;
END;
