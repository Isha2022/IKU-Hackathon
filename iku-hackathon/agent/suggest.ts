import type { Proposal } from "../lib/types";
import type { SuggestRequest, SuggestResponse } from "../types/contracts";
import { collectAgentEvidence, createAgentToolHandlers, executeAgentTool } from "./handlers";
import { runGeminiAgent } from "./loop";
import { suggestionPrompt } from "./prompts";
import { proposalResponseSchema } from "./schemas";
import {
  createProposalVersion,
  DEMO_GROUP_ID,
  fixtureAgentContext,
  startProposalThread,
} from "../lib/agent/runtime";
import { initialProposal } from "../lib/fixtures";

interface ModelProposal {
  start: string;
  end: string;
  title: string;
  activity: string;
  reasoning: string;
  assumptions: string[];
}

const DEFAULT_USERS = ["yonna", "isha", "agrima"];
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
  const preferred = candidates.find(
    (slot) => slot.start === initialProposal.slot.start && slot.end === initialProposal.slot.end,
  );
  const slot = preferred ?? candidates[0];
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
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) {
    throw new Error("durationMinutes must be an integer between 15 and 720.");
  }
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("startIso and endIso must be valid timestamps, and endIso must be after startIso.");
  }
  if ((end - start) / 86_400_000 > 31) throw new Error("Search window cannot exceed 31 days.");

  const evidence = await collectAgentEvidence(fixtureAgentContext, {
    groupId,
    userIds,
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
    durationMinutes,
    topic: "availability",
  });
  if (!evidence.users.length || evidence.users.length !== userIds.length) {
    throw new Error("Select valid users from the demo group.");
  }
  if (!evidence.candidates.length) throw new Error("No shared free slots were found for the selected users.");

  const handlers = createAgentToolHandlers(fixtureAgentContext);
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
  const threadId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  startProposalThread(threadId);
  const proposal: Proposal = createProposalVersion(threadId, {
    slot: { start: chosen.start, end: chosen.end },
    title: chosen.title.trim() || chosen.activity,
    attendees: userIds,
    assumptions: chosen.assumptions,
    reasoning: chosen.reasoning,
    version: 0,
  });
  return { threadId, proposal, evidence, usedFallback: result.usedFallback };
}
