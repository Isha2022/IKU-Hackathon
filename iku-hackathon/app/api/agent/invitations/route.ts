import { getGroupInvitations } from "../../../../db/proposals";
import { DEMO_GROUP_ID } from "../../../../lib/agent/database-context";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ invitations: await getGroupInvitations(DEMO_GROUP_ID) });
  } catch {
    return Response.json({ error: "Unable to load group invitations." }, { status: 503 });
  }
}
