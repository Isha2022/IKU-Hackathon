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
