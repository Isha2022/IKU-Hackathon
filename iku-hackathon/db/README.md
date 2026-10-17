# Database integration for Person A

Import proposal persistence functions from `@/db/proposals` in Node.js Route
Handlers or Server Actions. The `server-only` marker prevents client imports.
Use `import type` from `@/lib/types` for client-side types. Run `npm install`
after pulling the new server-only dependency.

## Functions

- `createProposal(input: CreateProposalInput): Promise<StoredProposal>`
- `getProposal(proposalId: string): Promise<StoredProposal | null>`
- `getLatestProposal(threadId: string): Promise<StoredProposal | null>`
- `reviseProposal(threadId: string, changes: ProposalChanges): Promise<StoredProposal>`
- `recordRsvp(proposalId: string, userId: string, response: RsvpResponse, reason?: string, extractedEvidence?: JsonObject): Promise<RsvpEvent>`
- `getRsvpHistory(proposalId: string): Promise<RsvpEvent[]>`
- `saveProposalConstraint(input: ProposalConstraintInput): Promise<StoredProposalConstraint>`

`StoredProposal` extends the existing frontend `Proposal`: `slot`, `attendees`,
`title`, `version`, `reasoning`, and `assumptions` retain their shapes. It adds
`id`, `threadId`, `groupId`, `activityType`, `venueText`, `status`, and `createdAt`.
The UI's local `place` field can be mapped from `venueText`. Attendee and group
IDs must be actual database UUIDs; fixture names such as `isha` are not UUIDs.

Example server-side calls:

```ts
const proposal = await createProposal({
  groupId, attendees: userIds, title: "Dinner",
  slot: { start: "2026-10-19T23:00:00Z", end: "2026-10-20T01:00:00Z" },
  reasoning: "No recorded calendar conflicts", assumptions: ["Venue is open"],
  venueText: "Cafe",
});
const revised = await reviseProposal(proposal.threadId, {
  expectedVersion: proposal.version,
  slot: { start: "2026-10-20T00:00:00Z", end: "2026-10-20T02:00:00Z" },
  reasoning: "Isha's shift ends later",
});
await recordRsvp(revised.id, userId, "maybe", originalReply, { notBefore: "21:00" });
```

## Behaviour and error handling

Creation validates nonempty, distinct attendee UUIDs and group membership.
Invitations are represented by the proposal's attendee list. No messages are
sent, and there is no delivery status tracking in this schema. Creation and
revision always produce `proposed` records, never confirmed hangouts.

Revision locks the thread using a transaction-scoped advisory lock, reads the
latest version under READ COMMITTED, inserts the next version, and marks the
previous record `superseded`. Everything commits or rolls back together. All
revision writers should use this function; the existing unique constraint on
`(thread_id, version)` also rejects duplicate versions from other writers.
Pass `expectedVersion` from the displayed proposal to reject stale edits; catch
that conflict in your route and return HTTP 409 / ask the user to reload. Without
it, concurrent revisions apply sequentially to the latest stored version.
Revision reasoning is required so each version records why it changed.
Confirmed, cancelled, or superseded latest records cannot be revised here.
Retrieve earlier versions by their IDs; list-all-version retrieval is not added.

RSVPs append to the specific proposal version, even if it has been superseded.
Only that version's attendees can reply or have constraints stored. Frontend
`accepted`/`declined` events must map to database `yes`/`no`; `maybe` is also
supported. Replies are preserved verbatim, and extracted evidence is JSONB.
History is ordered by timestamp; equal timestamps have no defined insertion
order because the hypertable has no sequence ID.

Constraints retain original text and JSON values. They default to `proposal`
scope and always start `pending`. Even explicitly `recurring` constraints do
not create calendar blocks or preferences. Approval workflows, authentication,
Gemini extraction, and automatic confirmation are outside these functions.

Lookups return null for missing proposals; history returns an empty list.
Invalid inputs, missing group memberships, non-attendee replies, and database
failures throw. Do not return raw database errors/connection details to clients.
All returned timestamps are ISO UTC strings; time windows require valid UTC
strings ending in Z, with seconds and optional 1–3 fractional digits.

## Tests

From the app directory, with a dummy connection URL (no live database used):

```sh
DATABASE_URL=postgresql://test:test@localhost/test node --conditions=react-server --import tsx --test db/queries.test.ts db/proposals.test.ts
npx tsc --noEmit
npm run lint
```

