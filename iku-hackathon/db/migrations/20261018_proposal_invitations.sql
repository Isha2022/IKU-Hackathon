-- Run once against databases created before the in-app invitation feature.
CREATE TABLE IF NOT EXISTS proposal_invitations (
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS proposal_invitations_recipient_idx
  ON proposal_invitations(recipient_user_id, sent_at DESC);
