import type { Proposal } from "../lib/types";
import type { ExtractedConstraint, ReplyRequest, ReplyResponse } from "../types/contracts";
import { collectAgentEvidence, createAgentToolHandlers, executeAgentTool } from "./handlers";
import { runGeminiAgent } from "./loop";
import { replyPrompt, suggestionPrompt } from "./prompts";
import { proposalResponseSchema, replyInterpretationSchema } from "./schemas";
import {
  createProposalVersion,
  areAllAttendeesAccepted,
  DEMO_GROUP_ID,
  DEMO_THREAD_ID,
  fixtureAgentContext,
  getProposal,
  recordDemoConstraint,
  recordDemoRsvp,
} from "../lib/agent/runtime";

interface ReplyInterpretation {
  response: "accepted" | "declined" | "commented";
  constraints: ExtractedConstraint[];
  summary: string;
}

interface ModelProposal {
  start: string;
  end: string;
  title: string;
  activity: string;
  reasoning: string;
  assumptions: string[];
}

function deterministicInterpretation(message: string): ReplyInterpretation {
  const text = message.toLowerCase();
  const recurring = /\b(always|every (?:week|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|usually|regularly)\b/.test(text);
  const scope: ExtractedConstraint["scope"] = recurring ? "recurring" : "proposal";
  const constraints: ExtractedConstraint[] = [];
  const after = text.match(/\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  const before = text.match(/\bbefore\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  const timeValue = (match: RegExpMatchArray) => {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    if (match[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
    if (match[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };
  if (after) constraints.push({ kind: "after_time", value: timeValue(after), scope, confidence: 0.8, evidence: message });
  if (before) constraints.push({ kind: "before_time", value: timeValue(before), scope, confidence: 0.8, evidence: message });
  if (/\bindoor\b/.test(text)) constraints.push({ kind: "venue", value: "indoor", scope, confidence: 0.78, evidence: message });
  if (/\b(outdoors?|outside)\b/.test(text)) constraints.push({ kind: "venue", value: "outdoor", scope, confidence: 0.78, evidence: message });
  if (/\b(can't|cannot|won't|working|shift|busy|unavailable)\b/.test(text)) {
    constraints.push({ kind: "unavailable", value: message, scope, confidence: 0.72, evidence: message });
  }
  if (/\b(yes|accept(?:ed)?|sounds good|count me in|i'm in)\b/.test(text) && constraints.length === 0) {
    return { response: "accepted", constraints: [], summary: "The reply accepts the proposal." };
  }
  if (/\b(no|decline|can't make|cannot make|won't make)\b/.test(text) && constraints.length === 0) {
    return { response: "declined", constraints: [], summary: "The reply declines the proposal." };
  }
  return { response: constraints.length ? "commented" : "commented", constraints, summary: "Recorded the reply for this proposal." };
}

function normalizeInterpretation(value: unknown, message: string): ReplyInterpretation {
  if (!value || typeof value !== "object") return deterministicInterpretation(message);
  const parsed = value as Partial<ReplyInterpretation>;
  const validResponse = parsed.response === "accepted" || parsed.response === "declined" || parsed.response === "commented";
  if (!validResponse || !Array.isArray(parsed.constraints)) return deterministicInterpretation(message);
  const explicitlyRecurring = /\b(always|every (?:week|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|usually|regularly)\b/i.test(message);
  const constraints: ExtractedConstraint[] = parsed.constraints.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const constraint = item as Partial<ExtractedConstraint>;
    const kinds: ExtractedConstraint["kind"][] = ["after_time", "before_time", "unavailable", "activity", "venue", "other"];
    if (!kinds.includes(constraint.kind as ExtractedConstraint["kind"]) || typeof constraint.value !== "string") return [];
    const confidence = typeof constraint.confidence === "number" && Number.isFinite(constraint.confidence)
      ? Math.min(1, Math.max(0, constraint.confidence))
      : 0.5;
    const requestedScope = constraint.scope === "recurring" && explicitlyRecurring ? "recurring" : "proposal";
    return [{
      kind: constraint.kind as ExtractedConstraint["kind"],
      value: constraint.value.trim(),
      scope: requestedScope,
      confidence,
      evidence: message,
    }];
  });
  return {
    response: parsed.response as ReplyInterpretation["response"],
    constraints,
    summary: typeof parsed.summary === "string" ? parsed.summary : "Recorded the reply.",
  };
}

function londonTime(iso: string): { date: string; day: string; minute: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, day: get("weekday").toLowerCase(), hour, minute: hour * 60 + minute };
}

function slotMatchesUnavailable(value: string, slotStart: string): boolean {
  const valueLower = value.toLowerCase();
  const local = londonTime(slotStart);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const explicitDate = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (explicitDate && local.date !== explicitDate) return false;
  const namedDay = days.find((day) => new RegExp(`\\b${day}\\b`).test(valueLower));
  if (namedDay && local.day !== namedDay) return false;
  if (/\bmorning\b/.test(valueLower)) return local.hour >= 6 && local.hour < 12;
  if (/\bafternoon\b/.test(valueLower)) return local.hour >= 12 && local.hour < 17;
  if (/\bevening|night\b/.test(valueLower)) return local.hour >= 17;
  return Boolean(explicitDate || namedDay);
}

function getTimeValue(constraints: ExtractedConstraint[], kind: "after_time" | "before_time"): number | undefined {
  const value = constraints.find((item) => item.kind === kind && item.scope === "proposal")?.value;
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

function chooseFallback(
  candidates: Array<{ start: string; end: string; freeUserIds: string[] }>,
  constraints: ExtractedConstraint[],
): ModelProposal {
  const slot = candidates[0];
  if (!slot) throw new Error("No candidate slots satisfy the reply constraints.");
  const venue = constraints.find((item) => item.kind === "venue")?.value;
  const indoors = venue?.toLowerCase().includes("indoor");
  const activity = indoors ? "an indoor cafe catch-up" : "a relaxed group catch-up";
  return {
    start: slot.start,
    end: slot.end,
    title: indoors ? "Indoor cafe catch-up" : "A relaxed group catch-up",
    activity,
    reasoning: "This revision uses a deterministic slot that satisfies the recorded proposal constraints.",
    assumptions: ["Calendar availability indicates no recorded conflict; attendees still need to confirm."],
  };
}

function validateModelProposal(
  value: unknown,
  candidates: Array<{ start: string; end: string; freeUserIds: string[] }>,
): ModelProposal {
  if (!value || typeof value !== "object") throw new Error("Gemini did not return a proposal object.");
  const proposal = value as Partial<ModelProposal>;
  if (
    typeof proposal.start !== "string" || typeof proposal.end !== "string" ||
    typeof proposal.title !== "string" || typeof proposal.activity !== "string" ||
    typeof proposal.reasoning !== "string" || !Array.isArray(proposal.assumptions)
  ) throw new Error("Gemini proposal has an invalid shape.");
  if (!candidates.some((slot) => slot.start === proposal.start && slot.end === proposal.end)) {
    throw new Error("Gemini selected a slot outside the deterministic valid slot list.");
  }
  return proposal as ModelProposal;
}

export async function processReply(input: ReplyRequest): Promise<ReplyResponse> {
  const threadId = input.threadId ?? DEMO_THREAD_ID;
  const previousProposal = getProposal(threadId);
  if (input.proposalVersion !== previousProposal.version) {
    throw new Error(`Stale proposal version. Current version is ${previousProposal.version}.`);
  }
  const message = input.message.trim();
  if (!message || message.length > 2000) throw new Error("Reply message must contain 1 to 2000 characters.");
  if (!previousProposal.attendees.includes(input.userId)) throw new Error("Only proposal attendees can reply.");
  const user = (await fixtureAgentContext.getUsers([input.userId]))[0];
  if (!user) throw new Error("Unknown demo user.");

  const handlers = createAgentToolHandlers(fixtureAgentContext);
  const interpretationResult = await runGeminiAgent<ReplyInterpretation>({
    prompt: replyPrompt({ groupId: DEMO_GROUP_ID, proposal: previousProposal, userName: user.name, message }),
    responseSchema: replyInterpretationSchema,
    executeTool: (name, args) => executeAgentTool(handlers, name, args),
    fallback: () => deterministicInterpretation(message),
  });
  const interpretation = normalizeInterpretation(interpretationResult.value, message);
  const receivedAt = input.receivedAt && Number.isFinite(Date.parse(input.receivedAt))
    ? new Date(input.receivedAt).toISOString()
    : new Date().toISOString();
  const searchEnd = new Date(Date.parse(previousProposal.slot.start) + 7 * 86_400_000).toISOString();
  const evidence = await collectAgentEvidence(fixtureAgentContext, {
    groupId: DEMO_GROUP_ID,
    userIds: previousProposal.attendees,
    startIso: previousProposal.slot.start,
    endIso: searchEnd,
    durationMinutes: Math.round((Date.parse(previousProposal.slot.end) - Date.parse(previousProposal.slot.start)) / 60_000),
    threadId,
    topic: "availability",
  });
  const constraints = interpretation.constraints;
  const after = getTimeValue(constraints, "after_time");
  const before = getTimeValue(constraints, "before_time");
  const relevantConstraints = constraints.filter((constraint) => constraint.scope === "proposal");
  const candidates = evidence.candidates.filter((slot) => {
    const local = londonTime(slot.start);
    if (after !== undefined && local.minute < after) return false;
    if (before !== undefined && local.minute > before) return false;
    if (relevantConstraints.some((constraint) => constraint.kind === "unavailable" && slotMatchesUnavailable(constraint.value, slot.start))) return false;
    return true;
  });
  if (!candidates.length && (after !== undefined || before !== undefined || relevantConstraints.some((item) => item.kind === "unavailable"))) {
    throw new Error("No shared candidate slots satisfy the new scheduling constraint.");
  }

  let revised = previousProposal;
  let usedFallback = interpretationResult.usedFallback;
  if (candidates.length && relevantConstraints.length) {
    const narrowedEvidence = { ...evidence, candidates };
    const revisionPrompt = `${suggestionPrompt({
      groupId: DEMO_GROUP_ID,
      userIds: previousProposal.attendees,
      startIso: previousProposal.slot.start,
      endIso: searchEnd,
      durationMinutes: Math.round((Date.parse(previousProposal.slot.end) - Date.parse(previousProposal.slot.start)) / 60_000),
    })}\nRevise the existing proposal only as needed. Existing proposal: ${JSON.stringify(previousProposal)}\nNew constraints: ${JSON.stringify(relevantConstraints)}\nEvidence (candidate list has already been filtered against time constraints): ${JSON.stringify(narrowedEvidence)}`;
    const revision = await runGeminiAgent<ModelProposal>({
      prompt: revisionPrompt,
      responseSchema: proposalResponseSchema,
      executeTool: (name, args) => executeAgentTool(handlers, name, args),
      fallback: () => chooseFallback(candidates, relevantConstraints),
    });
    usedFallback ||= revision.usedFallback;
    let chosen: ModelProposal;
    try {
      chosen = revision.usedFallback ? revision.value : validateModelProposal(revision.value, candidates);
    } catch {
      chosen = chooseFallback(candidates, relevantConstraints);
      usedFallback = true;
    }
    const changed = chosen.start !== previousProposal.slot.start || chosen.end !== previousProposal.slot.end || chosen.title !== previousProposal.title;
    if (changed) {
      const proposal: Proposal = createProposalVersion(threadId, {
        slot: { start: chosen.start, end: chosen.end },
        title: chosen.title,
        attendees: previousProposal.attendees,
        assumptions: chosen.assumptions,
        reasoning: chosen.reasoning,
        version: 0,
      });
      revised = proposal;
    }
  }

  const rsvp = recordDemoRsvp({
    threadId,
    proposalVersion: previousProposal.version,
    userId: input.userId,
    response: interpretation.response,
    message,
    receivedAt,
  });
  for (const constraint of interpretation.constraints) {
    recordDemoConstraint(threadId, input.userId, constraint);
  }

  return {
    rsvp,
    constraints,
    proposal: revised,
    previousProposal,
    explanation: revised.version === previousProposal.version
      ? interpretation.summary
      : `${interpretation.summary} Updated the proposal to ${revised.title} because of the new constraint.`,
    evidence: { ...evidence, candidates, rsvps: [...evidence.rsvps, rsvp] },
    usedFallback,
    readyForConfirmation: areAllAttendeesAccepted(threadId, revised.version, revised.attendees),
  };
}
