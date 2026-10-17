# Where's Everyone? — Project Context

## Goal

One-day hackathon project by **three CS students**. Help university students coordinate real hangouts while transitioning to university and making friends. The core value is a useful calendar availability dashboard plus an **adaptive AI hangout coordinator**.

## MVP user journey

1. A user opens their personal dashboard/calendar. They can import an `.ics` calendar (free/busy only) and manually add/delete busy intervals.
2. The user selects friends in a group. The calendar displays a heatmap: for each displayed time bucket, the count of selected friends who are available. Darker green means more people are free. Show exact counts; heatmap is informational, not AI-generated.
3. The user clicks **Suggest hangout**. Deterministic code retrieves candidate shared free slots; Gemini selects a sensible candidate and activity type based on preferences and evidence, stating assumptions.
4. A proposal appears in selected users' in-app dashboards. Users can accept, decline, or add a natural-language reply.
5. The agent interprets replies (e.g. "I can only come after 4"), distinguishes one-off constraints from recurring preferences, checks availability again, revises the proposal and explains what changed. Any calendar write, external message or final confirmation requires user approval.
6. Once all invitees accept the same proposal version, the event can be confirmed and displayed in their in-app calendars.

## Demo story

Four seeded users (You, Sam, Priya, Jo) have realistic busy blocks and preferences. Agent initially suggests Saturday at 14:00; Priya replies "I can only come after 4 and I'd prefer somewhere indoors." The agent revises to an available later slot and indoor activity, showing old/new proposals and the evidence. Times are examples, not guaranteed availability; seed data must make the scenario valid.

## Hackathon criteria

- Personal transition problem: meeting and staying connected with friends at university.
- Adaptive agent: visible assumptions, tool use, contradiction handling, revisions and explanations.
- Gemini: official `@google/genai` SDK, function calling, structured output, bounded agent loop.
- Tiger Data: PostgreSQL range queries and time-series RSVP / belief revision history; show a genuine evidence query. Optional continuous aggregate after MVP.
- Vultr: mandatory app deployment to Vultr VPS behind Caddy, with Docker.
- Funny GoDaddy Registry domain: optional, check official eligibility and availability.

## Stack

- TypeScript; Next.js App Router; Tailwind CSS; shadcn/ui
- Tiger Data managed PostgreSQL + TimescaleDB; `pg` and parameterised SQL
- Gemini via `@google/genai`
- `.ics` import via `node-ical` only after core MVP
- Docker Compose + Caddy on Vultr VPS

## Architecture / safety

- The LLM reasons and chooses among options; code computes calendar overlaps, time zones, RSVP state and database facts.
- Database is authoritative for schedules, proposal versions, invitations, replies and evidence. Validate Gemini outputs server-side.
- An empty calendar means **no recorded conflict**, not guaranteed availability.
- Use UTC instants in `timestamptz` / `tstzrange`, convert using `Europe/London` when calculating permitted local hours and rendering. Respect DST.
- An RSVP reply is not automatically a permanent calendar change. Extracted one-off constraints apply to the proposal unless explicitly recurring; show changes for user approval.
- Keep secrets in `.env.local`/Vultr env, never commit. Do not expose private event titles to other users; heatmap uses free/busy only.
- Demo mode: four seeded users with a user switcher; no full authentication. Real multi-user accounts and notifications are out of scope.
- Limit Gemini tool calls; provide fixture replay fallback. No heavy agent framework.

## Core data model

- `users`: demo participants
- `groups`, `group_members`: group membership
- `busy_blocks`: imported or manual busy intervals, optionally user-approved changes
- `preferences`: group/user activity and timing preferences
- `proposals`: immutable proposal versions grouped by `thread_id`; time, activity, explanation, assumptions
- `rsvp_events`: time-stamped responses for a particular proposal version (Timescale hypertable)
- `beliefs`: current agent beliefs, evidence, confidence
- `belief_revisions`: time-stamped changes (Timescale hypertable)
- `proposal_constraints`: one-off scheduling restrictions extracted from replies, with approval status

## Shared backend/database contracts

Person B owns DB queries; Person A owns Gemini tool wrappers and API routes; Person C owns UI and deployment.

Suggested functions:

- `getGroupMembers(groupId)`
- `getBusyBlocks(userIds, startIso, endIso)`
- `getAvailabilityHeatmap(userIds, startIso, endIso, bucketMinutes)` -> [{start,end,freeCount,totalCount}]
- `getFreeSlots(userIds, startIso, endIso, durationMinutes)` -> [{start,end,freeUserIds}]
- `getGroupPreferences(groupId)`
- `getRsvpHistory(groupId)`
- `getBeliefs(groupId)`
- `createProposalVersion(...)` (transactional)
- `recordRsvp(proposalId,userId,response,reason)`
- `recordBeliefRevision(...)` (transactional)

Use ISO 8601 timestamps with offsets in APIs. Define types in a shared `types/contracts.ts` before parallel development. Heatmap should count **selected** users, not all group members. Use half-open intervals `[start,end)`.

## Team split (3 people)

- **A — AI / Backend:** Gemini loop, function tools, natural-language parsing, proposal/revision logic, API routes.
- **B — Tiger Data:** provision DB, schema/migrations, seed, deterministic slot/heatmap functions, RSVP and preference evidence queries, transactional writes.
- **C — Frontend / Vultr:** dashboard, calendar, heatmap, friend selection, proposal/reply/revision UI, deploy scaffold early and maintain Docker/Caddy.

## Folder ownership

- `/agent` — Person A
- `/db` — Person B
- `/app/api` — Person A (coordinate with C)
- `/app` UI, `/components` — Person C
- Dockerfile, compose, Caddyfile, DEPLOY.md — Person C
- `/types/contracts.ts` — agree together, then freeze

## 24-hour build order

0–1h: confirm contracts; provision Tiger Data and Vultr; verify scaffold.
1–6h: A agent with mocks; B schema/seed/queries; C dashboard fixtures and deploy hello-world.
6–12h: integrate database, agent and UI; complete one real proposal -> reply -> revision.
12–18h: harden state changes, add evidence display, polish; optional `.ics` import.
18–24h: stop features, test end-to-end, rehearse, backup video, submit.

## Explicit non-goals until core works

Google Calendar OAuth, real email/WhatsApp delivery, restaurant discovery, weather, advanced authentication, multi-tenant production security, recurring `.ics` expansion, complex ML prediction. These are stretch goals only.
