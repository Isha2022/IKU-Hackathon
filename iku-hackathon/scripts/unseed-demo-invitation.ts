export {};

const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const youId = "11111111-1111-4111-8111-111111111111";
const title = "Demo invitation: relaxed coffee catch-up";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // DATABASE_URL may already be present in the environment.
  }

  const { pool } = await import("../db/client");
  try {
    const result = await pool.query<{ id: string }>(`
      DELETE FROM proposals p
      WHERE p.thread_id IN (
        SELECT seeded.thread_id FROM proposals seeded
        JOIN proposal_invitations i ON i.proposal_id = seeded.id
        WHERE seeded.group_id = $1::uuid AND seeded.title = $2
          AND i.recipient_user_id = $3::uuid
      )
      RETURNING p.id
    `, [groupId, title, youId]);
    console.log(result.rowCount
      ? `Removed the demo invitation and its proposal history (${result.rowCount} proposal version${result.rowCount === 1 ? "" : "s"}).`
      : "No seeded demo invitation was found; nothing changed.");
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("Could not remove the demo invitation. Check database connectivity and make sure the invitation migration is applied.");
  process.exitCode = 1;
});
