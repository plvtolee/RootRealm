-- 0001_core: Core tables (TASKS 10.2)
-- Generated from lib/db/schema.ts. Do not edit by hand.

CREATE TABLE users (
  id text PRIMARY KEY,
  github_id bigint NOT NULL UNIQUE,
  login text NOT NULL,
  display_name text,
  avatar_url text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE github_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  github_id bigint NOT NULL UNIQUE,
  login text NOT NULL,
  access_token_ciphertext text NOT NULL,
  scopes text NOT NULL DEFAULT '',
  token_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE repositories (
  repository_id bigint PRIMARY KEY,
  full_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_login text NOT NULL,
  name text NOT NULL,
  description text,
  url text,
  primary_language text,
  is_fork boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  stars integer,
  pushed_at timestamptz,
  source jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE developer_events (
  id text PRIMARY KEY,
  developer_login text NOT NULL,
  developer_id bigint,
  repository_id bigint REFERENCES repositories (repository_id) ON DELETE SET NULL,
  repository_full_name text,
  kind text NOT NULL,
  occurred_at timestamptz,
  visibility text NOT NULL,
  confidence text NOT NULL,
  relevance text NOT NULL,
  source_url text,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scoring_versions (
  id text PRIMARY KEY,
  introduced_at timestamptz NOT NULL,
  notes text,
  xp jsonb NOT NULL
);

CREATE TABLE xp_transactions (
  id text CONSTRAINT id_check CHECK (id LIKE 'xp:%') PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES developer_events (id) ON DELETE CASCADE,
  developer_login text NOT NULL,
  xp integer NOT NULL,
  classification text NOT NULL,
  reason text NOT NULL,
  rule_id text NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring_version_id text NOT NULL REFERENCES scoring_versions (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE characters (
  user_id text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  total_xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  level_curve_id text NOT NULL DEFAULT 'curve-v1',
  updated_at timestamptz NOT NULL DEFAULT now()
);
