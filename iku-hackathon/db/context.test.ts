import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { PoolClient } from "pg";
import { pool } from "./client";
import { getGroupMembers, getGroupPreferences, getBeliefs, createBelief,
  reviseBelief, getBeliefRevisionHistory, getRecentRsvpEvidence } from "./context";

const id = "11111111-1111-4111-8111-111111111111";
const time = new Date("2026-10-19T12:00:00Z");
const stored = { id, groupId: id, subjectUserId: id, statement: "May prefer evenings",
  confidence: "0.600", status: "active", evidence: [{ reply: "  After work.\n" }], updatedAt: time };
const input = { groupId: id, subjectUserId: id, statement: stored.statement, confidence: 0.6, evidence: stored.evidence };
afterEach(() => mock.restoreAll());

test("membership and preferences are scoped to the group and preserve null group-wide user IDs", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [{ id, name: "Isha", timezone: "Europe/London" }] }));
  assert.equal((await getGroupMembers(id))[0].name, "Isha");
  assert.match(String(query.mock.calls[0].arguments[0]), /WHERE m.group_id = \$1::uuid/);
  assert.deepEqual(query.mock.calls[0].arguments[1], [id]);
  mock.restoreAll();
  mock.method(pool, "query", async () => ({ rows: [{ id, groupId: id, userId: null, category: "budget", value: "Low cost", createdAt: time }] }));
  const prefs = await getGroupPreferences(id);
  assert.equal(prefs[0].userId, null);
  assert.equal(prefs[0].createdAt, time.toISOString());
});

test("belief filtering defaults to active, with explicit opt-out and numeric confidence mapping", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [stored] }));
  assert.equal((await getBeliefs(id))[0].confidence, 0.6);
  await getBeliefs(id, { activeOnly: false });
  assert.deepEqual(query.mock.calls.map(call => call.arguments[1]), [[id, true], [id, false]]);
});

function database(failAudit = false, missingMember = false, missingProposal = false) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO belief_revisions") && failAudit) throw new Error("Audit failed");
      if (sql.includes("FROM group_members")) return { rows: missingMember ? [] : [{ user_id: id }] };
      if (sql.includes("FROM proposals")) return { rows: missingProposal ? [] : [{ id }] };
      if (sql.includes("UPDATE beliefs")) return { rows: [{ ...stored, confidence: "0.350" }] };
      if (sql.includes("FROM beliefs") || sql.includes("INSERT INTO beliefs")) return { rows: [stored] };
      return { rows: [] };
    },
    release() { released = true; },
  };
  mock.method(pool, "connect", async () => client as unknown as PoolClient);
  return { calls, get released() { return released; } };
}

test("confidence validation rejects NaN, infinity and out-of-range values before connecting", async () => {
  const db = database();
  for (const value of [-0.1, 1.1, NaN, Infinity]) {
    await assert.rejects(createBelief({ ...input, confidence: value }), /Confidence/);
    await assert.rejects(reviseBelief(id, value, "rsvp", "New reply"), /Confidence/);
  }
  assert.equal(db.calls.length, 0);
  // Endpoints are permitted.
  await createBelief({ ...input, confidence: 0 });
  await createBelief({ ...input, confidence: 1 });
});

test("belief creation retains supplied evidence and validates membership", async () => {
  const db = database();
  const created = await createBelief(input);
  assert.deepEqual(created.evidence, stored.evidence);
  const insert = db.calls.find(call => call.sql.includes("INSERT INTO beliefs"))!;
  assert.equal(insert.values![4], JSON.stringify(stored.evidence));
  assert.equal(db.calls.at(-1)?.sql, "COMMIT");
  assert.equal(db.released, true);
  await assert.rejects(createBelief({ ...input, evidence: [] }), /evidence/);
});

test("nonmember belief subjects are rejected with rollback", async () => {
  const db = database(false, true);
  await assert.rejects(createBelief(input), /belong/);
  assert.equal(db.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(db.calls.some(call => call.sql.includes("INSERT INTO beliefs")), false);
});

test("revision locks the belief and audits stored precision, preserving original explanation", async () => {
  const db = database();
  const explanation = "  A one-off shift changed confidence.\n";
  const revised = await reviseBelief(id, 0.3501, "rsvp", explanation, id);
  assert.equal(revised.confidence, 0.35);
  assert.match(db.calls[1].sql, /FOR UPDATE/);
  const audit = db.calls.find(call => call.sql.includes("INSERT INTO belief_revisions"))!;
  assert.deepEqual(audit.values, [id, id, 0.6, 0.35, "rsvp", explanation]);
  const update = db.calls.find(call => call.sql.includes("UPDATE beliefs"))!;
  assert.doesNotMatch(update.sql, /SET.*evidence|SET.*statement/);
  assert.equal(db.calls.at(-1)?.sql, "COMMIT");
});

test("audit failure rolls back the confidence update and releases the connection", async () => {
  const db = database(true);
  await assert.rejects(reviseBelief(id, 0.35, "rsvp", "New evidence"), /Audit failed/);
  assert.equal(db.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(db.calls.some(call => call.sql === "COMMIT"), false);
  assert.equal(db.released, true);
});

test("a revision cannot reference another group's proposal", async () => {
  const db = database(false, false, true);
  await assert.rejects(reviseBelief(id, 0.35, "rsvp", "Evidence", id), /Proposal must belong/);
  assert.equal(db.calls.some(call => call.sql.includes("UPDATE beliefs")), false);
});

test("revision history is chronological and numeric PostgreSQL strings become numbers", async () => {
  const query = mock.method(pool, "query", async () => ({ rows: [{ time, beliefId: id, proposalId: null,
    oldConfidence: "0.600", newConfidence: "0.350", trigger: "rsvp", explanation: "Shift" }] }));
  const history = await getBeliefRevisionHistory(id);
  assert.equal(history[0].newConfidence, 0.35);
  assert.equal(history[0].time, time.toISOString());
  assert.match(String(query.mock.calls[0].arguments[0]), /ORDER BY time ASC/);
});

test("recent evidence is scoped by proposal group, newest first, with bounded parameterized limit", async () => {
  const constraint = { id, proposalId: id, userId: id, originalText: "Not before 9",
    constraintType: "not_before", constraintValue: { time: "21:00" }, scope: "proposal", approvalStatus: "pending", createdAt: time.toISOString() };
  const query = mock.method(pool, "query", async () => ({ rows: [{ time, proposalId: id, userId: id,
    response: "no", reason: "  Shift tonight.\n", extractedEvidence: {}, threadId: id,
    proposalVersion: 1, proposalTitle: "Dinner", start: time, end: new Date(time.getTime() + 3600000), constraints: [constraint] }] }));
  const events = await getRecentRsvpEvidence(id, 10);
  assert.equal(events[0].reason, "  Shift tonight.\n");
  assert.equal(events[0].constraints[0].approvalStatus, "pending");
  const [sql, args] = query.mock.calls[0].arguments;
  assert.match(String(sql), /WHERE p.group_id = \$1::uuid ORDER BY r.time DESC LIMIT \$2::int/);
  assert.deepEqual(args, [id, 10]);
  for (const limit of [0, -1, 501, 1.5, NaN]) await assert.rejects(getRecentRsvpEvidence(id, limit), /limit/);
  assert.equal(query.mock.callCount(), 1);
});
