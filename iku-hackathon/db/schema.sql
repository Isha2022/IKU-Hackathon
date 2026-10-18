-- Where's Everyone? PostgreSQL / Tiger Data MVP schema.
-- Apply to a NEW development database. Requires TimescaleDB enabled by provider.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/London',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS busy_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  during tstzrange NOT NULL,
  source text NOT NULL CHECK (source IN ('ics','manual','confirmed_hangout')),
  external_uid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT isempty(during)),
  CHECK (lower_inc(during) AND NOT upper_inc(during)),
  CHECK (NOT lower_inf(during) AND NOT upper_inf(during))
);
CREATE INDEX IF NOT EXISTS busy_blocks_user_idx ON busy_blocks(user_id);
CREATE INDEX IF NOT EXISTS busy_blocks_during_gist_idx ON busy_blocks USING gist(during);
CREATE UNIQUE INDEX IF NOT EXISTS busy_blocks_import_uid_idx
  ON busy_blocks(user_id, external_uid) WHERE external_uid IS NOT NULL;

CREATE TABLE IF NOT EXISTS preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('activity','venue','time','budget','other')),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preferences_group_idx ON preferences(group_id);

-- Each revision is a new proposal row with the same thread_id, incremented version.
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  during tstzrange NOT NULL,
  title text NOT NULL,
  activity_type text,
  venue_text text,
  attendee_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','superseded','confirmed','cancelled')),
  reasoning text,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(thread_id, version),
  CHECK (NOT isempty(during)),
  CHECK (lower_inc(during) AND NOT upper_inc(during)),
  CHECK (NOT lower_inf(during) AND NOT upper_inf(during))
);
CREATE INDEX IF NOT EXISTS proposals_group_idx ON proposals(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proposals_thread_idx ON proposals(thread_id, version DESC);

-- In-app invitation delivery. Each submitted proposal version is an invitation
-- visible to the listed recipients in the group's shared invitation feed.
CREATE TABLE IF NOT EXISTS proposal_invitations (
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS proposal_invitations_recipient_idx
  ON proposal_invitations(recipient_user_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS beliefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  subject_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  statement text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revised','retired')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beliefs_group_idx ON beliefs(group_id);

-- Time-series event history. No primary key needed for the MVP.
CREATE TABLE IF NOT EXISTS rsvp_events (
  time timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('yes','no','maybe')),
  reason text,
  extracted_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
SELECT create_hypertable('rsvp_events', by_range('time'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS rsvp_events_proposal_user_time_idx
  ON rsvp_events(proposal_id, user_id, time DESC);
CREATE INDEX IF NOT EXISTS rsvp_events_user_time_idx ON rsvp_events(user_id, time DESC);

CREATE TABLE IF NOT EXISTS belief_revisions (
  time timestamptz NOT NULL DEFAULT now(),
  belief_id uuid NOT NULL REFERENCES beliefs(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
  old_confidence numeric(4,3) NOT NULL CHECK (old_confidence BETWEEN 0 AND 1),
  new_confidence numeric(4,3) NOT NULL CHECK (new_confidence BETWEEN 0 AND 1),
  trigger text NOT NULL,
  explanation text NOT NULL
);
SELECT create_hypertable('belief_revisions', by_range('time'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS belief_revisions_belief_time_idx
  ON belief_revisions(belief_id, time DESC);

-- Parsed constraints remain separate from the user's calendar; do not silently
-- turn a one-off reply into a recurring busy block.
CREATE TABLE IF NOT EXISTS proposal_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_text text NOT NULL,
  constraint_type text NOT NULL CHECK (constraint_type IN ('not_before','not_after','indoor','other')),
  constraint_value jsonb NOT NULL,
  scope text NOT NULL DEFAULT 'proposal' CHECK (scope IN ('proposal','recurring')),
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_constraints_proposal_idx ON proposal_constraints(proposal_id);
