ALTER TABLE visits ADD COLUMN visitor_type TEXT NOT NULL DEFAULT 'unknown'
  CHECK (visitor_type IN ('self', 'other', 'unknown'));

CREATE VIEW labeled_visits AS
SELECT visits.*,
  CASE visitor_type WHEN 'self' THEN '自己' WHEN 'other' THEN '别人' ELSE '未识别' END AS visitor_label
FROM visits;

CREATE VIEW labeled_visitors AS
SELECT ip, visitor_type,
  CASE visitor_type WHEN 'self' THEN '自己' WHEN 'other' THEN '别人' ELSE '未识别' END AS visitor_label,
  COUNT(*) AS visit_count, MIN(visited_at) AS first_visit_at, MAX(visited_at) AS last_visit_at
FROM visits
GROUP BY ip, visitor_type;
