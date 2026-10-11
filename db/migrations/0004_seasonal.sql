-- 0004_seasonal: Seasonal tables (TASKS 10.5)
-- Generated from lib/db/schema.ts. Do not edit by hand.

CREATE TABLE seasons (
  id text PRIMARY KEY,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  rules jsonb NOT NULL
);

CREATE TABLE rank_snapshots (
  id text PRIMARY KEY,
  season_id text NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rank_points numeric NOT NULL,
  rank integer,
  computed_at timestamptz NOT NULL,
  CONSTRAINT rank_snapshots_season_id_user_id_computed_at_key UNIQUE (season_id, user_id, computed_at)
);
