import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./client";
import { validateWindow } from "./validation";
import { uuid, text, json, transaction } from "./internal";
import type {
  CreateProposalInput, JsonObject, ProposalChanges,
  ProposalConstraintInput, RsvpEvent, RsvpResponse, StoredProposal,
  StoredProposalConstraint, StoredProposalInvitation,
} from "../lib/types";

function validateProposal(input: CreateProposalInput): void {
  uuid(input.groupId);
  validateWindow(input.slot.start, input.slot.end);
  text(input.title, "title");
  text(input.reasoning, "reasoning");
  if (!Array.isArray(input.attendees) || !input.attendees.length) throw new Error("Select at least one attendee");
  input.attendees.forEach(uuid);
  if (new Set(input.attendees.map(id => id.toLowerCase())).size !== input.attendees.length) {
    throw new Error("Duplicate attendees");
  }
  if (input.assumptions !== undefined &&
    (!Array.isArray(input.assumptions) || input.assumptions.some(item => typeof item !== "string"))) {
    throw new Error("assumptions must be an array of strings");
  }
  for (const value of [input.activityType, input.venueText]) {
    if (value !== undefined && value !== null && typeof value !== "string") throw new Error("Invalid proposal metadata");
  }
}

type ProposalRow = Omit<StoredProposal, "slot" | "createdAt"> & {
  start: Date; end: Date; createdAt: Date;
};
const proposalColumns = `id, thread_id AS "threadId", group_id AS "groupId", version,
  lower(during) AS start, upper(during) AS end, title,
  activity_type AS "activityType", venue_text AS "venueText", attendee_ids AS attendees,
  status, COALESCE(reasoning, '') AS reasoning, assumptions, created_at AS "createdAt"`;
function proposal(row: ProposalRow): StoredProposal {
  const { start, end, createdAt, ...rest } = row;
  return { ...rest, slot: { start: start.toISOString(), end: end.toISOString() }, createdAt: createdAt.toISOString() };
}

async function insertProposal(client: PoolClient, input: CreateProposalInput, threadId: string, version: number): Promise<StoredProposal> {
  // Lock membership rows through commit so attendees cannot disappear during insertion.
  const members = await client.query<{ user_id: string }>(`
    SELECT user_id FROM group_members
    WHERE group_id = $1::uuid AND user_id = ANY($2::uuid[]) FOR SHARE
  `, [input.groupId, input.attendees]);
  if (members.rows.length !== input.attendees.length) throw new Error("All attendees must belong to the proposal group");
  const { rows } = await client.query<ProposalRow>(`
    INSERT INTO proposals (thread_id, group_id, version, during, title, activity_type,
      venue_text, attendee_ids, status, reasoning, assumptions)
    VALUES ($1::uuid, $2::uuid, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'),
      $6, $7, $8, $9::uuid[], 'proposed', $10, $11::jsonb)
    RETURNING ${proposalColumns}
  `, [threadId, input.groupId, version, input.slot.start, input.slot.end, input.title,
    input.activityType ?? null, input.venueText ?? null, input.attendees,
    input.reasoning, json(input.assumptions ?? [])]);
  return proposal(rows[0]);
}

/** Attendees are the persisted invitation list; no external invitations are sent. */
export async function createProposal(input: CreateProposalInput): Promise<StoredProposal> {
  validateProposal(input);
  return transaction(client => insertProposal(client, input, randomUUID(), 1));
}

export async function getProposal(proposalId: string): Promise<StoredProposal | null> {
  uuid(proposalId);
  const { rows } = await pool.query<ProposalRow>(`SELECT ${proposalColumns} FROM proposals WHERE id = $1::uuid`, [proposalId]);
  return rows[0] ? proposal(rows[0]) : null;
}

export async function getLatestProposal(threadId: string): Promise<StoredProposal | null> {
  uuid(threadId);
  const { rows } = await pool.query<ProposalRow>(`
    SELECT ${proposalColumns} FROM proposals WHERE thread_id = $1::uuid ORDER BY version DESC LIMIT 1
  `, [threadId]);
  return rows[0] ? proposal(rows[0]) : null;
}

