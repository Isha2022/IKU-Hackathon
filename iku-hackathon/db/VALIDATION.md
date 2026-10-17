# Cloud SQL validation

1. Open the Timescale Cloud SQL Editor for the service/database where you applied
   `schema.sql` and `seed.sql`.
2. Paste `db/validate.sql`, including BEGIN and ROLLBACK, and run it. If the editor
   displays one result at a time, inspect each result tab. Look at Notices/Messages
   for the two hypertable results. You can also run sections individually, keeping
   the initial read-only transaction/UTC setup and ending with ROLLBACK.
3. PASS is expected for schema/seed checks; violation counts should be zero.
   Constraint definitions and indexes are inspection output, not PASS/FAIL rows.
   WARN means live data differs from the fixed seed baseline and may be legitimate.
   Review FAIL results or SQL errors before interpreting subsequent sections.
   If a statement fails and the transaction is aborted, run `ROLLBACK;` first.

The script does not mutate data. Plain EXPLAIN (without ANALYZE) validates the
busy-block upsert plan and user-scoped delete plan without executing either.
The script inspects foreign keys/CHECK definitions and their validation state;
it does not attempt deliberately invalid inserts. Group/user checks use IDs
confirmed in seed.sql. Application tables are assumed to be in public.

## Seed-only expected heatmap

Each day has 26 half-hour slots from 09:00 through 21:30 London time.
Counts mean **no recorded conflict**, not explicit availability confirmation.

| Local date | Slots with 4 no-conflict users | Slots with 3 no-conflict users |
| --- | ---: | ---: |
| 19 Oct | 12 | 14 |
| 20 Oct | 14 | 12 |
| 21 Oct | 20 | 6 |
| 22 Oct | 18 | 8 |
| 23 Oct | 16 | 10 |
| 24 Oct | 20 | 6 |
| 25 Oct | 26 | 0 |
| Total | 126 | 56 |

Total: 182 slots and 672 no-conflict person-slots. Friday's 17:00–23:00 seed
block contributes only 17:00–22:00 to this daytime heatmap. Extra memberships or
busy blocks can change live counts. The script compares every live slot with an
isolated seed-only baseline so extras do not silently redefine expectations.

Boundary/overnight/duplicate-count checks should all PASS. The no-busy fixture
has one user with no recorded conflict but deliberately makes no claim of
confirmed availability. There is no generic confirmed-free field in the schema.

Two hypertable notices should say PASS in TimescaleDB. On 25 October, London has
25 elapsed hours: 00:30 UTC and 01:30 UTC both display as 01:30 locally. At 09:00,
24 October is 08:00 UTC; 25 October is 09:00 UTC. The daytime grid remains 26 slots.

## Review findings and minimal proposed fixes

These are proposals; production schema and queries were not changed in this task.

- `availability.sql` returns NULL available_user_ids if everybody is busy;
  `queries.ts` already returns an empty array. Use
  `COALESCE(array_agg(user_id ORDER BY user_id) FILTER (WHERE is_free), ARRAY[]::uuid[])`
  in the standalone SQL for consistency.
- `getAvailabilityHeatmap` and `getFreeSlots` compare parsed dates without checking
  NaN, so invalid date strings reach PostgreSQL. Reuse `validateWindow(start,end)`
  before querying; decide whether reversed/empty windows should throw consistently
  rather than sometimes returning an empty array.
- The heatmap's CROSS JOIN produces no rows for an empty selected group. If the
  frontend needs a complete zero-count grid, aggregate from slots with a LEFT JOIN
  and use count(user_id), not count(*). Current nonempty-group counts are correct.
- `proposals.attendee_ids` is a uuid[] without an attendee membership foreign key.
  Existing proposal functions validate membership, but direct SQL can bypass it.
  Continue using those functions; a normalized proposal_attendees table would be
  a later schema enhancement, not necessary for this demo.
- Range checks reject unbounded ranges but not explicit timestamp '-infinity' or
  'infinity' bounds. Optional hardening for busy_blocks/proposals is
  `CHECK (isfinite(lower(during)) AND isfinite(upper(during)))`, alongside current
  checks. Node input validation already rejects such values.
- Availability means absence of stored conflicts. Keep this label distinct from
  RSVP yes/explicit constraints. No SQL result should turn a one-off reply into a
  recurring preference automatically.
- Keep Europe/London conversion per timestamp; a fixed +01:00 offset is wrong after
  the DST change. Avoid ambiguous local 01:xx inputs on 25 October; use explicit
  UTC instants. Interval stepping in the queries is elapsed minutes, appropriate
  for duration searches; local wall-clock days can be 25 hours.

## Verification performed

The full validation file ran successfully against an isolated local PostgreSQL
14.17 database using the actual schema with only the TimescaleDB extension and
create_hypertable statements omitted, followed by the actual seed.sql. All seed,
range, grid, catalog, and DST checks passed; violation counts were zero. The
upsert EXPLAIN selected busy_blocks_import_uid_idx. The hypertable section
correctly reported the unavailable TimescaleDB catalog in that local instance.

No live Tiger Data execution was performed. Actual hypertable registration and
cloud-specific constraints/permissions must be checked in the Cloud SQL Editor.
