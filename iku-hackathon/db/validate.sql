-- Where's Everyone? SQL validation (schema.sql / seed.sql / queries.ts).
-- Paste into the Timescale Cloud SQL Editor on the SAME service/database where
-- schema.sql and seed.sql were applied. Run the whole file or individual sections.
-- Entire script is read-only: CTE fixtures are values, not inserted rows.
-- No Node.js connection or credentials required. No deletes or data resets.
-- Expected schemas: application tables in public (as created with default search_path).
-- If you intentionally installed elsewhere, adjust public references/search_path.
-- PASS/FAIL checks identify problems; WARN seed comparisons can reflect legitimate
-- application changes. Catalog constraints are inspected, not destructively probed.
-- If an error aborts the transaction, execute ROLLBACK before retrying.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL TIME ZONE 'UTC';

-- 1. Environment and expected tables: ten PASS rows; extension should be installed.
SELECT current_database() AS database_name, current_setting('TimeZone') AS display_timezone,
  (SELECT extversion FROM pg_extension WHERE extname = 'timescaledb') AS timescaledb_version;
WITH expected(name) AS (VALUES ('users'),('groups'),('group_members'),('busy_blocks'),
  ('preferences'),('proposals'),('beliefs'),('rsvp_events'),('belief_revisions'),('proposal_constraints'))
SELECT name, CASE WHEN to_regclass('public.' || name) IS NOT NULL THEN 'PASS' ELSE 'FAIL: missing table' END AS result
FROM expected ORDER BY name;
-- If a table is missing, stop here, ROLLBACK, and resolve schema application first.

-- 2. Seed identities: four PASS users, one PASS group, four PASS memberships.
-- These fixed IDs are copied from db/seed.sql, not assumed UUIDs.
WITH expected(id,name) AS (VALUES
('11111111-1111-4111-8111-111111111111'::uuid,'You'),
('22222222-2222-4222-8222-222222222222'::uuid,'Sam'),
('33333333-3333-4333-8333-333333333333'::uuid,'Priya'),
('44444444-4444-4444-8444-444444444444'::uuid,'Jo'))
SELECT e.id, e.name AS expected_name, u.name AS actual_name,
 CASE WHEN u.id IS NULL THEN 'FAIL: missing user'
 WHEN u.name = e.name AND u.timezone = 'Europe/London' THEN 'PASS'
 ELSE 'WARN: seed profile changed' END AS result
FROM expected e LEFT JOIN users u ON u.id=e.id ORDER BY e.id;
SELECT 'seed group' AS test, CASE WHEN EXISTS (
 SELECT 1 FROM groups WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid AND name='Uni friends'
) THEN 'PASS' ELSE 'FAIL: seed group missing or renamed' END AS result;
WITH expected(user_id) AS (VALUES
('11111111-1111-4111-8111-111111111111'::uuid),('22222222-2222-4222-8222-222222222222'::uuid),
('33333333-3333-4333-8333-333333333333'::uuid),('44444444-4444-4444-8444-444444444444'::uuid))
SELECT e.user_id, CASE WHEN m.user_id IS NOT NULL THEN 'PASS' ELSE 'FAIL: missing membership' END AS result
FROM expected e LEFT JOIN group_members m ON m.user_id=e.user_id
 AND m.group_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid ORDER BY e.user_id;

