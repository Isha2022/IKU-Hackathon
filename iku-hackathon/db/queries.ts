import { pool } from "./client";
import type {
  AvailabilitySlot, BusyBlockSource, IsoUtcString, StoredBusyBlock,
} from "../lib/types";

import { validateWindow } from "./validation";

interface BusyBlockRow {
  id: string;
  user_id: string;
  start_time: Date;
  end_time: Date;
  source: BusyBlockSource;
  external_uid: string | null;
}

function toBusyBlock(row: BusyBlockRow): StoredBusyBlock {
  return {
    id: row.id,
    userId: row.user_id,
    start: row.start_time.toISOString(),
    end: row.end_time.toISOString(),
    source: row.source,
    externalUid: row.external_uid,
  };
}

/** Return full stored intervals overlapping [start, end), including overnight blocks. */
export async function getBusyBlocks(
  userIds: string[], start: IsoUtcString, end: IsoUtcString,
): Promise<StoredBusyBlock[]> {
  validateWindow(start, end);
  if (!userIds.length) return [];
  const { rows } = await pool.query<BusyBlockRow>(`
    SELECT id, user_id, lower(during) AS start_time, upper(during) AS end_time,
      source, external_uid
    FROM busy_blocks
    WHERE user_id = ANY($1::uuid[])
      AND during && tstzrange($2::timestamptz, $3::timestamptz, '[)')
    ORDER BY lower(during), id
  `, [userIds, start, end]);
  return rows.map(toBusyBlock);
}

/**
 * Upsert by (user_id, external_uid): the latest import replaces the interval and
 * source while preserving the record ID. This uses the existing partial unique
 * index, so reimporting an ICS event cannot create duplicates for that user.
 * UIDs are scoped to a user for every source; omitted UIDs always insert a new row.
 */
export async function createBusyBlock(
  userId: string, start: IsoUtcString, end: IsoUtcString,
  source: BusyBlockSource, externalUid?: string,
): Promise<StoredBusyBlock> {
  validateWindow(start, end);
  if (!["ics", "manual", "confirmed_hangout"].includes(source)) {
    throw new Error("Invalid busy block source");
  }
  if (externalUid !== undefined &&
    (typeof externalUid !== "string" || !externalUid.trim())) {
    throw new Error("externalUid must be a non-empty string when provided");
  }
  const { rows } = await pool.query<BusyBlockRow>(`
    INSERT INTO busy_blocks (user_id, during, source, external_uid)
    VALUES ($1::uuid, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4, $5)
    ON CONFLICT (user_id, external_uid) WHERE external_uid IS NOT NULL
    DO UPDATE SET during = EXCLUDED.during, source = EXCLUDED.source
    RETURNING id, user_id, lower(during) AS start_time, upper(during) AS end_time,
      source, external_uid
  `, [userId, start, end, source, externalUid ?? null]);
  return toBusyBlock(rows[0]);
}

/** Return false for both missing blocks and blocks belonging to another user. */
export async function deleteBusyBlock(blockId: string, userId: string): Promise<boolean> {
  const result = await pool.query(`
    DELETE FROM busy_blocks WHERE id = $1::uuid AND user_id = $2::uuid
  `, [blockId, userId]);
  return (result.rowCount ?? 0) > 0;
}

/** Each interval is [start, end). Empty calendars are treated as free, not confirmed free. */
export async function getAvailabilityHeatmap(
  userIds: string[],
  start: IsoUtcString,
  end: IsoUtcString,
  intervalMinutes = 30,
): Promise<AvailabilitySlot[]> {
  if (!userIds.length) return [];
  if (intervalMinutes <= 0 || !Number.isInteger(intervalMinutes)) throw new Error("Invalid intervalMinutes");
  if (new Date(start).getTime() >= new Date(end).getTime()) throw new Error("Invalid time window");
  const { rows } = await pool.query<{
    start_time: Date; end_time: Date; available_user_ids: string[] | null;
    available_count: number; total_selected: number;
  }>(`
    WITH selected AS (SELECT DISTINCT unnest($1::uuid[]) AS user_id),
    slots AS (
      SELECT t AS start_time, t + ($4::int * interval '1 minute') AS end_time
      FROM generate_series($2::timestamptz,
        $3::timestamptz - ($4::int * interval '1 minute'),
        $4::int * interval '1 minute') AS t
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
      COALESCE(array_agg(user_id ORDER BY user_id) FILTER (WHERE is_free), ARRAY[]::uuid[]) AS available_user_ids,
      count(*) FILTER (WHERE is_free)::int AS available_count,
      count(*)::int AS total_selected
    FROM availability
    GROUP BY start_time, end_time ORDER BY start_time
  `, [userIds, start, end, intervalMinutes]);
  return rows.map(r => ({
    start: r.start_time.toISOString(), end: r.end_time.toISOString(),
    availableUserIds: r.available_user_ids ?? [],
    availableCount: r.available_count, totalSelected: r.total_selected,
  }));
}

/** Candidate full-duration slots, starting on the chosen grid. */
export async function getFreeSlots(
  userIds: string[], start: IsoUtcString, end: IsoUtcString,
  durationMinutes = 120, stepMinutes = 30,
): Promise<{start: IsoUtcString; end: IsoUtcString}[]> {
  if (!userIds.length) return [];
  if (![durationMinutes,stepMinutes].every(n=>Number.isInteger(n)&&n>0)) throw new Error("Invalid duration or step");
  if (new Date(start).getTime() >= new Date(end).getTime()) return [];
  const {rows} = await pool.query<{start_time: Date;end_time: Date}>(`
    WITH selected AS (SELECT DISTINCT unnest($1::uuid[]) AS user_id),
    candidates AS (
      SELECT t AS start_time, t + ($4::int * interval '1 minute') AS end_time
      FROM generate_series($2::timestamptz,
        $3::timestamptz - ($4::int * interval '1 minute'),
        $5::int * interval '1 minute') t
    )
    SELECT c.start_time,c.end_time FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM busy_blocks b JOIN selected s ON s.user_id=b.user_id
      WHERE b.during && tstzrange(c.start_time,c.end_time,'[)')
    ) ORDER BY c.start_time
  `,[userIds,start,end,durationMinutes,stepMinutes]);
  return rows.map(r=>({start:r.start_time.toISOString(),end:r.end_time.toISOString()}));
}
