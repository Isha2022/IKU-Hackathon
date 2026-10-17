import type { AgentEvidence, CandidateSlot, PreferenceEvidence, RsvpRecord } from "../types/contracts";
import type { Belief, BusyBlock, User } from "../lib/types";

export interface AgentToolContext {
  getUsers(userIds: string[]): Promise<User[]>;
  getBusyBlocks(userIds: string[], startIso: string, endIso: string): Promise<BusyBlock[]>;
  getGroupPreferences(groupId: string): Promise<PreferenceEvidence[]>;
  getRsvpHistory(threadId: string): Promise<RsvpRecord[]>;
  getRelevantBeliefs(groupId: string, topic?: string): Promise<Array<Belief & { evidence?: string }>>;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid tool arguments: ${key} must be a non-empty string.`);
  }
  return value.trim();
}

function isoMillis(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    throw new Error(`Invalid tool arguments: ${field} must include a timezone offset.`);
  }
  return parsed;
}

function parseUserIds(args: Record<string, unknown>): string[] {
  if (!Array.isArray(args.userIds) || args.userIds.length === 0 || args.userIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("Invalid tool arguments: userIds must be a non-empty array of IDs.");
  }
  return [...new Set(args.userIds.map((id: string) => id.trim()))];
}

export async function getCandidateSlots(
  context: AgentToolContext,
  args: Record<string, unknown>,
): Promise<CandidateSlot[]> {
  const ids = parseUserIds(args);
  const startIso = requiredString(args, "startIso");
  const endIso = requiredString(args, "endIso");
  const startMs = isoMillis(startIso, "startIso");
  const endMs = isoMillis(endIso, "endIso");
  const duration = args.durationMinutes;
  const step = args.stepMinutes ?? 30;
  if (!Number.isInteger(duration) || (duration as number) < 15 || !Number.isInteger(step) || (step as number) < 5) {
    throw new Error("Invalid tool arguments: durationMinutes must be >= 15 and stepMinutes >= 5.");
  }
  if (endMs <= startMs) throw new Error("Invalid tool arguments: endIso must be after startIso.");

  const [users, blocks] = await Promise.all([
    context.getUsers(ids),
    context.getBusyBlocks(ids, new Date(startMs).toISOString(), new Date(endMs).toISOString()),
  ]);
  const found = new Set(users.map((user) => user.id));
  if (ids.some((id) => !found.has(id))) throw new Error("One or more users are not members of this group.");

  const durationMs = (duration as number) * 60_000;
  const stepMs = (step as number) * 60_000;
  const slots: CandidateSlot[] = [];
  for (let start = startMs; start + durationMs <= endMs; start += stepMs) {
    const end = start + durationMs;
    const freeUserIds = ids.filter(
      (id) => !blocks.some((block) => block.userId === id && Date.parse(block.start) < end && Date.parse(block.end) > start),
    );
    if (freeUserIds.length === ids.length) {
      slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), freeUserIds });
    }
  }
  return slots;
}

export function createAgentToolHandlers(context: AgentToolContext) {
  return {
    get_candidate_slots: (args: Record<string, unknown>) => getCandidateSlots(context, args),
    get_group_preferences: (args: Record<string, unknown>) => context.getGroupPreferences(requiredString(args, "groupId")),
    get_rsvp_history: (args: Record<string, unknown>) => context.getRsvpHistory(requiredString(args, "threadId")),
    get_relevant_beliefs: (args: Record<string, unknown>) => {
      const groupId = requiredString(args, "groupId");
      const topic = typeof args.topic === "string" ? args.topic.trim() : undefined;
      return context.getRelevantBeliefs(groupId, topic || undefined);
    },
  };
}

export async function executeAgentTool(
  handlers: ReturnType<typeof createAgentToolHandlers>,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handler = handlers[name as keyof typeof handlers];
  if (!handler) throw new Error(`Unknown read-only agent tool: ${name}`);
  return handler(args);
}

export async function collectAgentEvidence(
  context: AgentToolContext,
  input: { groupId: string; userIds: string[]; startIso: string; endIso: string; durationMinutes: number; threadId?: string; topic?: string },
): Promise<AgentEvidence> {
  const handlers = createAgentToolHandlers(context);
  const [users, candidates, preferences, beliefs, rsvps] = await Promise.all([
    context.getUsers(input.userIds),
    handlers.get_candidate_slots({
      userIds: input.userIds,
      startIso: input.startIso,
      endIso: input.endIso,
      durationMinutes: input.durationMinutes,
    }),
    handlers.get_group_preferences({ groupId: input.groupId }),
    handlers.get_relevant_beliefs({ groupId: input.groupId, topic: input.topic }),
    input.threadId ? handlers.get_rsvp_history({ threadId: input.threadId }) : Promise.resolve([]),
  ]);
  return { users, candidates, preferences, beliefs, rsvps };
}