The react-server condition enables the server-only marker for standalone tests.
Mocks exercise transaction sequencing, simulated concurrent revision locks,
unique failures, rollback, RSVP history, validation, and data mapping. They do
not verify PostgreSQL or TimescaleDB execution. Live integration remains blocked
by the reported SSL certificate trust problem; no TLS verification is disabled.

## Group context and belief tools for Person A

Import these functions from `@/db/context` in server-side tools/routes:

```ts
import {
  getGroupMembers, getGroupPreferences, getBeliefs, createBelief,
  reviseBelief, getBeliefRevisionHistory, getRecentRsvpEvidence,
} from "@/db/context";

const [members, preferences, beliefs, recentReplies] = await Promise.all([
  getGroupMembers(groupId),
  getGroupPreferences(groupId),
  getBeliefs(groupId), // active only by default
  getRecentRsvpEvidence(groupId, 20), // newest first; default 50, maximum 500
]);
// Supply these as separate context fields to the agent, rather than flattening
// constraints, preferences and inferred beliefs into interchangeable rules.
const allBeliefs = await getBeliefs(groupId, { activeOnly: false });

// Only after the agent has identified actual stored evidence:
const belief = await createBelief({
  groupId, subjectUserId: userId,
  statement: "May prefer evening hangouts",
  confidence: 0.6,
  evidence: [{ proposalId, originalReply }],
});
await reviseBelief(belief.id, 0.35, "rsvp", originalExplanation, proposalId);
const audit = await getBeliefRevisionHistory(belief.id);
```

Exported signatures:

- `getGroupMembers(groupId): Promise<GroupMember[]>`
- `getGroupPreferences(groupId): Promise<GroupPreference[]>`
- `getBeliefs(groupId, options?: { activeOnly?: boolean }): Promise<StoredBelief[]>`
- `createBelief(input: CreateBeliefInput): Promise<StoredBelief>`
- `reviseBelief(beliefId, newConfidence, trigger, explanation, proposalId?): Promise<StoredBelief>`
- `getBeliefRevisionHistory(beliefId): Promise<StoredBeliefRevision[]>`
- `getRecentRsvpEvidence(groupId, limit?): Promise<RecentRsvpEvidence[]>`

All IDs are database UUID strings. Missing groups return empty collections.
Preferences with `userId: null` apply to the group; others remain user-specific.
No preferences are inferred or written by these functions. Belief subjects can
be null for group-level inferences. Non-null subjects must be current members
when creating a belief. Evidence must be a nonempty JSON array supplied by the
caller; references and the truth of evidence are not automatically verified.

Beliefs are soft inferences, not calendar availability facts. Confidence must
be finite and between 0 and 1 inclusive. PostgreSQL stores three decimal places;
returned numbers and audit records reflect that stored precision. Revisions
lock the row, update confidence, and append an audit record in one transaction.
They preserve original evidence, statement, and status; retired beliefs cannot
be revised. Use the audit trigger, explanation, and optional same-group proposal
reference to retain the new rationale. History is oldest first; equal timestamps
have no defined insertion order. Existing schema cascades still apply if the
underlying belief/group is deleted.

Recent RSVP evidence is selected by the proposal's group, not by present-day
membership, so it retains historical replies by former members. It includes
proposal version and time-window context, original reply text, extracted JSON,
and a separate list of constraints for that same proposal version and user.
Those constraints are not necessarily extracted from the specific RSVP event:
the schema has no RSVP-event-to-constraint reference. Constraints can appear on
multiple replies from the same user/version. Scope and approval status are
preserved, including pending/rejected constraints; pending extracted constraints
must not be treated as established hard facts. Equal RSVP timestamps have no
guaranteed order.

Calendar conflicts and applicable explicit user constraints should be supplied
separately as hard facts. RSVP patterns, beliefs, and preferences are soft context;
a one-off decline does not create a recurring preference. No-busy-block results
mean only no recorded conflict, not confirmed availability. These context tools
never create busy blocks, edit preferences, or generate fallback beliefs.

Run all mocked tests with:

```sh
DATABASE_URL=postgresql://test:test@localhost/test node --conditions=react-server --import tsx --test db/queries.test.ts db/proposals.test.ts db/context.test.ts
```

SQL and transaction behaviour against Tiger Data still need live integration
verification once certificate trust is fixed.
