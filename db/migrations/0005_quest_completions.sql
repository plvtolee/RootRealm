-- 0005_quest_completions: Evidence-backed quest completions
-- Generated from lib/db/schema.ts. Do not edit by hand.

CREATE TABLE quest_completions (
  id text CONSTRAINT id_check CHECK (id LIKE 'quest:%') PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quest_id text NOT NULL REFERENCES quests (id) ON DELETE CASCADE,
  period_key text NOT NULL,
  progress integer NOT NULL,
  completed_at timestamptz NOT NULL,
  evidence_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring_version_id text NOT NULL REFERENCES scoring_versions (id) ON DELETE RESTRICT,
  CONSTRAINT quest_completions_user_id_quest_id_period_key_key UNIQUE (user_id, quest_id, period_key)
);
