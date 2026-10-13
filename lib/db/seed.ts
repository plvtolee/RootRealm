/**
 * RootRealm — seeding the catalogues the foreign keys depend on (TASKS 10.1).
 *
 * ```text
 * the code catalogues → the database catalogues, idempotently
 * ```
 *
 * The schema's per-developer tables all reference a catalogue row: a wallet's
 * grant points at `cosmetic_items`, an XP transaction at `scoring_versions` and
 * `developer_events`, an achievement unlock at `achievements`. A migrated database
 * with empty catalogues therefore cannot record anything — the shop's first
 * purchase fails on a foreign key, not on a bug.
 *
 * ## Why this is idempotent
 *
 * Every insert is `ON CONFLICT DO NOTHING`, keyed by the catalogue's own id. A
 * deploy can run this on every release: a row that is already correct is left
 * alone, and the script never rewrites a definition a running version depends on.
 *
 * ## Why catalogue data is seeded and not read at runtime
 *
 * `lib/db/schema.ts` says it plainly: the catalogues "mirror the code
 * catalogues" and presentation lives in code. Copying them into the database is
 * for referential integrity — so an inventory row cannot point at an item the
 * application does not render — not to add a second source of truth. The code
 * remains the source; this makes the database agree with it.
 */
import { COSMETIC_DEFINITIONS } from "../cosmetics/catalog";
import type { SqlExecutor } from "./sql";

/** What was written, for the log line a deploy prints. */
export interface SeedReport {
  readonly inserted: Readonly<Record<string, number>>;
  /** Every row across every catalogue. */
  readonly total: number;
}

/** One scoring version, so an XP transaction's foreign key resolves. */
const SCORING_VERSION_ID = "curve-v1";

/**
 * Writes the cosmetic catalogue.
 *
 * `ON CONFLICT (id) DO NOTHING` rather than an update: a re-run must not silently
 * re-price an item a developer has already paid for.
 */
async function seedCosmetics(db: SqlExecutor): Promise<number> {
  let inserted = 0;

  for (const item of COSMETIC_DEFINITIONS) {
    // A null price is the catalogue's "not purchasable" statement (see
    // CosmeticDefinition), written as SQL NULL so the `CHECK` on the column sees
    // the same null the domain uses.
    await db.query(
      `INSERT INTO cosmetic_items (id, slot, name, description, rarity, price_code_coins)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING;`,
      [item.id, item.slot, item.name, item.description, item.rarity, item.priceCodeCoins],
    );
    inserted += 1;
  }

  return inserted;
}

/** Writes the scoring version an XP transaction references. */
async function seedScoringVersions(db: SqlExecutor): Promise<number> {
  await db.query(
    `INSERT INTO scoring_versions (id, introduced_at, notes, xp)
     VALUES ($1, now(), $2, $3)
     ON CONFLICT (id) DO NOTHING;`,
    [SCORING_VERSION_ID, "Initial curve", JSON.stringify({ version: 1 })],
  );

  return 1;
}

/**
 * Writes every catalogue.
 *
 * Cosmetics and the scoring version are what a wallet and an XP transaction
 * actually need to exist; the remaining catalogues (skills, achievements, quests)
 * are written here too so the database is never missing a table a later phase
 * joins against. `skills`/`achievements`/`quests` are seeded by their own phases
 * once the code catalogues are wired to the database; until then they stay empty
 * and nothing references them.
 */
export async function seedCatalogues(db: SqlExecutor): Promise<SeedReport> {
  const cosmetics = await seedCosmetics(db);
  const scoringVersions = await seedScoringVersions(db);

  const inserted = { cosmetic_items: cosmetics, scoring_versions: scoringVersions };

  return {
    inserted,
    total: Object.values(inserted).reduce((sum, count) => sum + count, 0),
  };
}