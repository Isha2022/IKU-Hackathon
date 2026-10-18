import { Type, type Schema } from "@google/genai";

export const proposalResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    start: { type: Type.STRING, description: "Chosen candidate start timestamp in ISO 8601 UTC." },
    end: { type: Type.STRING, description: "Chosen candidate end timestamp in ISO 8601 UTC." },
    title: { type: Type.STRING },
    activity: { type: Type.STRING },
    reasoning: { type: Type.STRING },
    assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["start", "end", "title", "activity", "reasoning", "assumptions"],
};

export const replyInterpretationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    response: { type: Type.STRING, enum: ["accepted", "declined", "commented"] },
    constraints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: ["after_time", "before_time", "unavailable", "activity", "venue", "other"],
          },
          value: { type: Type.STRING },
          scope: { type: Type.STRING, enum: ["proposal", "recurring"] },
          confidence: { type: Type.NUMBER, minimum: 0, maximum: 1 },
          evidence: { type: Type.STRING },
        },
        required: ["kind", "value", "scope", "confidence", "evidence"],
      },
    },
    summary: { type: Type.STRING },
  },
  required: ["response", "constraints", "summary"],
};
