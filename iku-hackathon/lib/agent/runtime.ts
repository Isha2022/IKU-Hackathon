import { beliefs, busyBlocks, initialProposal, users } from "../fixtures";
import type { Proposal } from "../types";
import type { AgentToolContext } from "../../agent/handlers";
import type { ExtractedConstraint, PreferenceEvidence, RsvpRecord } from "../../types/contracts";

export const DEMO_GROUP_ID = "demo-group";
export const DEMO_THREAD_ID = "demo-thread";

interface DemoState {
  proposals: Map<string, Proposal[]>;
  rsvps: RsvpRecord[];
  proposalConstraints: Map<string, Array<{ userId: string; constraint: ExtractedConstraint }>>;
  recurringPreferences: PreferenceEvidence[];
}

const globalState = globalThis as typeof globalThis & { __ikuAgentDemoState?: DemoState };
const state: DemoState = (globalState.__ikuAgentDemoState ??= {
  proposals: new Map<string, Proposal[]>([[DEMO_THREAD_ID, [{ ...initialProposal, attendees: [...initialProposal.attendees] }]]]),
  rsvps: [] as RsvpRecord[],
  proposalConstraints: new Map<string, Array<{ userId: string; constraint: ExtractedConstraint }>>(),
  recurringPreferences: [] as PreferenceEvidence[],
});

export const fixtureAgentContext: AgentToolContext = {
  async getUsers(ids) {
    return users.filter((user) => ids.includes(user.id));
  },
  async getBusyBlocks(ids, startIso, endIso) {
    const from = Date.parse(startIso);
    const to = Date.parse(endIso);
    return busyBlocks.filter(
      (block) => ids.includes(block.userId) && Date.parse(block.start) < to && Date.parse(block.end) > from,
    );
  },
  async getGroupPreferences(groupId) {
    if (groupId !== DEMO_GROUP_ID) return [];
    return [
      { kind: "activity", value: "Prefer a relaxed, low-cost catch-up." },
      { kind: "venue", value: "Central London is convenient for the group." },
      ...state.recurringPreferences,
    ] satisfies PreferenceEvidence[];
  },
  async getRsvpHistory(threadId) {
    return state.rsvps.filter((rsvp) => rsvp.threadId === threadId);
  },
  async getRelevantBeliefs(groupId, topic) {
    if (groupId !== DEMO_GROUP_ID) return [];
    const selected = topic
      ? beliefs.filter((belief) => `${belief.statement} ${belief.subjectUserId}`.toLowerCase().includes(topic.toLowerCase()))
      : beliefs;
    return selected.map((belief) => ({ ...belief, evidence: "Seeded free/busy and demo preference evidence." }));
  },
};

export function getProposal(threadId = DEMO_THREAD_ID): Proposal {
  const versions = state.proposals.get(threadId);
  if (!versions?.length) throw new Error(`Unknown proposal thread: ${threadId}`);
  return versions.at(-1)!;
}

export function startProposalThread(threadId: string): void {
  if (!state.proposals.has(threadId)) state.proposals.set(threadId, []);
}

export function getProposalVersion(threadId: string, version: number): Proposal | undefined {
  return state.proposals.get(threadId)?.find((proposal) => proposal.version === version);
}

export function createProposalVersion(threadId: string, proposal: Proposal): Proposal {
  const versions = state.proposals.get(threadId);
  if (!versions) throw new Error(`Unknown proposal thread: ${threadId}`);
  const latest = versions.at(-1);
  const versioned = { ...proposal, version: (latest?.version ?? 0) + 1, attendees: [...proposal.attendees] };
  versions.push(versioned);
  return versioned;
}

export function recordDemoRsvp(input: Omit<RsvpRecord, "id">): RsvpRecord {
  const record: RsvpRecord = { ...input, id: `rsvp-${state.rsvps.length + 1}` };
  state.rsvps.push(record);
  return record;
}

export function areAllAttendeesAccepted(threadId: string, version: number, attendeeIds: string[]): boolean {
  if (!attendeeIds.length) return false;
  const responses = state.rsvps.filter((rsvp) => rsvp.threadId === threadId && rsvp.proposalVersion === version);
  return attendeeIds.every((userId) => {
    const latest = responses.filter((rsvp) => rsvp.userId === userId).at(-1);
    return latest?.response === "accepted";
  });
}

export function recordDemoConstraint(threadId: string, userId: string, constraint: ExtractedConstraint): void {
  const existing = state.proposalConstraints.get(threadId) ?? [];
  state.proposalConstraints.set(threadId, [...existing, { userId, constraint }]);
  if (constraint.scope === "recurring") {
    const kind: PreferenceEvidence["kind"] = constraint.kind === "venue"
      ? "venue"
      : constraint.kind === "activity"
        ? "activity"
        : "timing";
    state.recurringPreferences.push({ userId, kind, value: constraint.value, evidence: constraint.evidence });
  }
}
