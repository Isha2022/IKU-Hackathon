import "server-only";
import { getGroupMembers, getGroupPreferences, getBeliefs } from "../../db/context";
import { getBusyBlocks } from "../../db/queries";
import { getLatestProposal, getRsvpHistory } from "../../db/proposals";
import type { AgentToolContext } from "../../agent/handlers";
import type { Belief, BusyBlock, User } from "../types";
import type { PreferenceEvidence, RsvpRecord } from "../../types/contracts";

export const DEMO_GROUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const databaseAgentContext: AgentToolContext = {
  async getUsers(ids) {
    return (await getGroupMembers(DEMO_GROUP_ID)).filter((member) => ids.includes(member.id));
  },
  async getBusyBlocks(ids, start, end) {
    return getBusyBlocks(ids, start, end) as Promise<BusyBlock[]>;
  },
  async getGroupPreferences(groupId) {
    return (await getGroupPreferences(groupId)).map((preference) => ({
      userId: preference.userId ?? undefined,
      kind: preference.category === "time" ? "timing" : preference.category === "venue" ? "venue" : "activity",
      value: preference.value,
      evidence: "Stored group preference",
    })) as PreferenceEvidence[];
  },
  async getRsvpHistory(threadId) {
    const proposal = await getLatestProposal(threadId);
    if (!proposal) return [];
    const events = await getRsvpHistory(proposal.id);
    return events.map((event, index) => ({
      id: `${event.proposalId}-${event.userId}-${index}`,
      threadId,
      proposalVersion: proposal.version,
      userId: event.userId,
      response: event.response === "yes" ? "accepted" : event.response === "no" ? "declined" : "commented",
      message: event.reason ?? undefined,
      receivedAt: event.time,
    })) as RsvpRecord[];
  },
  async getRelevantBeliefs(groupId, topic) {
    const all = await getBeliefs(groupId);
    return all
      .filter((belief) => !topic || `${belief.statement} ${belief.subjectUserId ?? ""}`.toLowerCase().includes(topic.toLowerCase()))
      .map((belief) => ({
        id: belief.id,
        subjectUserId: belief.subjectUserId ?? "",
        statement: belief.statement,
        confidence: belief.confidence,
        evidence: JSON.stringify(belief.evidence),
      })) as Array<Belief & { evidence?: string }>;
  },
};

export async function getDatabaseGroupData(start: string, end: string) {
  const [members, preferences, beliefs] = await Promise.all([
    getGroupMembers(DEMO_GROUP_ID),
    getGroupPreferences(DEMO_GROUP_ID),
    getBeliefs(DEMO_GROUP_ID),
  ]);
  members.sort((left, right) => left.name === "You" ? -1 : right.name === "You" ? 1 : left.name.localeCompare(right.name));
  const busyBlocks = await getBusyBlocks(members.map(({ id }) => id), start, end);
  return { members, preferences, beliefs, busyBlocks };
}