/** Serialized per thread. expectedVersion rejects stale edits rather than applying them to a newer revision. */
export async function reviseProposal(threadId: string, changes: ProposalChanges): Promise<StoredProposal> {
  uuid(threadId);
  if (changes.expectedVersion !== undefined && (!Number.isInteger(changes.expectedVersion) || changes.expectedVersion < 1)) {
    throw new Error("Invalid expectedVersion");
  }
  // Every revision carries its own explanation; previous versions retain theirs.
  text(changes.reasoning ?? "", "Revision reasoning");
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text, 0))", [threadId]);
    const { rows } = await client.query<ProposalRow>(`
      SELECT ${proposalColumns} FROM proposals WHERE thread_id = $1::uuid
      ORDER BY version DESC LIMIT 1 FOR UPDATE
    `, [threadId]);
    if (!rows[0]) throw new Error("Proposal thread not found");
    const previous = proposal(rows[0]);
    if (changes.expectedVersion !== undefined && changes.expectedVersion !== previous.version) {
      throw new Error("Proposal version conflict: reload the latest proposal");
    }
    if (previous.status !== "proposed") throw new Error("Only a proposed hangout can be revised");
    const input: CreateProposalInput = {
      groupId: previous.groupId, slot: changes.slot ?? previous.slot,
      title: changes.title ?? previous.title, attendees: changes.attendees ?? previous.attendees,
      activityType: changes.activityType === undefined ? previous.activityType : changes.activityType,
      venueText: changes.venueText === undefined ? previous.venueText : changes.venueText,
      reasoning: changes.reasoning, assumptions: changes.assumptions ?? previous.assumptions,
    };
    validateProposal(input);
    const next = await insertProposal(client, input, previous.threadId, previous.version + 1);
    await client.query("UPDATE proposals SET status = 'superseded' WHERE id = $1::uuid", [previous.id]);
    return next;
  });
}

/** Persist in-app invitations for the latest proposed version, excluding its sender. */
export async function submitProposal(
  threadId: string, expectedVersion: number, senderUserId: string,
): Promise<{ proposal: StoredProposal; invitations: StoredProposalInvitation[] }> {
  uuid(threadId); uuid(senderUserId);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("Invalid proposalVersion");
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text, 0))", [threadId]);
    const { rows } = await client.query<ProposalRow>(`
      SELECT ${proposalColumns} FROM proposals WHERE thread_id = $1::uuid
      ORDER BY version DESC LIMIT 1 FOR UPDATE
    `, [threadId]);
    if (!rows[0]) throw new Error("Proposal thread not found");
    const current = proposal(rows[0]);
    if (current.version !== expectedVersion) throw new Error("Proposal version conflict: reload the latest proposal");
    if (current.status !== "proposed") throw new Error("Only a proposed hangout can be sent");

    const senderMembership = await client.query(`
      SELECT 1 FROM group_members WHERE group_id = $1::uuid AND user_id = $2::uuid
    `, [current.groupId, senderUserId]);
    if (!senderMembership.rows.length) throw new Error("Invitation sender must belong to the group");
    const recipientIds = current.attendees.filter((id) => id !== senderUserId);
    if (!recipientIds.length) throw new Error("Select at least one attendee other than yourself");

    await client.query(`
      INSERT INTO proposal_invitations (proposal_id, recipient_user_id)
      SELECT $1::uuid, recipient_id FROM unnest($2::uuid[]) AS recipient_id
      ON CONFLICT (proposal_id, recipient_user_id) DO NOTHING
    `, [current.id, recipientIds]);
    const invitations = await client.query<{ recipientUserId: string; recipientName: string; sentAt: Date }>(`
      SELECT i.recipient_user_id AS "recipientUserId", u.name AS "recipientName", i.sent_at AS "sentAt"
      FROM proposal_invitations i JOIN users u ON u.id = i.recipient_user_id
      WHERE i.proposal_id = $1::uuid ORDER BY u.name, u.id
    `, [current.id]);
    return {
      proposal: current,
      invitations: invitations.rows.map((row) => ({
        proposal: current,
        recipientUserId: row.recipientUserId,
        recipientName: row.recipientName,
        sentAt: row.sentAt.toISOString(),
        response: null,
      })),
    };
  });
}

