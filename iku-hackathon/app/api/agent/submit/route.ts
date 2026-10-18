import { submitProposal } from "../../../../db/proposals";
import type { SubmitInvitationRequest } from "../../../../types/contracts";

export async function POST(request: Request): Promise<Response> {
  let body: SubmitInvitationRequest;
  try {
    body = await request.json() as SubmitInvitationRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (
    !body || typeof body !== "object" || typeof body.threadId !== "string" ||
    typeof body.senderUserId !== "string" || !Number.isInteger(body.proposalVersion)
  ) {
    return Response.json({ error: "Expected threadId, proposalVersion, and senderUserId." }, { status: 400 });
  }
  try {
    return Response.json(await submitProposal(body.threadId, body.proposalVersion, body.senderUserId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send this invitation.";
    const status = message.startsWith("Proposal version conflict") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
