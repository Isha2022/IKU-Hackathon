import { suggestHangout } from "../../../../agent/suggest";
import type { SuggestRequest } from "../../../../types/contracts";

export async function POST(request: Request): Promise<Response> {
  let body: SuggestRequest;
  try {
    body = (await request.json()) as SuggestRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  try {
    return Response.json(await suggestHangout(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to suggest a hangout.";
    return Response.json({ error: message }, { status: 400 });
  }
}
