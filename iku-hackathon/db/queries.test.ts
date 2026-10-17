import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { pool } from "./client";
import { createBusyBlock, deleteBusyBlock, getBusyBlocks } from "./queries";
import type { BusyBlockSource } from "../lib/types";

// Run with a dummy DATABASE_URL; the pool is mocked and never connects.
const userId = "11111111-1111-4111-8111-111111111111";
const blockId = "a0000000-0000-4000-8000-000000000001";
const start = "2026-10-19T23:00:00Z";
const end = "2026-10-20T01:00:00Z";
const row = {
  id: blockId, user_id: userId,
  start_time: new Date(start), end_time: new Date(end),
  source: "ics", external_uid: "calendar-event-1",
};

afterEach(() => mock.restoreAll());

test("invalid and reversed windows are rejected before any database call", async () => {
  const query = mock.method(pool, "query", async () => {
    throw new Error("Unexpected database call");
  });
  for (const [from, to] of [
    ["not-a-date", end], [start, "not-a-date"],
    ["2026-02-30T12:00:00Z", end],
    ["2026-10-19T23:00:00", end],
    ["2026-10-19T24:00:00Z", end],
    [end, start], [start, start],
  ]) {
    await assert.rejects(getBusyBlocks([userId], from, to));
    await assert.rejects(createBusyBlock(userId, from, to, "manual"));
  }
  assert.equal(query.mock.callCount(), 0);
});

test("empty selection returns no blocks without querying", async () => {
  const query = mock.method(pool, "query", async () => {
    throw new Error("Unexpected database call");
  });
  assert.deepEqual(await getBusyBlocks([], start, end), []);
  assert.equal(query.mock.callCount(), 0);
});

test("retrieval uses selected users and half-open overlap, preserving full overnight bounds", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [row] }));
  assert.deepEqual(await getBusyBlocks([userId], start, end), [{
    id: blockId, userId, start: new Date(start).toISOString(),
    end: new Date(end).toISOString(), source: "ics", externalUid: "calendar-event-1",
  }]);
  const [sql, parameters] = query.mock.calls[0].arguments;
  assert.match(String(sql), /user_id = ANY\(\$1::uuid\[\]\)/);
  assert.match(String(sql), /during && tstzrange\(\$2::timestamptz, \$3::timestamptz, '\[\)'\)/);
  assert.deepEqual(parameters, [[userId], start, end]);
});

test("ICS upsert targets the partial index and returns the existing record ID", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [row] }));
  const result = await createBusyBlock(userId, start, end, "ics", "calendar-event-1");
  assert.equal(result.id, blockId);
  assert.equal(result.externalUid, "calendar-event-1");
  const [sql, parameters] = query.mock.calls[0].arguments;
  assert.match(String(sql), /ON CONFLICT \(user_id, external_uid\) WHERE external_uid IS NOT NULL/);
  assert.match(String(sql), /DO UPDATE SET during = EXCLUDED.during, source = EXCLUDED.source/);
  assert.match(String(sql), /tstzrange\(\$2::timestamptz, \$3::timestamptz, '\[\)'\)/);
  assert.deepEqual(parameters, [userId, start, end, "ics", "calendar-event-1"]);
});

test("all permitted sources work without an external UID; subsecond dates are accepted", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [{ ...row, external_uid: null }] }));
  for (const source of ["ics", "manual", "confirmed_hangout"] as const) {
    const result = await createBusyBlock(userId, "2026-10-19T23:00:00.1Z", end, source);
    assert.equal(result.externalUid, null);
    assert.deepEqual(query.mock.calls.at(-1)?.arguments[1],
      [userId, "2026-10-19T23:00:00.1Z", end, source, null]);
  }
});

test("invalid source and blank UID are rejected before querying", async () => {
  const query = mock.method(pool, "query", async () => {
    throw new Error("Unexpected database call");
  });
  await assert.rejects(createBusyBlock(userId, start, end, "other" as BusyBlockSource));
  await assert.rejects(createBusyBlock(userId, start, end, "ics", "   "));
  assert.equal(query.mock.callCount(), 0);
});

test("deletion includes ownership and reports whether a row was deleted", async () => {
  const query = mock.method(pool, "query", async () => ({ rowCount: 1 }));
  assert.equal(await deleteBusyBlock(blockId, userId), true);
  const [sql, parameters] = query.mock.calls[0].arguments;
  assert.match(String(sql), /WHERE id = \$1::uuid AND user_id = \$2::uuid/);
  assert.deepEqual(parameters, [blockId, userId]);
  query.mock.mockImplementation(async () => ({ rowCount: 0 }));
  assert.equal(await deleteBusyBlock(blockId, userId), false);
});

test("database errors propagate to the caller", async () => {
  mock.method(pool, "query", async () => { throw new Error("Database unavailable"); });
  await assert.rejects(getBusyBlocks([userId], start, end), /Database unavailable/);
  await assert.rejects(createBusyBlock(userId, start, end, "manual"), /Database unavailable/);
  await assert.rejects(deleteBusyBlock(blockId, userId), /Database unavailable/);
});
