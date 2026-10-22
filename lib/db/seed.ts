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
import { ACHIEVEMENT_DEFINITIONS } from "../achievements/definition";
import { SKILL_DEFINITIONS } from "../skills/catalog";
import { SCORING_V1 } from "../scoring/types";
import type { SqlExecutor } from "./sql";

/** What was written, for the log line a deploy prints. */
export interface SeedReport {
  readonly inserted: Readonly<Record<string, number>>;
  /** Every row across every catalogue. */
  readonly total: number;
}

/**
 * One scoring version, so an XP transaction's foreign key resolves.
 *
 * This is `SCORING_V1.id` and it was previously the literal `"curve-v1"` — which
 * is the *level curve* id (`characters.level_curve_id` defaults to it), a
 * different concept entirely. The seed therefore satisfied the foreign key with
 * the wrong row, and the first real sync failed on
 * `xp_transactions_scoring_version_id_fkey`.
 *
 * Nothing caught it until now because nothing had ever written an XP
 * transaction: `scoring_versions` was a catalogue with no referrer, so a wrong id
 * in it was invisible.
 */
const SCORING_VERSION_ID = SCORING_V1.id;

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

/**
 * Writes the achievement catalogue.
 *
 * Added when the sync first ran for real. `achievement_unlocks.achievement_id`
 * references this table, so an empty catalogue made every unlock fail on a
 * foreign key — exactly the failure the note at the top of this file warns about,
 * which is why seeding it here rather than leaving it to a later phase.
 */
async function seedAchievements(db: SqlExecutor): Promise<number> {
  for (const achievement of ACHIEVEMENT_DEFINITIONS) {
    await db.query(
      `INSERT INTO achievements (id, title, description, rarity, criterion)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING;`,
      [
        achievement.id,
        achievement.title,
        achievement.description,
        achievement.rarity,
        JSON.stringify(achievement.criterion),
      ],
    );
  }

  return ACHIEVEMENT_DEFINITIONS.length;
}

/** Writes the scoring version an XP transaction references. */
async function seedScoringVersions(db: SqlExecutor): Promise<number> {
  // The XP table comes from the scoring engine's own version, not a placeholder.
  // A row whose `xp` says `{version: 1}` would resolve the foreign key and then
  // misdescribe every award it was referenced by.
  await db.query(
    `INSERT INTO scoring_versions (id, introduced_at, notes, xp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING;`,
    [SCORING_VERSION_ID, SCORING_V1.introducedAt, SCORING_V1.notes, JSON.stringify(SCORING_V1.xp)],
  );

  return 1;
}

/** Writes the skill catalogue required by skill_unlocks' foreign key. */
async function seedSkills(db: SqlExecutor): Promise<number> {
  const tierNumber = { roots: 1, foundation: 2, intermediate: 3, advanced: 4, mastery: 5 } as const;

  for (const skill of SKILL_DEFINITIONS) {
    await db.query(
      `INSERT INTO skill_nodes
         (id, category, tier, title, description, prerequisites, evidence, xp_reward)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       ON CONFLICT (id) DO NOTHING;`,
      [
        skill.id,
        skill.branch ?? "origin",
        tierNumber[skill.tier],
        skill.title,
        skill.description,
        JSON.stringify(skill.prerequisiteIds),
        JSON.stringify(skill.requirement === null ? [] : [skill.requirement]),
        0,
      ],
    );
  }

  return SKILL_DEFINITIONS.length;
}

/**
 * Writes every catalogue.
 *
 * Cosmetics and the scoring version are what a wallet and an XP transaction
 * actually need to exist; the remaining catalogues (skills, achievements, quests)
 * are written here too so the database is never missing a table a later phase
 * joins against. Skill rows are required now because `skill_unlocks` references
 * them; quests remain owned by their later phase.
 */
export async function seedCatalogues(db: SqlExecutor): Promise<SeedReport> {
  const cosmetics = await seedCosmetics(db);
  const scoringVersions = await seedScoringVersions(db);

  const achievements = await seedAchievements(db);
  const skills = await seedSkills(db);

  const inserted = {
    cosmetic_items: cosmetics,
    scoring_versions: scoringVersions,
    achievements,
    skill_nodes: skills,
  };

  return {
    inserted,
    total: Object.values(inserted).reduce((sum, count) => sum + count, 0),
  };
}
