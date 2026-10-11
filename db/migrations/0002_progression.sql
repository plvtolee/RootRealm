-- 0002_progression: Progression tables (TASKS 10.3)
-- Generated from lib/db/schema.ts. Do not edit by hand.

CREATE TABLE attribute_progress (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  attribute text NOT NULL,
  units integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, attribute)
);

CREATE TABLE skill_nodes (
  id text PRIMARY KEY,
  category text NOT NULL,
  tier integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  prerequisites jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  xp_reward integer NOT NULL DEFAULT 0
);

CREATE TABLE skill_unlocks (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES skill_nodes (id) ON DELETE RESTRICT,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skill_unlocks_user_id_skill_id_key UNIQUE (user_id, skill_id)
);

CREATE TABLE achievements (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  rarity text NOT NULL,
  criterion jsonb NOT NULL
);

CREATE TABLE achievement_unlocks (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES achievements (id) ON DELETE RESTRICT,
  evidence_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievement_unlocks_user_id_achievement_id_key UNIQUE (user_id, achievement_id)
);

CREATE TABLE quests (
  id text PRIMARY KEY,
  kind text CONSTRAINT kind_check CHECK (kind IN ('daily', 'weekly', 'goal')) NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  criterion jsonb NOT NULL,
  xp_reward integer NOT NULL DEFAULT 0,
  code_coin_reward integer NOT NULL DEFAULT 0
);

CREATE TABLE quest_progress (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quest_id text NOT NULL REFERENCES quests (id) ON DELETE CASCADE,
  period_key text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quest_progress_user_id_quest_id_period_key_key UNIQUE (user_id, quest_id, period_key)
);
