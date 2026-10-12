CREATE TABLE IF NOT EXISTS visits (
  event_id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  latitude TEXT,
  longitude TEXT,
  timezone TEXT,
  visited_at TEXT NOT NULL,
  path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS visits_ip_time ON visits (ip, visited_at);
CREATE INDEX IF NOT EXISTS visits_time ON visits (visited_at);

CREATE VIEW IF NOT EXISTS visitors AS
SELECT ip, COUNT(*) AS visit_count, MIN(visited_at) AS first_visit_at, MAX(visited_at) AS last_visit_at
FROM visits
GROUP BY ip;
