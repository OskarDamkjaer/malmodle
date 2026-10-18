CREATE TABLE results_rebuilt (
  day TEXT NOT NULL,
  player TEXT NOT NULL,
  set_id TEXT NOT NULL,
  total INTEGER NOT NULL,
  scores TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (day, player)
) WITHOUT ROWID;

INSERT INTO results_rebuilt (day, player, set_id, total, scores, at)
  SELECT day, player, set_id, total, scores, at FROM results;

DROP TABLE results;
ALTER TABLE results_rebuilt RENAME TO results;

ALTER TABLE days ADD COLUMN finished TEXT NOT NULL DEFAULT '[]';

UPDATE days SET finished = (
  SELECT json_group_array(at ORDER BY at) FROM results
  WHERE results.day = days.day AND results.set_id = days.set_id
) WHERE players < 10;

CREATE TRIGGER results_count AFTER INSERT ON results
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
    ),
    finished = CASE WHEN players < 10 THEN json_insert(finished, '$[#]', NEW.at) ELSE finished END
  WHERE day = NEW.day AND set_id = NEW.set_id;
END;
