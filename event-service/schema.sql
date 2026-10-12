CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  latitude TEXT,
  longitude TEXT,
  timezone TEXT,
  received_at TEXT NOT NULL,
  path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS events_ip_time ON events (ip, received_at);
CREATE INDEX IF NOT EXISTS events_time ON events (received_at);

CREATE VIEW IF NOT EXISTS actors AS
SELECT ip, COUNT(*) AS event_count, MIN(received_at) AS first_event_at, MAX(received_at) AS last_event_at
FROM events
GROUP BY ip;
