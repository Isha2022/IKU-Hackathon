export {};

const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const youId = "11111111-1111-4111-8111-111111111111";
const senderId = "22222222-2222-4222-8222-222222222222";
const title = "Demo invitation: relaxed coffee catch-up";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // DATABASE_URL may already be present in the environment.
  }

  const { createProposal, getGroupInvitations, submitProposal } = await import("../db/proposals");
  const { pool } = await import("../db/client");

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proposal_invitations (
        proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sent_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (proposal_id, recipient_user_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS proposal_invitations_recipient_idx
        ON proposal_invitations(recipient_user_id, sent_at DESC)
    `);

    const existing = await getGroupInvitations(groupId);
    const seeded = existing.find((invitation) =>
      invitation.proposal.title === title && invitation.recipientUserId === youId,
    );
    if (seeded) {
      console.log(`Demo invitation already exists for ${seeded.recipientName}.`);
      return;
    }

    const proposal = await createProposal({
      groupId,
      attendees: [youId, senderId],
      title,
      activityType: "coffee and a catch-up",
      slot: { start: "2026-10-24T13:00:00Z", end: "2026-10-24T15:00:00Z" },
      reasoning: "A seeded invitation so the demo can show a recipient declining and suggesting an alternative.",
      assumptions: ["The recipient may decline or propose a different activity."],
    });
    const result = await submitProposal(proposal.threadId, proposal.version, senderId);
    console.log(`Seeded one demo invitation addressed to ${result.invitations[0]?.recipientName ?? "You"}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  const detail = error instanceof Error
    ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[database URL]").replace(/password=[^&\s]+/gi, "password=[redacted]")
    : "Unknown error";
  console.error(`Could not seed the demo invitation${code ? ` (database error ${code})` : ""}: ${detail}`);
  process.exitCode = 1;
});
