import "server-only";
import { pool } from "./client";
import { uuid, text, json, transaction } from "./internal";
import type {
  CreateBeliefInput, GroupMember, GroupPreference, RecentRsvpEvidence,
  StoredBelief, StoredBeliefRevision, StoredProposalConstraint,
} from "../lib/types";

function confidence(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Confidence must be a finite number between 0 and 1");
  }
}

type BeliefRow = Omit<StoredBelief, "confidence" | "updatedAt"> & {
  confidence: string | number; updatedAt: Date;
};
const beliefColumns = `id, group_id AS "groupId", subject_user_id AS "subjectUserId",
  statement, confidence, status, evidence, updated_at AS "updatedAt"`;
function belief(row: BeliefRow): StoredBelief {
  return { ...row, confidence: Number(row.confidence), updatedAt: row.updatedAt.toISOString() };
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  uuid(groupId);
  const { rows } = await pool.query<GroupMember>(`
    SELECT u.id, u.name, u.timezone FROM group_members m JOIN users u ON u.id = m.user_id
    WHERE m.group_id = $1::uuid ORDER BY u.name, u.id
  `, [groupId]);
  return rows;
}

/** userId null denotes a group-wide preference; no preferences are inferred here. */
export async function getGroupPreferences(groupId: string): Promise<GroupPreference[]> {
  uuid(groupId);
  const { rows } = await pool.query<Omit<GroupPreference, "createdAt"> & { createdAt: Date }>(`
    SELECT id, group_id AS "groupId", user_id AS "userId", category, value, created_at AS "createdAt"
    FROM preferences WHERE group_id = $1::uuid ORDER BY created_at, id
  `, [groupId]);
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** Defaults to active only. Pass { activeOnly: false } to include revised/retired records. */
export async function getBeliefs(groupId: string, options: { activeOnly?: boolean } = {}): Promise<StoredBelief[]> {
  uuid(groupId);
  const { rows } = await pool.query<BeliefRow>(`
    SELECT ${beliefColumns} FROM beliefs
    WHERE group_id = $1::uuid AND (NOT $2::boolean OR status = 'active')
    ORDER BY updated_at DESC, id
  `, [groupId, options.activeOnly ?? true]);
  return rows.map(belief);
}

/** Evidence must be supplied by the caller; this function never manufactures an inference. */
export async function createBelief(input: CreateBeliefInput): Promise<StoredBelief> {
  uuid(input.groupId);
  if (input.subjectUserId != null) uuid(input.subjectUserId);
  text(input.statement, "statement");
  confidence(input.confidence);
  if (!Array.isArray(input.evidence) || !input.evidence.length) throw new Error("Provide at least one stored evidence item");
  const evidence = json(input.evidence);
  return transaction(async client => {
    if (input.subjectUserId != null) {
      const members = await client.query(`
        SELECT user_id FROM group_members WHERE group_id = $1::uuid AND user_id = $2::uuid FOR SHARE
      `, [input.groupId, input.subjectUserId]);
      if (!members.rows.length) throw new Error("Belief subject must belong to the group");
    }
    const { rows } = await client.query<BeliefRow>(`
      INSERT INTO beliefs (group_id, subject_user_id, statement, confidence, status, evidence)
      VALUES ($1::uuid, $2::uuid, $3, $4, 'active', $5::jsonb)
      RETURNING ${beliefColumns}
    `, [input.groupId, input.subjectUserId ?? null, input.statement, input.confidence, evidence]);
    return belief(rows[0]);
  });
}

/** Locks the belief so concurrent revisions capture the actual preceding confidence. */
export async function reviseBelief(
  beliefId: string, newConfidence: number, trigger: string, explanation: string, proposalId?: string,
): Promise<StoredBelief> {
  uuid(beliefId);
  if (proposalId !== undefined) uuid(proposalId);
  confidence(newConfidence);
  text(trigger, "trigger"); text(explanation, "explanation");
  return transaction(async client => {
    const previous = await client.query<BeliefRow>(`
      SELECT ${beliefColumns} FROM beliefs WHERE id = $1::uuid FOR UPDATE
    `, [beliefId]);
    if (!previous.rows[0]) throw new Error("Belief not found");
    if (previous.rows[0].status === "retired") throw new Error("Cannot revise a retired belief");
    if (proposalId !== undefined) {
      const proposal = await client.query(`
        SELECT id FROM proposals WHERE id = $1::uuid AND group_id = $2::uuid FOR SHARE
      `, [proposalId, previous.rows[0].groupId]);
      if (!proposal.rows.length) throw new Error("Proposal must belong to the belief group");
    }
    // Preserve original statement, evidence and lifecycle status; revised means a
    // separate stored status, not something inferred from a confidence change.
    const { rows } = await client.query<BeliefRow>(`
      UPDATE beliefs SET confidence = $2, updated_at = clock_timestamp()
      WHERE id = $1::uuid RETURNING ${beliefColumns}
    `, [beliefId, newConfidence]);
    await client.query(`
      INSERT INTO belief_revisions (time, belief_id, proposal_id, old_confidence, new_confidence, trigger, explanation)
      VALUES (clock_timestamp(), $1::uuid, $2::uuid, $3, $4, $5, $6)
    `, [beliefId, proposalId ?? null, Number(previous.rows[0].confidence), Number(rows[0].confidence), trigger, explanation]);
    return belief(rows[0]);
  });
}

export async function getBeliefRevisionHistory(beliefId: string): Promise<StoredBeliefRevision[]> {
  uuid(beliefId);
  type Row = Omit<StoredBeliefRevision, "time" | "oldConfidence" | "newConfidence"> & {
    time: Date; oldConfidence: string | number; newConfidence: string | number;
  };
  const { rows } = await pool.query<Row>(`
    SELECT time, belief_id AS "beliefId", proposal_id AS "proposalId",
      old_confidence AS "oldConfidence", new_confidence AS "newConfidence", trigger, explanation
    FROM belief_revisions WHERE belief_id = $1::uuid ORDER BY time ASC
  `, [beliefId]);
  return rows.map(row => ({ ...row, time: row.time.toISOString(),
    oldConfidence: Number(row.oldConfidence), newConfidence: Number(row.newConfidence) }));
}

/** Group relevance is the proposal's group, including older versions and former members. */
export async function getRecentRsvpEvidence(groupId: string, limit = 50): Promise<RecentRsvpEvidence[]> {
  uuid(groupId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("limit must be an integer from 1 to 500");
  type Row = Omit<RecentRsvpEvidence, "time" | "slot"> & { time: Date; start: Date; end: Date };
  const { rows } = await pool.query<Row>(`
    SELECT r.time, r.proposal_id AS "proposalId", r.user_id AS "userId", r.response,
      r.reason, r.extracted_evidence AS "extractedEvidence", p.thread_id AS "threadId",
      p.version AS "proposalVersion", p.title AS "proposalTitle",
      lower(p.during) AS start, upper(p.during) AS end,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'proposalId', c.proposal_id, 'userId', c.user_id,
        'originalText', c.original_text, 'constraintType', c.constraint_type,
        'constraintValue', c.constraint_value, 'scope', c.scope,
        'approvalStatus', c.approval_status, 'createdAt', c.created_at
      ) ORDER BY c.created_at, c.id) FROM proposal_constraints c
        WHERE c.proposal_id = r.proposal_id AND c.user_id = r.user_id), '[]'::jsonb) AS constraints
    FROM rsvp_events r JOIN proposals p ON p.id = r.proposal_id
    WHERE p.group_id = $1::uuid ORDER BY r.time DESC LIMIT $2::int
  `, [groupId, limit]);
  return rows.map(row => {
    const { time, start, end, constraints, ...rest } = row;
    return { ...rest, time: time.toISOString(), slot: { start: start.toISOString(), end: end.toISOString() },
      constraints: constraints.map((constraint: StoredProposalConstraint) => ({ ...constraint,
        createdAt: new Date(constraint.createdAt).toISOString() })) };
  });
}
