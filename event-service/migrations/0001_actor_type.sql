ALTER TABLE events ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'unknown'
  CHECK (actor_type IN ('self', 'other', 'unknown'));

CREATE VIEW labeled_events AS
SELECT events.*,
  CASE actor_type WHEN 'self' THEN '自己' WHEN 'other' THEN '别人' ELSE '未识别' END AS actor_label
FROM events;

CREATE VIEW labeled_actors AS
SELECT ip, actor_type,
  CASE actor_type WHEN 'self' THEN '自己' WHEN 'other' THEN '别人' ELSE '未识别' END AS actor_label,
  COUNT(*) AS event_count, MIN(received_at) AS first_event_at, MAX(received_at) AS last_event_at
FROM events
GROUP BY ip, actor_type;
