import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { PoolClient } from "pg";
import { pool } from "./client";
import { createProposal, getProposal, getLatestProposal, reviseProposal,
  recordRsvp, getRsvpHistory, saveProposalConstraint } from "./proposals";
import type { CreateProposalInput, RsvpResponse } from "../lib/types";

const id = "11111111-1111-4111-8111-111111111111";
const input: CreateProposalInput = {
  groupId: id, attendees: [id], title: "Dinner",
  slot: { start: "2026-10-19T23:00:00Z", end: "2026-10-20T01:00:00Z" },
  reasoning: "Everyone is free", assumptions: ["Venue is open"],
};
function row(version = 1) {
  return { id, threadId: id, groupId: id, version, start: new Date(input.slot.start),
    end: new Date(input.slot.end), title: input.title, activityType: null, venueText: null,
    attendees: [id], status: "proposed", reasoning: input.reasoning,
    assumptions: input.assumptions, createdAt: new Date(input.slot.start) };
}

afterEach(() => mock.restoreAll());

type Call = { sql: string; values?: unknown[] };
function database(options: { missingMember?: boolean; failInsert?: boolean } = {}) {
  let latest = row();
  let releaseLock: (() => void) | undefined;
  let tail = Promise.resolve();
  const calls: Call[] = [];
  let released = 0;
  mock.method(pool, "connect", async () => {
    let unlock: (() => void) | undefined;
    const client = {
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        if (sql.includes("pg_advisory_xact_lock")) {
          const waiting = tail;
          tail = new Promise<void>(resolve => { releaseLock = resolve; });
          unlock = releaseLock;
          await waiting;
        }
        if (sql === "COMMIT" || sql === "ROLLBACK") unlock?.();
        if (sql.includes("FROM group_members")) return { rows: options.missingMember ? [] : [{ user_id: id }] };
        if (sql.includes("FROM proposals")) return { rows: [latest] };
        if (sql.includes("INSERT INTO proposals")) {
          if (options.failInsert) throw Object.assign(new Error("Duplicate version"), { code: "23505" });
          latest = { ...row(Number(values![2])), threadId: String(values![0]) };
          return { rows: [latest] };
        }
        return { rows: [] };
      },
      release() { released += 1; },
    };
    return client as unknown as PoolClient;
  });
  return { calls, get released() { return released; } };
}

test("creation generates a thread, validates membership, and commits version 1", async () => {
  const db = database();
  const result = await createProposal(input);
  assert.equal(result.version, 1);
  assert.equal(result.slot.start, "2026-10-19T23:00:00.000Z");
  assert.match(result.threadId, /^[0-9a-f-]{36}$/);
  const insert = db.calls.find(call => call.sql.includes("INSERT INTO proposals"))!;
  assert.equal(insert.values![2], 1);
  assert.equal(insert.values![10], JSON.stringify(input.assumptions));
  assert.match(insert.sql, /'\[\)'/);
  assert.equal(db.calls.at(-1)?.sql, "COMMIT");
  assert.equal(db.released, 1);
});