/** Return the current in-app invitations visible to the whole demo group. */
export async function getGroupInvitations(groupId: string): Promise<StoredProposalInvitation[]> {
  uuid(groupId);
  type Row = ProposalRow & { recipientUserId: string; recipientName: string; sentAt: Date; response: RsvpResponse | null };
  const { rows } = await pool.query<Row>(`
    SELECT p.id, p.thread_id AS "threadId", p.group_id AS "groupId", p.version,
      lower(p.during) AS start, upper(p.during) AS end, p.title,
      p.activity_type AS "activityType", p.venue_text AS "venueText", p.attendee_ids AS attendees,
      p.status, COALESCE(p.reasoning, '') AS reasoning, p.assumptions, p.created_at AS "createdAt",
      i.recipient_user_id AS "recipientUserId", u.name AS "recipientName", i.sent_at AS "sentAt",
      latest.response
    FROM proposal_invitations i
    JOIN proposals p ON p.id = i.proposal_id
    JOIN users u ON u.id = i.recipient_user_id
    LEFT JOIN LATERAL (
      SELECT event.response FROM rsvp_events event
      WHERE event.proposal_id = i.proposal_id AND event.user_id = i.recipient_user_id
      ORDER BY event.time DESC LIMIT 1
    ) latest ON TRUE
    WHERE p.group_id = $1::uuid AND p.status IN ('proposed', 'confirmed')
      AND p.version = (SELECT max(latest.version) FROM proposals latest WHERE latest.thread_id = p.thread_id)
    ORDER BY i.sent_at DESC, p.created_at DESC, u.name
  `, [groupId]);
  return rows.map((row) => {
    const { recipientUserId, recipientName, sentAt, response, ...proposalRow } = row;
    return {
      proposal: proposal(proposalRow),
      recipientUserId,
      recipientName,
      sentAt: sentAt.toISOString(),
      response,
    };
  });
}

/** Only a saved invitation recipient may respond to that proposal. */
export async function isProposalRecipient(proposalId: string, userId: string): Promise<boolean> {
  uuid(proposalId); uuid(userId);
  const { rows } = await pool.query(`
    SELECT 1 FROM proposal_invitations
    WHERE proposal_id = $1::uuid AND recipient_user_id = $2::uuid
  `, [proposalId, userId]);
  return rows.length > 0;
}

/** Confirm the current proposal when every persisted invitee's latest RSVP is yes. */
export async function confirmProposalIfAllInvitedAccepted(
  threadId: string, expectedVersion: number,
): Promise<{ proposal: StoredProposal; confirmed: boolean }> {
  uuid(threadId);
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text, 0))", [threadId]);
    const { rows } = await client.query<ProposalRow>(`
      SELECT ${proposalColumns} FROM proposals WHERE thread_id = $1::uuid
      ORDER BY version DESC LIMIT 1 FOR UPDATE
    `, [threadId]);
    if (!rows[0]) throw new Error("Proposal thread not found");
    let current = proposal(rows[0]);
    if (current.version !== expectedVersion) throw new Error("Proposal version conflict: reload the latest proposal");
    if (current.status === "confirmed") return { proposal: current, confirmed: true };
    if (current.status !== "proposed") return { proposal: current, confirmed: false };

    const result = await client.query<{ inviteeCount: number; acceptedCount: number }>(`
      SELECT count(*)::int AS "inviteeCount",
        count(*) FILTER (WHERE latest.response = 'yes')::int AS "acceptedCount"
      FROM proposal_invitations i
      LEFT JOIN LATERAL (
        SELECT event.response FROM rsvp_events event
        WHERE event.proposal_id = i.proposal_id AND event.user_id = i.recipient_user_id
        ORDER BY event.time DESC LIMIT 1
      ) latest ON TRUE
      WHERE i.proposal_id = $1::uuid
    `, [current.id]);
    const counts = result.rows[0];
    if (!counts || counts.inviteeCount === 0 || counts.acceptedCount !== counts.inviteeCount) {
      return { proposal: current, confirmed: false };
    }

    const updated = await client.query<ProposalRow>(`
      UPDATE proposals SET status = 'confirmed' WHERE id = $1::uuid
      RETURNING ${proposalColumns}
    `, [current.id]);
    current = proposal(updated.rows[0]);
    return { proposal: current, confirmed: true };
  });
}

