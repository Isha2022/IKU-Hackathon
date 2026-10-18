import {
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type Schema,
} from "@google/genai";
import { agentSystemPrompt } from "./prompts";
import { agentTools } from "./tools";

export interface ToolExecutor {
  (name: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface AgentRunResult<T> {
  value: T;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
}

const MAX_TOOL_ROUNDS = 4;

function parseJson(text: string | undefined): unknown {
  if (!text) throw new Error("Gemini returned no structured response.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced) as unknown;
    throw new Error("Gemini returned invalid JSON.");
  }
}

export async function runGeminiAgent<T>(input: {
  prompt: string;
  responseSchema: Schema;
  executeTool: ToolExecutor;
  fallback: () => T;
}): Promise<AgentRunResult<T> & { usedFallback: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return { value: input.fallback(), toolCalls: [], usedFallback: true };

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const contents: Content[] = [
    { role: "user", parts: [{ text: input.prompt }] },
  ];
  const trace: AgentRunResult<T>["toolCalls"] = [];
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: agentSystemPrompt,
          tools: [
            {
              functionDeclarations:
                agentTools as unknown as FunctionDeclaration[],
            },
          ],
          responseMimeType: "application/json",
          responseSchema: input.responseSchema,
        },
      });
      const calls = response.functionCalls ?? [];
      if (calls.length === 0) {
        return {
          value: parseJson(response.text) as T,
          toolCalls: trace,
          usedFallback: false,
        };
      }
      if (round === MAX_TOOL_ROUNDS)
        throw new Error("Gemini exceeded the tool-call limit.");

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);
      const responses: NonNullable<Content["parts"]> = [];
      for (const call of calls) {
        const name = call.name;
        if (!name)
          throw new Error("Gemini returned a tool call without a name.");
        const args = (call.args ?? {}) as Record<string, unknown>;
        const result = await input.executeTool(name, args);
        trace.push({ name, args, result });
        responses.push({ functionResponse: { name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    throw new Error("Gemini did not finish within the tool-call limit.");
  } catch (error) {
    console.error(
      "Gemini agent failed; using deterministic fixture fallback.",
      error,
    );
    return { value: input.fallback(), toolCalls: trace, usedFallback: true };
  }
}