test("invalid attendee membership rolls back and releases the connection", async () => {
  const db = database({ missingMember: true });
  await assert.rejects(createProposal(input), /belong/);
  assert.equal(db.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(db.released, 1);
  assert.equal(db.calls.some(call => call.sql.includes("INSERT INTO proposals")), false);
});

test("invalid dates, empty invitees, duplicate IDs and invalid UUIDs never connect", async () => {
  const db = database();
  for (const invalid of [
    { ...input, attendees: [] }, { ...input, attendees: [id, id] },
    { ...input, attendees: ["isha"] },
    { ...input, slot: { start: input.slot.end, end: input.slot.start } },
    { ...input, slot: { start: "2026-02-30T00:00:00Z", end: input.slot.end } },
  ]) await assert.rejects(createProposal(invalid));
  assert.equal(db.calls.length, 0);
});

test("revision inserts a new version then supersedes the old row in the transaction", async () => {
  const db = database();
  const result = await reviseProposal(id, { title: "Later dinner", reasoning: "Shift ends late", expectedVersion: 1 });
  assert.equal(result.version, 2);
  const insert = db.calls.find(call => call.sql.includes("INSERT INTO proposals"))!;
  assert.equal(insert.values![5], "Later dinner");
  assert.equal(insert.values![9], "Shift ends late");
  const update = db.calls.findIndex(call => call.sql.includes("UPDATE proposals"));
  assert.ok(update > db.calls.indexOf(insert));
  assert.match(db.calls[update].sql, /status = 'superseded'/);
  assert.equal(db.calls.at(-1)?.sql, "COMMIT");
});

test("two concurrent revisions without expectations receive successive versions", async () => {
  database();
  const results = await Promise.all([
    reviseProposal(id, { reasoning: "First revision" }),
    reviseProposal(id, { reasoning: "Second revision" }),
  ]);
  assert.deepEqual(results.map(result => result.version), [2, 3]);
});

test("concurrent stale edits produce one revision and one version conflict", async () => {
  const db = database();
  const results = await Promise.allSettled([
    reviseProposal(id, { reasoning: "First edit", expectedVersion: 1 }),
    reviseProposal(id, { reasoning: "Stale edit", expectedVersion: 1 }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const failure = results.find(result => result.status === "rejected");
  assert.ok(failure?.status === "rejected");
  assert.match(failure.reason.message, /version conflict/);
  assert.equal(db.released, 2);
});

test("unique constraint failure rolls back without superseding history", async () => {
  const db = database({ failInsert: true });
  await assert.rejects(reviseProposal(id, { reasoning: "New version" }), /Duplicate version/);
  assert.equal(db.calls.some(call => call.sql.includes("UPDATE proposals")), false);
  assert.equal(db.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(db.released, 1);
});

test("retrieval maps dates and uses version order, returning null for missing records", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [row()] }));
  assert.equal((await getProposal(id))?.id, id);
  assert.equal((await getLatestProposal(id))?.version, 1);
  assert.match(String(query.mock.calls[1].arguments[0]), /ORDER BY version DESC LIMIT 1/);
  query.mock.mockImplementation(async () => ({ rows: [] }));
  assert.equal(await getProposal(id), null);
  assert.equal(await getLatestProposal(id), null);
});

const reply = { time: new Date(input.slot.start), proposalId: id, userId: id,
  response: "no", reason: "  I have a shift!\n", extractedEvidence: { notBefore: "21:00" } };

test("RSVP appends exact reply text and JSON evidence and checks invitation membership", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [reply] }));
  const event = await recordRsvp(id, id, "no", reply.reason, reply.extractedEvidence);
  assert.equal(event.reason, reply.reason);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(String(sql), /INSERT INTO rsvp_events/);
  assert.match(String(sql), /ANY\(attendee_ids\)/);
  assert.deepEqual(values, [id, id, "no", reply.reason, JSON.stringify(reply.extractedEvidence)]);
  query.mock.mockImplementation(async () => ({ rows: [] }));
  await assert.rejects(recordRsvp(id, id, "yes"), /not an attendee/);
});

test("invalid RSVP responses never query", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [] }));
  await assert.rejects(recordRsvp(id, id, "accepted" as RsvpResponse), /Invalid RSVP/);
  assert.equal(query.mock.callCount(), 0);
});

test("RSVP history requests chronological order and converts timestamps", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [reply, { ...reply, time: new Date(input.slot.end), response: "yes" }] }));
  const history = await getRsvpHistory(id);
  assert.deepEqual(history.map(event => event.response), ["no", "yes"]);
  assert.equal(history[0].time, "2026-10-19T23:00:00.000Z");
  assert.match(String(query.mock.calls[0].arguments[0]), /ORDER BY time ASC/);
});

test("constraints keep original evidence, default to one-off and pending, without calendar writes", async () => {
  const constraint = { proposalId: id, userId: id, originalText: "  After my shift please.\n",
    constraintType: "not_before" as const, constraintValue: { time: "21:00" } };
  const query = mock.method(pool, "query", async () => ({ rows: [{ ...constraint, id,
    scope: "proposal", approvalStatus: "pending", createdAt: new Date(input.slot.start) }] }));
  const saved = await saveProposalConstraint(constraint);
  assert.equal(saved.originalText, constraint.originalText);
  assert.equal(saved.approvalStatus, "pending");
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(String(sql), /'pending'/);
  assert.deepEqual(values, [id, id, constraint.originalText, "not_before", JSON.stringify(constraint.constraintValue), "proposal"]);
  assert.doesNotMatch(String(sql), /busy_blocks|preferences/);
});