type RsvpRow = Omit<RsvpEvent, "time"> & { time: Date };
const rsvpColumns = `time, proposal_id AS "proposalId", user_id AS "userId", response,
  reason, extracted_evidence AS "extractedEvidence"`;
function rsvp(row: RsvpRow): RsvpEvent { return { ...row, time: row.time.toISOString() }; }

/** Append-only, including replies to older versions. Never confirms a proposal or creates busy blocks. */
export async function recordRsvp(
  proposalId: string, userId: string, response: RsvpResponse,
  reason?: string, extractedEvidence: JsonObject = {},
): Promise<RsvpEvent> {
  uuid(proposalId); uuid(userId);
  if (!["yes", "no", "maybe"].includes(response)) throw new Error("Invalid RSVP response");
  if (reason !== undefined && typeof reason !== "string") throw new Error("Invalid RSVP reason");
  if (!extractedEvidence || Array.isArray(extractedEvidence) || typeof extractedEvidence !== "object") {
    throw new Error("extractedEvidence must be a JSON object");
  }
  const { rows } = await pool.query<RsvpRow>(`
    INSERT INTO rsvp_events (proposal_id, user_id, response, reason, extracted_evidence)
    SELECT id, $2::uuid, $3, $4, $5::jsonb FROM proposals
    WHERE id = $1::uuid AND $2::uuid = ANY(attendee_ids)
    RETURNING ${rsvpColumns}
  `, [proposalId, userId, response, reason ?? null, json(extractedEvidence)]);
  if (!rows[0]) throw new Error("Proposal not found or user is not an attendee");
  return rsvp(rows[0]);
}

/** Equal timestamps have no guaranteed insertion order: the hypertable has no sequence ID. */
export async function getRsvpHistory(proposalId: string): Promise<RsvpEvent[]> {
  uuid(proposalId);
  const { rows } = await pool.query<RsvpRow>(`
    SELECT ${rsvpColumns} FROM rsvp_events WHERE proposal_id = $1::uuid ORDER BY time ASC
  `, [proposalId]);
  return rows.map(rsvp);
}

type ConstraintRow = Omit<StoredProposalConstraint, "createdAt"> & { createdAt: Date };
/** Even explicitly recurring constraints remain pending; this does not update calendars/preferences. */
export async function saveProposalConstraint(input: ProposalConstraintInput): Promise<StoredProposalConstraint> {
  uuid(input.proposalId); uuid(input.userId);
  text(input.originalText, "originalText");
  if (!["not_before", "not_after", "indoor", "other"].includes(input.constraintType)) throw new Error("Invalid constraint type");
  const scope = input.scope ?? "proposal";
  if (!["proposal", "recurring"].includes(scope)) throw new Error("Invalid constraint scope");
  const { rows } = await pool.query<ConstraintRow>(`
    INSERT INTO proposal_constraints (proposal_id, user_id, original_text, constraint_type, constraint_value, scope, approval_status)
    SELECT id, $2::uuid, $3, $4, $5::jsonb, $6, 'pending' FROM proposals
    WHERE id = $1::uuid AND $2::uuid = ANY(attendee_ids)
    RETURNING id, proposal_id AS "proposalId", user_id AS "userId", original_text AS "originalText",
      constraint_type AS "constraintType", constraint_value AS "constraintValue", scope,
      approval_status AS "approvalStatus", created_at AS "createdAt"
  `, [input.proposalId, input.userId, input.originalText, input.constraintType, json(input.constraintValue), scope]);
  if (!rows[0]) throw new Error("Proposal not found or user is not an attendee");
  return { ...rows[0], createdAt: rows[0].createdAt.toISOString() };
}
