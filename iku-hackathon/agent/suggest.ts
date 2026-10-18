import type { AgentToolContext } from "./handlers";
import type { SuggestRequest, SuggestResponse } from "../types/contracts";
import { collectAgentEvidence, createAgentToolHandlers, executeAgentTool } from "./handlers";
import { runGeminiAgent } from "./loop";
import { suggestionPrompt } from "./prompts";
import { proposalResponseSchema } from "./schemas";
import { createProposal } from "../db/proposals";
import { DEMO_GROUP_ID, databaseAgentContext } from "../lib/agent/database-context";

interface ModelProposal {
  start: string;
  end: string;
  title: string;
  activity: string;
  reasoning: string;
  assumptions: string[];
}

const DEFAULT_USERS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
const DEFAULT_START = "2026-10-23T08:00:00Z";
const DEFAULT_END = "2026-10-26T08:00:00Z";

function validateModelProposal(value: unknown, candidates: SuggestResponse["evidence"]["candidates"]): ModelProposal {
  if (!value || typeof value !== "object") throw new Error("Gemini did not return a proposal object.");
  const result = value as Partial<ModelProposal>;
  if (
    typeof result.start !== "string" ||
    typeof result.end !== "string" ||
    typeof result.title !== "string" ||
    typeof result.activity !== "string" ||
    typeof result.reasoning !== "string" ||
    !Array.isArray(result.assumptions) ||
    result.assumptions.some((item) => typeof item !== "string")
  ) {
    throw new Error("Gemini proposal has an invalid shape.");
  }
  const candidate = candidates.find((slot) => slot.start === result.start && slot.end === result.end);
  if (!candidate) throw new Error("Gemini selected a time outside the deterministic candidate slots.");
  return result as ModelProposal;
}

function deterministicFallback(candidates: SuggestResponse["evidence"]["candidates"]): ModelProposal {
  const slot = candidates[0];
  if (!slot) throw new Error("No shared free slots were found for the selected users.");
  return {
    start: slot.start,
    end: slot.end,
    title: "A relaxed group catch-up",
    activity: "low-cost dinner and a catch-up",
    reasoning: "This is a candidate slot with no recorded free/busy conflicts for the selected attendees.",
    assumptions: ["Clear calendar time is not a guarantee that everyone is available."],
  };
}

export async function suggestHangout(input: SuggestRequest = {}): Promise<SuggestResponse> {
  const userIds = input.userIds?.length ? [...new Set(input.userIds)] : DEFAULT_USERS;
  const startIso = input.startIso ?? DEFAULT_START;
  const endIso = input.endIso ?? DEFAULT_END;
  const durationMinutes = input.durationMinutes ?? 150;
  const groupId = input.groupId ?? DEMO_GROUP_ID;
  if (groupId !== DEMO_GROUP_ID) throw new Error("Unknown group.");
  const personalBusyBlocks = input.busyBlocks ?? [];
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) {
    throw new Error("durationMinutes must be an integer between 15 and 720.");
  }
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("startIso and endIso must be valid timestamps, and endIso must be after startIso.");
  }
  if ((end - start) / 86_400_000 > 31) throw new Error("Search window cannot exceed 31 days.");

  if (personalBusyBlocks.length > 500) throw new Error("At most 500 additional busy blocks can be submitted.");
  for (const block of personalBusyBlocks) {
    const blockStart = Date.parse(block.start);
    const blockEnd = Date.parse(block.end);
    if (
      !userIds.includes(block.userId) ||
      !Number.isFinite(blockStart) ||
      !Number.isFinite(blockEnd) ||
      blockEnd <= blockStart ||
      !/(Z|[+-]\d{2}:?\d{2})$/i.test(block.start) ||
      !/(Z|[+-]\d{2}:?\d{2})$/i.test(block.end)
    ) {
      throw new Error("Each additional busy block must have a selected user and valid timezone-aware start/end times.");
    }
  }

  const context: AgentToolContext = {
    ...databaseAgentContext,
    async getBusyBlocks(ids, rangeStart, rangeEnd) {
      const storedBlocks = await databaseAgentContext.getBusyBlocks(ids, rangeStart, rangeEnd);
      const rangeStartMs = Date.parse(rangeStart);
      const rangeEndMs = Date.parse(rangeEnd);
      const additional = personalBusyBlocks
        .filter((block) => ids.includes(block.userId) && Date.parse(block.start) < rangeEndMs && Date.parse(block.end) > rangeStartMs)
        .map((block, index) => ({
          id: `client-busy-${index}`,
          userId: block.userId,
          start: new Date(block.start).toISOString(),
          end: new Date(block.end).toISOString(),
        }));
      return [...storedBlocks, ...additional];
    },
  };

  const evidence = await collectAgentEvidence(context, {
    groupId,
    userIds,
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
    durationMinutes,
  });
  if (!evidence.users.length || evidence.users.length !== userIds.length) {
    throw new Error("Select valid users from the demo group.");
  }
  if (!evidence.candidates.length) throw new Error("No shared free slots were found for the selected users.");

  const handlers = createAgentToolHandlers(context);
  const prompt = `${suggestionPrompt({ groupId, userIds, startIso, endIso, durationMinutes })}\nEvidence already retrieved by the application:\n${JSON.stringify(evidence)}`;
  const result = await runGeminiAgent<ModelProposal>({
    prompt,
    responseSchema: proposalResponseSchema,
    executeTool: (name, args) => executeAgentTool(handlers, name, args),
    fallback: () => deterministicFallback(evidence.candidates),
  });

  let chosen: ModelProposal;
  try {
    chosen = result.usedFallback ? result.value : validateModelProposal(result.value, evidence.candidates);
  } catch {
    chosen = deterministicFallback(evidence.candidates);
    result.usedFallback = true;
  }
  const proposal = await createProposal({
    groupId,
    slot: { start: chosen.start, end: chosen.end },
    title: chosen.title.trim() || chosen.activity,
    attendees: userIds,
    assumptions: chosen.assumptions,
    reasoning: chosen.reasoning,
    activityType: chosen.activity,
  });
  return { threadId: proposal.threadId, proposal, evidence, usedFallback: result.usedFallback };
}
