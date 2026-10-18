import { suggestHangout } from "../agent/suggest";
import { processReply } from "../agent/reply";
import { submitProposal } from "../db/proposals";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Fixture replay works without an env file or Gemini key.
  }

  const suggestion = await suggestHangout();
  await submitProposal(
    suggestion.threadId,
    suggestion.proposal.version,
    "11111111-1111-4111-8111-111111111111",
  );
  const reply = await processReply({
    threadId: suggestion.threadId,
    proposalVersion: suggestion.proposal.version,
    userId: "22222222-2222-4222-8222-222222222222",
    response: "declined",
    message: "I can't make that time, but could we do brunch instead?",
  });

  console.log(JSON.stringify({ suggestion, reply }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
