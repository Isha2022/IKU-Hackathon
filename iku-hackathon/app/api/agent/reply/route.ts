import { processReply } from "../../../../agent/reply";
import type { ReplyRequest } from "../../../../types/contracts";

export async function POST(request: Request): Promise<Response> {
  let body: ReplyRequest;
  try {
    body = (await request.json()) as ReplyRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !Number.isInteger(body.proposalVersion) ||
    typeof body.userId !== "string" ||
    typeof body.message !== "string"
  ) {
    return Response.json({ error: "Expected proposalVersion, userId, and message." }, { status: 400 });
  }
  try {
    return Response.json(await processReply(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process the reply.";
    const status = message.startsWith("Stale proposal version") || message.startsWith("Proposal version conflict") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
