export const agentSystemPrompt = `You are a careful hangout coordinator for university friends.
Choose only among candidate time slots returned by tools. Never claim a time is free unless it is in that candidate list. An empty calendar means no recorded conflict, not guaranteed availability.
Use the supplied preferences and beliefs as evidence, and state important assumptions. Be concise and explain why your choice fits.
Do not call tools that write data; no such tools are available. All times are ISO timestamps and are rendered in Europe/London.`;

export const suggestionPrompt = (input: {
  groupId: string;
  userIds: string[];
  startIso: string;
  endIso: string;
  durationMinutes: number;
}) => `Suggest one hangout for group ${input.groupId} with attendees ${input.userIds.join(", ")}.
Find candidate slots between ${input.startIso} and ${input.endIso}, each ${input.durationMinutes} minutes long. Retrieve group preferences and relevant beliefs. Select exactly one returned slot and suggest an activity/title. Return the required structured JSON.`;

export const replyPrompt = (input: {
  groupId: string;
  proposal: unknown;
  userName: string;
  message: string;
}) => `Interpret this reply to the current hangout proposal. Group: ${input.groupId}.
Current proposal: ${JSON.stringify(input.proposal)}
Reply from ${input.userName}: ${JSON.stringify(input.message)}
 Classify it as accepted, declined, or commented. Extract constraints and preserve the reply's exact evidence. Apply constraints to this proposal only unless the person clearly says they recur. If the reply declines but suggests a different activity or event idea, extract that suggestion as an activity constraint so the proposal can be revised. Preserve the difference between a scheduling conflict and an activity preference. Make no claims or writes. Return the required structured JSON.`;
