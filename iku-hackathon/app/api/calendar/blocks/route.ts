import { createBusyBlock } from "../../../../db/queries";
import { getGroupMembers } from "../../../../db/context";
import { DEMO_GROUP_ID } from "../../../../lib/agent/database-context";
import type { BusyBlockSource } from "../../../../lib/types";

interface CreateBusyBlockBody {
  userId: string;
  start: string;
  end: string;
  source: "manual" | "ics";
  externalUid?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: CreateBusyBlockBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (
    !body || typeof body !== "object" ||
    typeof body.userId !== "string" || typeof body.start !== "string" || typeof body.end !== "string" ||
    (body.source !== "manual" && body.source !== "ics") ||
    (body.externalUid !== undefined && typeof body.externalUid !== "string")
  ) {
    return Response.json({ error: "Expected a user, start, end, and manual or ics source." }, { status: 400 });
  }

  try {
    const members = await getGroupMembers(DEMO_GROUP_ID);
    if (!members.some((member) => member.id === body.userId)) {
      return Response.json({ error: "Calendar owner is not a member of this group." }, { status: 403 });
    }
    const block = await createBusyBlock(
      body.userId,
      body.start,
      body.end,
      body.source as BusyBlockSource,
      body.externalUid,
    );
    return Response.json({ block }, { status: 201 });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
      ? "Database TLS verification failed. Use a provider-supplied trusted certificate."
      : "Unable to save this calendar block. Check the time and database connection.";
    return Response.json({ error: message }, { status: 503 });
  }
}
