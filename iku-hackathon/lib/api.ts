import {
  initialAppState,
  ishaDeclinesRun,
  revisedAppState,
} from "./fixtures";
import type {
  AgentStep,
  AppState,
  Proposal,
  User,
} from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

let mockState: AppState = structuredClone(initialAppState);

export interface AgentEvent {
  type: "rsvp";
  proposalVersion: number;
  userId: User["id"];
  response: "accepted" | "declined";
  message: string;
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function getState(): Promise<AppState> {
  if (USE_MOCK) {
    return structuredClone(mockState);
  }

  // Real API call: GET /api/state.
  const response = await fetch("/api/state");
  if (!response.ok) {
    throw new Error(`Could not load app state (${response.status})`);
  }

  return response.json();
}

export async function startPlan(): Promise<Proposal> {
  if (USE_MOCK) {
    return structuredClone(mockState.proposal);
  }

  // Real API call: POST /api/agent/plan.
  const response = await fetch("/api/agent/plan", { method: "POST" });
  if (!response.ok) {
    throw new Error(`Could not start a plan (${response.status})`);
  }

  return response.json();
}

export function sendEvent(event: AgentEvent): AsyncGenerator<AgentStep> {
  if (USE_MOCK) {
    if (
      event.userId !== "isha" ||
      event.proposalVersion !== mockState.proposal.version ||
      event.response !== "declined" ||
      !event.message.toLowerCase().includes("shift")
    ) {
      throw new Error("This event is not covered by the mock agent scenario.");
    }

    return streamMockEvent();
  }

  // Real API call: POST /api/agent/events, returning newline-delimited AgentSteps.
  return streamResponse("/api/agent/events", event);
}

export async function* streamAgentSteps(
  steps: readonly AgentStep[],
): AsyncGenerator<AgentStep> {
  for (let index = 0; index < steps.length; index += 1) {
    if (index > 0) {
      await delay(400 + Math.floor(Math.random() * 801));
    }

    yield structuredClone(steps[index]);
  }
}

async function* streamMockEvent(): AsyncGenerator<AgentStep> {
  for await (const step of streamAgentSteps(ishaDeclinesRun.steps)) {
    if (step.kind === "final") {
      mockState = structuredClone(revisedAppState);
    }

    yield step;
  }
}

async function* streamResponse(
  url: string,
  body: AgentEvent,
): AsyncGenerator<AgentStep> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Agent request failed (${response.status})`);
  }
  if (!response.body) {
    throw new Error("Agent response did not include a readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });

      let newlineIndex = pending.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = pending.slice(0, newlineIndex).trim();
        pending = pending.slice(newlineIndex + 1);
        if (line) {
          yield parseAgentStep(line);
        }
        newlineIndex = pending.indexOf("\n");
      }

      if (done) {
        break;
      }
    }

    if (pending.trim()) {
      yield parseAgentStep(pending.trim());
    }
  } finally {
    reader.releaseLock();
  }
}

function parseAgentStep(line: string): AgentStep {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("Agent stream contained invalid JSON.");
  }

  if (
    !isRecord(value) ||
    !("kind" in value) ||
    (value.kind !== "tool_call" &&
      value.kind !== "tool_result" &&
      value.kind !== "final") ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !("payload" in value) ||
    !isRecord(value.payload)
  ) {
    throw new Error("Agent stream contained a malformed step.");
  }

  return {
    kind: value.kind,
    name: value.name,
    payload: value.payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
