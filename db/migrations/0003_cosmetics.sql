-- 0003_cosmetics: Cosmetic tables (TASKS 10.4)
-- Generated from lib/db/schema.ts. Do not edit by hand.

CREATE TABLE cosmetic_items (
  id text PRIMARY KEY,
  slot text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  rarity text NOT NULL,
  price_code_coins integer CONSTRAINT price_code_coins_check CHECK (price_code_coins >= 0) NOT NULL
);

CREATE TABLE inventory_items (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES cosmetic_items (id) ON DELETE RESTRICT,
  source_kind text CONSTRAINT source_kind_check CHECK (source_kind IN ('default', 'quest', 'purchase')) NOT NULL DEFAULT 'default',
  source_id text,
  equipped boolean NOT NULL DEFAULT false,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_user_id_item_id_key UNIQUE (user_id, item_id)
);

CREATE TABLE currency_transactions (
  transaction_id text CONSTRAINT transaction_id_check CHECK (transaction_id LIKE 'cc:%') PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