-- 3. Eight seed busy blocks: exact ID/user/range/source match expected.
WITH expected(id,user_id,during,source) AS (VALUES
('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',tstzrange('2026-10-19 10:00 Europe/London'::timestamptz,'2026-10-19 13:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',tstzrange('2026-10-21 15:00 Europe/London'::timestamptz,'2026-10-21 18:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222',tstzrange('2026-10-20 16:00 Europe/London'::timestamptz,'2026-10-20 19:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222',tstzrange('2026-10-23 17:00 Europe/London'::timestamptz,'2026-10-23 23:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000005','33333333-3333-4333-8333-333333333333',tstzrange('2026-10-19 16:00 Europe/London'::timestamptz,'2026-10-19 20:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000006','33333333-3333-4333-8333-333333333333',tstzrange('2026-10-22 17:00 Europe/London'::timestamptz,'2026-10-22 21:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000007','44444444-4444-4444-8444-444444444444',tstzrange('2026-10-20 09:00 Europe/London'::timestamptz,'2026-10-20 12:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000008','44444444-4444-4444-8444-444444444444',tstzrange('2026-10-24 18:00 Europe/London'::timestamptz,'2026-10-24 21:00 Europe/London'::timestamptz,'[)'),'manual')
)
SELECT e.id::uuid AS block_id,
 CASE WHEN b.id IS NULL THEN 'FAIL: missing seed block'
 WHEN b.user_id=e.user_id::uuid AND b.during=e.during AND b.source=e.source THEN 'PASS'
 ELSE 'WARN: seed block changed' END AS result
FROM expected e LEFT JOIN busy_blocks b ON b.id=e.id::uuid ORDER BY e.id;

-- 4. Compare every live heatmap slot to an isolated seed-only baseline.
-- Mirrors availability.sql: group members, 30-minute grid, local hours, NOT EXISTS.
-- Extra members/blocks or edited seed records produce WARN, not proof of a query bug.
-- Expected daily counts with untouched seed: 26 slots/day; free4/free3 are
-- Mon 12/14, Tue 14/12, Wed 20/6, Thu 18/8, Fri 16/10, Sat 20/6, Sun 26/0.
-- Whole week: 182 slots; 126 free4, 56 free3; 672 no-conflict person-slots.
WITH expected(id,user_id,during,source) AS (VALUES
('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',tstzrange('2026-10-19 10:00 Europe/London'::timestamptz,'2026-10-19 13:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',tstzrange('2026-10-21 15:00 Europe/London'::timestamptz,'2026-10-21 18:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222',tstzrange('2026-10-20 16:00 Europe/London'::timestamptz,'2026-10-20 19:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222',tstzrange('2026-10-23 17:00 Europe/London'::timestamptz,'2026-10-23 23:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000005','33333333-3333-4333-8333-333333333333',tstzrange('2026-10-19 16:00 Europe/London'::timestamptz,'2026-10-19 20:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000006','33333333-3333-4333-8333-333333333333',tstzrange('2026-10-22 17:00 Europe/London'::timestamptz,'2026-10-22 21:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000007','44444444-4444-4444-8444-444444444444',tstzrange('2026-10-20 09:00 Europe/London'::timestamptz,'2026-10-20 12:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000008','44444444-4444-4444-8444-444444444444',tstzrange('2026-10-24 18:00 Europe/London'::timestamptz,'2026-10-24 21:00 Europe/London'::timestamptz,'[)'),'manual')
), selected AS (
 SELECT user_id FROM group_members WHERE group_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
), seed_users AS (SELECT DISTINCT user_id::uuid AS user_id FROM expected), slots AS (
 SELECT t AS start_time, t+interval '30 minutes' AS end_time
 FROM generate_series('2026-10-19 09:00 Europe/London'::timestamptz,
 '2026-10-25 21:30 Europe/London'::timestamptz, interval '30 minutes') AS t
 WHERE (t AT TIME ZONE 'Europe/London')::time >= time '09:00'
 AND (t AT TIME ZONE 'Europe/London')::time < time '22:00'
), counts AS (
 SELECT s.*,
 (SELECT count(*) FROM selected u WHERE NOT EXISTS (
   SELECT 1 FROM busy_blocks b WHERE b.user_id=u.user_id
   AND b.during && tstzrange(s.start_time,s.end_time,'[)'))) AS actual_free,
 (SELECT count(*) FROM seed_users u WHERE NOT EXISTS (
   SELECT 1 FROM expected b WHERE b.user_id::uuid=u.user_id
   AND b.during && tstzrange(s.start_time,s.end_time,'[)'))) AS seed_free,
 (SELECT count(*) FROM selected) AS actual_selected
 FROM slots s
), daily AS (
 SELECT (start_time AT TIME ZONE 'Europe/London')::date AS local_day,
 count(*) AS slots, count(*) FILTER (WHERE actual_free=4) AS actual_free4,
 count(*) FILTER (WHERE actual_free=3) AS actual_free3,
 count(*) FILTER (WHERE seed_free=4) AS seed_free4,
 count(*) FILTER (WHERE seed_free=3) AS seed_free3,
 count(*) FILTER (WHERE actual_free<>seed_free OR actual_selected<>4) AS mismatched_slots,
 sum(actual_free) AS no_conflict_person_slots
 FROM counts GROUP BY 1
)
SELECT *, CASE WHEN slots<>26 THEN 'FAIL: slot grid'
 WHEN mismatched_slots=0 THEN 'PASS' ELSE 'WARN: live data differs from seed baseline' END AS result
FROM daily ORDER BY local_day;

-- 5. Half-open boundaries and overnight ranges: every case PASS.
-- SQL ranges are built in UTC to make elapsed-time behaviour unambiguous.
WITH cases(label,a,b,expected_overlap) AS (VALUES
 ('adjacent end/start', tstzrange('2026-10-19 10:00Z','2026-10-19 11:00Z','[)'),
   tstzrange('2026-10-19 11:00Z','2026-10-19 12:00Z','[)'), false),
 ('actual overlap', tstzrange('2026-10-19 10:00Z','2026-10-19 11:00Z','[)'),
   tstzrange('2026-10-19 10:30Z','2026-10-19 12:00Z','[)'), true),
 ('overnight after midnight', tstzrange('2026-10-19 23:00Z','2026-10-20 02:00Z','[)'),
   tstzrange('2026-10-20 00:00Z','2026-10-20 00:30Z','[)'), true),
 ('overnight end adjacent', tstzrange('2026-10-19 23:00Z','2026-10-20 02:00Z','[)'),
   tstzrange('2026-10-20 02:00Z','2026-10-20 02:30Z','[)'), false))
SELECT label, a && b AS actual_overlap, expected_overlap,
 CASE WHEN (a && b)=expected_overlap THEN 'PASS' ELSE 'FAIL' END AS result FROM cases;

-- 6. Duplicate-count defence, no-busy semantics and candidate full-duration slots.
-- User 1 has two overlapping blocks, user 2 has none. NOT EXISTS counts users,
-- not blocks: total_selected=2, available_count=1. No RSVP is manufactured.
WITH selected(user_id) AS (SELECT DISTINCT unnest(ARRAY[1,1,2])),
blocks(user_id,during) AS (VALUES
 (1,tstzrange('2026-10-19 10:00Z','2026-10-19 12:00Z','[)')),
 (1,tstzrange('2026-10-19 10:30Z','2026-10-19 11:30Z','[)'))),
availability AS (
 SELECT u.user_id, NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id=u.user_id
 AND b.during && tstzrange('2026-10-19 11:00Z','2026-10-19 11:30Z','[)')) AS no_recorded_conflict
 FROM selected u)
SELECT count(*) AS total_selected, count(*) FILTER (WHERE no_recorded_conflict) AS available_count,
 'not established by absence of busy blocks' AS explicitly_confirmed_availability,
 CASE WHEN count(*)=2 AND count(*) FILTER (WHERE no_recorded_conflict)=1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM availability;
-- Same generate_series/NOT EXISTS shape as getFreeSlots. A two-hour overnight
-- block excludes all starts before 01:00; only 01:00-03:00 fits the window.
WITH candidates AS (
 SELECT t AS start_time,t+interval '120 minutes' AS end_time
 FROM generate_series('2026-10-19 23:00Z'::timestamptz,
 '2026-10-20 03:00Z'::timestamptz-interval '120 minutes',interval '30 minutes') t
), free AS (
 SELECT * FROM candidates c WHERE NOT EXISTS (
 SELECT 1 FROM (VALUES (tstzrange('2026-10-19 23:00Z','2026-10-20 01:00Z','[)'))) b(during)
 WHERE b.during && tstzrange(c.start_time,c.end_time,'[)')))
SELECT count(*) AS candidate_count,
 CASE WHEN count(*)=1 AND min(start_time)='2026-10-20 01:00Z'::timestamptz THEN 'PASS' ELSE 'FAIL' END AS result FROM free;

-- 7. Foreign keys, CHECK constraints and validation status. No invalid rows inserted.
-- PASS means expected counts and all constraints validated; definitions below
-- let you verify the actual rules (counts alone cannot prove equivalent semantics).
WITH expected(name,fks,checks) AS (VALUES
 ('group_members',2,0),('busy_blocks',1,4),('preferences',2,1),('proposals',1,5),
 ('beliefs',2,2),('rsvp_events',2,1),('belief_revisions',2,2),('proposal_constraints',2,3))
SELECT e.name, e.fks AS expected_fks,e.checks AS expected_checks,
 count(*) FILTER (WHERE c.contype='f') AS actual_fks,
 count(*) FILTER (WHERE c.contype='c') AS actual_checks,
 CASE WHEN count(*) FILTER (WHERE c.contype='f')=e.fks
 AND count(*) FILTER (WHERE c.contype='c')=e.checks
 AND bool_and(c.convalidated) THEN 'PASS' ELSE 'FAIL: inspect constraint definitions' END AS result
FROM expected e LEFT JOIN pg_constraint c ON c.conrelid=to_regclass('public.'||e.name)
 AND c.contype IN ('f','c') GROUP BY e.name,e.fks,e.checks ORDER BY e.name;
SELECT c.conrelid::regclass AS table_name,c.conname,c.contype,c.convalidated,
 pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.connamespace='public'::regnamespace
 AND c.conrelid IN ('group_members'::regclass,'busy_blocks'::regclass,'preferences'::regclass,
 'proposals'::regclass,'beliefs'::regclass,'rsvp_events'::regclass,
 'belief_revisions'::regclass,'proposal_constraints'::regclass)
ORDER BY c.conrelid::regclass::text,c.contype,c.conname;
-- busy_blocks: source whitelist; nonempty, bounded, [) range.
-- proposals: version>=1; status whitelist; same range rules; UNIQUE(thread_id,version).
-- beliefs/revisions: confidence [0,1]; RSVP: yes/no/maybe; constraints: type/scope/approval.
-- Additional indexes should appear below, including partial unique import UID index.
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
 AND tablename IN ('busy_blocks','proposals') ORDER BY tablename,indexname;

-- 8. Read-only data audits: each violation count must be zero.
SELECT 'invalid busy ranges/sources' AS test,count(*) AS violations FROM busy_blocks
WHERE isempty(during) OR NOT lower_inc(during) OR upper_inc(during)
 OR lower_inf(during) OR upper_inf(during) OR source NOT IN ('ics','manual','confirmed_hangout')
UNION ALL SELECT 'orphan memberships',count(*) FROM group_members m
 LEFT JOIN users u ON u.id=m.user_id LEFT JOIN groups g ON g.id=m.group_id WHERE u.id IS NULL OR g.id IS NULL
UNION ALL SELECT 'duplicate import UID',count(*) FROM (
 SELECT user_id,external_uid FROM busy_blocks WHERE external_uid IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) x
UNION ALL SELECT 'duplicate proposal version',count(*) FROM (
 SELECT thread_id,version FROM proposals GROUP BY 1,2 HAVING count(*)>1) x
UNION ALL SELECT 'invalid belief confidence',count(*) FROM beliefs WHERE confidence<0 OR confidence>1
UNION ALL SELECT 'invalid RSVP response',count(*) FROM rsvp_events WHERE response NOT IN ('yes','no','maybe');
-- Diagnostic only: uuid[] has NO foreign key to users or group_members.
-- A missing current membership could be legitimate historical membership removal.
SELECT p.id AS proposal_id,a.user_id, u.id IS NOT NULL AS user_exists,
 m.user_id IS NOT NULL AS current_group_member
FROM proposals p CROSS JOIN LATERAL unnest(p.attendee_ids) a(user_id)
LEFT JOIN users u ON u.id=a.user_id LEFT JOIN group_members m ON m.user_id=a.user_id AND m.group_id=p.group_id
WHERE u.id IS NULL OR m.user_id IS NULL;

-- 9. Actual hypertable registration (not merely existence of ordinary tables).
-- Expect two PASS notices. This block handles missing extension/view gracefully.
DO $$
DECLARE table_name text; present boolean;
BEGIN
 IF to_regclass('timescaledb_information.hypertables') IS NULL THEN
   RAISE NOTICE 'FAIL: TimescaleDB hypertable catalog unavailable';
 ELSE
   FOREACH table_name IN ARRAY ARRAY['rsvp_events','belief_revisions'] LOOP
     EXECUTE 'SELECT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema=$1 AND hypertable_name=$2)'
       INTO present USING 'public',table_name;
     RAISE NOTICE '% hypertable: %',table_name,CASE WHEN present THEN 'PASS' ELSE 'FAIL' END;
   END LOOP;
 END IF;
END $$;

-- 10. London DST ends 25 Oct 2026 at 01:00 UTC. The local 01:00 hour repeats.
-- Each row PASS: 24 Oct 09:00 London = 08:00 UTC; 25 Oct = 09:00 UTC.
WITH cases(local_time,expected_utc) AS (VALUES
 ('2026-10-24 09:00'::timestamp,'2026-10-24 08:00Z'::timestamptz),
 ('2026-10-25 09:00'::timestamp,'2026-10-25 09:00Z'::timestamptz))
SELECT local_time, local_time AT TIME ZONE 'Europe/London' AS actual_utc,expected_utc,
 CASE WHEN local_time AT TIME ZONE 'Europe/London'=expected_utc THEN 'PASS' ELSE 'FAIL' END AS result FROM cases;
-- Expect 25 elapsed hours, despite one local calendar day.
SELECT extract(epoch FROM ('2026-10-26 00:00 Europe/London'::timestamptz-
 '2026-10-25 00:00 Europe/London'::timestamptz))/3600 AS expected_25_hours;
-- Two distinct UTC instants produce the SAME 01:30 local clock reading.
SELECT t AS utc_instant,t AT TIME ZONE 'Europe/London' AS london_wall_time
FROM (VALUES ('2026-10-25 00:30Z'::timestamptz),('2026-10-25 01:30Z'::timestamptz)) x(t);
-- Daytime heatmap avoids the ambiguous hour. Never use a fixed UTC+1 offset
-- for the entire week. Explicit UTC timestamps disambiguate overnight events.

-- 11. Planner-only checks of mutation SQL from queries.ts: EXPLAIN has no ANALYZE,
-- so no insert/update/delete executes. Errors identify SQL/index inference issues.
-- UID conflict inference must use the existing partial-index predicate.
EXPLAIN (COSTS OFF)
INSERT INTO busy_blocks(user_id,during,source,external_uid)
VALUES ('11111111-1111-4111-8111-111111111111'::uuid,
 tstzrange('2026-10-19 23:00Z','2026-10-20 01:00Z','[)'),'ics','validation-plan-only')
ON CONFLICT (user_id,external_uid) WHERE external_uid IS NOT NULL
DO UPDATE SET during=EXCLUDED.during,source=EXCLUDED.source
RETURNING id,user_id,lower(during),upper(during),source,external_uid;
EXPLAIN (COSTS OFF)
DELETE FROM busy_blocks WHERE id='a0000000-0000-4000-8000-000000000001'::uuid
 AND user_id='11111111-1111-4111-8111-111111111111'::uuid;

ROLLBACK; -- Ends read-only transaction and restores local timezone/search_path.
