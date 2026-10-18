import { getDatabaseGroupData } from "../../../../lib/agent/database-context";

export async function GET(): Promise<Response> {
  try {
    const data = await getDatabaseGroupData("2026-10-19T00:00:00Z", "2026-10-27T00:00:00Z");
    return Response.json(data);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
    const message = code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
      ? "Database TLS verification failed. Set DATABASE_CA_CERT_PATH to the trusted CA certificate file for your database provider."
      : code === "28P01"
        ? "Database authentication failed. Update DATABASE_URL with the current credentials from Tiger Data."
      : "Unable to load the group from the database. Check database connectivity and schema setup.";
    return Response.json({ error: message }, { status: 503 });
  }
}
