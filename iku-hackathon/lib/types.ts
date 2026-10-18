export type IsoUtcString = string;

export interface AvailabilitySlot {
  start: IsoUtcString;
  end: IsoUtcString;
  availableUserIds: string[];
  availableCount: number;
  totalSelected: number;
}

export interface User {
  id: string;
  name: string;
}

export interface BusyBlock {
  id: string;
  userId: User["id"];
  start: IsoUtcString;
  end: IsoUtcString;
}

export type BusyBlockSource = "ics" | "manual" | "confirmed_hangout";

/** Database metadata is separate so existing frontend BusyBlock fixtures remain valid. */
export interface StoredBusyBlock extends BusyBlock {
  source: BusyBlockSource;
  externalUid: string | null;
}

export interface Proposal {
  slot: {
    start: IsoUtcString;
    end: IsoUtcString;
  };
  title: string;
  attendees: User["id"][];
  assumptions: string[];
  version: number;
  reasoning: string;
}

export type ProposalStatus = "proposed" | "superseded" | "confirmed" | "cancelled";
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface CreateProposalInput {
  groupId: string;
  slot: Proposal["slot"];
  title: string;
  attendees: string[];
  activityType?: string | null;
  venueText?: string | null;
  reasoning: string;
  assumptions?: string[];
}

export interface StoredProposal extends Proposal {
  id: string;
  threadId: string;
  groupId: string;
  activityType: string | null;
  venueText: string | null;
  status: ProposalStatus;
  createdAt: IsoUtcString;
}

export interface StoredProposalInvitation {
  proposal: StoredProposal;
  recipientUserId: string;
  recipientName: string;
  sentAt: IsoUtcString;
  response: RsvpResponse | null;
}

/** Include expectedVersion when revising a version displayed in the UI. */
export type ProposalChanges = Partial<Omit<CreateProposalInput, "groupId" | "reasoning">> & {
  reasoning: string;
  expectedVersion?: number;
};

export type RsvpResponse = "yes" | "no" | "maybe";
export interface RsvpEvent {
  time: IsoUtcString;
  proposalId: string;
  userId: string;
  response: RsvpResponse;
  reason: string | null;
  extractedEvidence: JsonObject;
}

export interface ProposalConstraintInput {
  proposalId: string;
  userId: string;
  originalText: string;
  constraintType: "not_before" | "not_after" | "indoor" | "other";
  constraintValue: JsonValue;
  scope?: "proposal" | "recurring";
}

export interface StoredProposalConstraint extends ProposalConstraintInput {
  id: string;
  scope: "proposal" | "recurring";
  approvalStatus: "pending" | "approved" | "rejected";
  createdAt: IsoUtcString;
}

export interface Belief {
  id: string;
  subjectUserId: User["id"];
  statement: string;
  confidence: number;
}

export interface BeliefRevision {
  time: IsoUtcString;
  beliefId: Belief["id"];
  oldConfidence: number;
  newConfidence: number;
  trigger: string;
  explanation: string;
}

export interface GroupMember extends User {
  timezone: string;
}

export interface GroupPreference {
  id: string;
  groupId: string;
  userId: string | null;
  category: "activity" | "venue" | "time" | "budget" | "other";
  value: string;
  createdAt: IsoUtcString;
}

export type BeliefStatus = "active" | "revised" | "retired";
export interface StoredBelief extends Omit<Belief, "subjectUserId"> {
  groupId: string;
  subjectUserId: string | null;
  status: BeliefStatus;
  evidence: JsonValue[];
  updatedAt: IsoUtcString;
}

export interface CreateBeliefInput {
  groupId: string;
  subjectUserId?: string | null;
  statement: string;
  confidence: number;
  evidence: JsonValue[];
}

export interface StoredBeliefRevision extends BeliefRevision {
  proposalId: string | null;
}

export interface RecentRsvpEvidence extends RsvpEvent {
  threadId: string;
  proposalVersion: number;
  proposalTitle: string;
  slot: Proposal["slot"];
  /** Stored constraints for this proposal version and user, not inferred from this event. */
  constraints: StoredProposalConstraint[];
}

export interface AgentStep {
  kind: "tool_call" | "tool_result" | "final";
  name: string;
  payload: Record<string, unknown>;
}

export interface AppState {
  users: User[];
  busyBlocks: BusyBlock[];
  proposal: Proposal;
  beliefs: Belief[];
  revisions: BeliefRevision[];
}

export interface ScriptedAgentRun {
  scenario: string;
  steps: AgentStep[];
  beliefRevisions: BeliefRevision[];
  proposal: Proposal;
}
