import { Type } from "@google/genai";

/** Read-only functions Gemini may call. Application code owns every write. */
export const agentTools = [
  {
    name: "get_candidate_slots",
    description:
      "Find valid shared free slots for selected users using deterministic calendar overlap checks. Empty calendars mean no recorded conflict, not guaranteed availability.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        startIso: { type: Type.STRING, description: "Inclusive ISO 8601 timestamp with timezone." },
        endIso: { type: Type.STRING, description: "Exclusive ISO 8601 timestamp with timezone." },
        durationMinutes: { type: Type.INTEGER, minimum: 15 },
        stepMinutes: { type: Type.INTEGER, minimum: 5 },
      },
      required: ["userIds", "startIso", "endIso", "durationMinutes"],
    },
  },
  {
    name: "get_group_preferences",
    description: "Retrieve activity, timing, and venue preferences for a group.",
    parameters: {
      type: Type.OBJECT,
      properties: { groupId: { type: Type.STRING } },
      required: ["groupId"],
    },
  },
  {
    name: "get_rsvp_history",
    description: "Read RSVP responses and replies for a proposal thread.",
    parameters: {
      type: Type.OBJECT,
      properties: { threadId: { type: Type.STRING } },
      required: ["threadId"],
    },
  },
  {
    name: "get_relevant_beliefs",
    description: "Read current beliefs and evidence relevant to a group's plan.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        groupId: { type: Type.STRING },
        topic: { type: Type.STRING },
      },
      required: ["groupId"],
    },
  },
];

export const geminiTools = [{ functionDeclarations: [...agentTools] }];
export type AgentToolName = (typeof agentTools)[number]["name"];

