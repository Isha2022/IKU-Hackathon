-- Demo heatmap: every 30 minutes from 09:00 to 22:00 London time, 19–25 Oct.
-- Counts users as 'free' when they have NO stored busy block: this is inferred availability.
WITH selected AS (
  SELECT user_id FROM group_members
  WHERE group_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
), slots AS (
  SELECT t AS start_time, t + interval '30 minutes' AS end_time
  FROM generate_series(
    '2026-10-19 09:00 Europe/London'::timestamptz,
    '2026-10-25 21:30 Europe/London'::timestamptz,
    interval '30 minutes'
  ) AS t
  WHERE (t AT TIME ZONE 'Europe/London')::time >= time '09:00'
    AND (t AT TIME ZONE 'Europe/London')::time < time '22:00'
), availability AS (
  SELECT s.start_time, s.end_time, u.user_id,
    NOT EXISTS (
      SELECT 1 FROM busy_blocks b
      WHERE b.user_id = u.user_id
        AND b.during && tstzrange(s.start_time, s.end_time, '[)')
    ) AS is_free
  FROM slots s CROSS JOIN selected u
)
SELECT start_time, end_time,
  array_agg(user_id ORDER BY user_id) FILTER (WHERE is_free) AS available_user_ids,
  count(*) FILTER (WHERE is_free)::int AS available_count,
  count(*)::int AS total_selected
FROM availability
GROUP BY start_time, end_time
ORDER BY start_time;
