# Where's Everyone?

## Project

Where's Everyone? is a one-day hackathon project built by three CS students. It
helps friends find times to meet by using an AI agent to propose hangouts.

Users import calendar availability as **free/busy only**. The agent states the
assumptions behind its proposals. When new evidence arrives—such as someone
declining, a new busy block appearing, or a user correcting an assumption—the
agent revises its beliefs, re-plans, and visibly explains what changed and why.

## Stack

- TypeScript and Next.js (App Router)
- Tiger Data (Postgres with TimescaleDB)
- Gemini API through `@google/genai`
- Tailwind CSS and shadcn/ui
- Docker
- Vultr VPS deployment behind Caddy

## Implementation guidelines

- The LLM reasons about the situation; application code computes facts.
- Implement free-slot calculations, date handling, and database queries as
  deterministic code, exposed to Gemini as function-calling tools.
- Keep the agent loop hand-written and lightweight; do not add a heavy agent
  framework.
- Store all times in UTC using `timestamptz` and `tstzrange`. Convert to
  `Europe/London` only when displaying times in the UI.
- Keep secrets in environment variables; never commit them.
- Keep the code simple and readable.

## Folders

- `/agent` — agent loop, prompts, and tools
- `/db` — schema, seed data, and queries
- `/app` — UI and API routes

## Tables

| Table | Purpose |
|---|---|
| `users` | Project users |
| `busy_blocks` | Users' busy calendar intervals |
| `proposals` | Suggested hangouts |
| `rsvp_events` | RSVP evidence over time; TimescaleDB hypertable |
| `beliefs` | The agent's current beliefs and assumptions |
| `belief_revisions` | Belief changes over time; TimescaleDB hypertable |
