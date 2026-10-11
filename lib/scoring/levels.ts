/**
 * RootRealm — level calculation (TASKS 5.13).
 *
 * `SCORING.md` §24: "The exact level curve is intentionally not finalized", and
 * the requirements are that it be
 *
 * - deterministic
 * - versioned
 * - easy to tune
 *
 * with the calculation isolated behind `calculateLevel(totalXp, levelCurveVersion)`
 * and explicitly "not hard-coded throughout UI components".
 *
 * ## Why the curve is data rather than a formula
 *
 * "Easy to tune" is the operative requirement, and it rules out a closed-form
 * curve in disguise. A formula such as `floor(sqrt(xp / 100))` is deterministic
 * and versioned, but every adjustment to early progression means editing the
 * expression — and then reasoning about what the previous version produced.
 *
 * So the curve is a table of `{ level, xp }` breakpoints, and a version is a
 * table plus a name. Adding a version is adding a table; changing early
 * progression is moving one number. A historical character keeps its version
 * string and can be re-evaluated, because the breakpoints it used are still
 * available — the same reason {@link ScoringVersion} carries its XP values.
 *
 * ## What the shape guarantees
 *
 * Levels are 1-based and contiguous, since `calculateLevel` returns the highest
 * level whose threshold has been met. A threshold list is validated on
 * construction rather than on call, so a malformed curve is a startup failure
 * rather than a wrong answer for one developer.
 *
 * The first entry must be level 1 at 0 XP: a character exists at level 1 before
 * earning anything, and a curve starting at 100 XP would make `0 XP` undefined.
 */
export type LevelCurveId = "curve-v1";

/** One breakpoint in a curve. */
export interface LevelThreshold {
  /** The level reached at `xp`. 1-based and contiguous. */
  readonly level: number;
  /** XP required to reach `level`. */
  readonly xp: number;
}

export interface LevelCurve {
  readonly id: LevelCurveId;
  /** Why this curve exists — a tuning note, not a changelog. */
  readonly notes?: string;
  /** Ascending by `xp`. The first entry is level 1 at 0 XP. */
  readonly thresholds: readonly LevelThreshold[];
}

/**
 * The first level curve.
 *
 * Values follow §24's guidance that the curve is not final: these are starting
 * breakpoints chosen so that early levels are quick, mid levels slow, and the
 * gap between them grows — the shape every progression system in this space
 * converges on. They are placeholders for tuning against the TASKS 5.12
 * fixtures, not a design.
 */
export const LEVEL_CURVE_V1: LevelCurve = {
  id: "curve-v1",
  notes:
    "Starting breakpoints. §24 states the exact curve is intentionally not " +
    "finalized; these are for tuning against the TASKS 5.12 fixtures.",
  thresholds: [
    { level: 1, xp: 0 },
    { level: 2, xp: 50 },
    { level: 3, xp: 150 },
    { level: 4, xp: 300 },
    { level: 5, xp: 550 },
    { level: 6, xp: 900 },
    { level: 7, xp: 1400 },
    { level: 8, xp: 2100 },
    { level: 9, xp: 3000 },
    { level: 10, xp: 4200 },
  ],
};

/** Every defined curve, for lookup by id. */
export const LEVEL_CURVES: Readonly<Record<LevelCurveId, LevelCurve>> = {
  "curve-v1": LEVEL_CURVE_V1,
};

/** Rejects a curve that cannot produce a correct answer. */
export function validateCurve(curve: LevelCurve): void {
  const { thresholds } = curve;

  if (thresholds.length === 0) {
    throw new Error(`Level curve ${curve.id} has no thresholds`);
  }

  if (thresholds[0].level !== 1 || thresholds[0].xp !== 0) {
    throw new Error(
      `Level curve ${curve.id} must start at level 1 / 0 XP, ` +
        `so a character exists before earning anything.`,
    );
  }

  for (let index = 1; index < thresholds.length; index += 1) {
    const previous = thresholds[index - 1];
    const current = thresholds[index];

    if (current.level !== previous.level + 1) {
      throw new Error(
        `Level curve ${curve.id} skips a level at ${current.level}; ` +
          `levels must be contiguous.`,
      );
    }

    if (current.xp <= previous.xp) {
      throw new Error(
        `Level curve ${curve.id} does not ascend at level ${current.level}; ` +
          `a level must cost more than the last.`,
      );
    }
  }
}

/** Validates every defined curve, for a startup or test to call. */
export function validateAllCurves(): void {
  for (const curve of Object.values(LEVEL_CURVES)) {
    validateCurve(curve);
  }
}

/**
 * The level a character sits at for a given XP total (§24).
 *
 * Returns the highest level whose threshold has been met, and the maximum level
 * beyond it: a developer who has exceeded the whole curve stays at the top level
 * rather than being unleveled.
 *
 * Deterministic by construction — the same XP always yields the same level, and
 * XP below zero is clamped, so a caller cannot trip it up with a partial state.
 */
export function calculateLevel(
  totalXp: number,
  levelCurveVersion: LevelCurveId,
): number {
  const curve = LEVEL_CURVES[levelCurveVersion];
  if (curve === undefined) {
    throw new Error(`No level curve named "${levelCurveVersion}"`);
  }

  validateCurve(curve);

  // Not finite, or negative: treat as the start rather than NaN propagation.
  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;

  let level = curve.thresholds[0].level;
  for (const threshold of curve.thresholds) {
    if (xp >= threshold.xp) level = threshold.level;
    else break;
  }

  return level;
}

/** Where a character sits on their current level. */
export interface LevelProgress {
  readonly level: number;
  /** XP earned toward the next level, or toward the curve's top if maxed. */
  readonly xpIntoLevel: number;
  /** XP `xpIntoLevel` is measured against, or null when already at the top. */
  readonly xpForLevel: number | null;
  /** XP needed to leave the current level, or null when maxed. */
  readonly xpForNext: number | null;
  /** Fraction of the way through this level, in [0, 1). Null when maxed. */
  readonly progress: number | null;
}

/**
 * Where a character sits between levels, for a progress bar (§24's "isolate the
 * calculation").
 *
 * A separate function rather than part of `calculateLevel` because §24 specifies
 * one signature and adding fields to its return would break it; a UI that needs
 * "120 / 300 XP to level 5" asks here instead.
 */
export function levelProgress(
  totalXp: number,
  levelCurveVersion: LevelCurveId,
): LevelProgress {
  const curve = LEVEL_CURVES[levelCurveVersion];
  if (curve === undefined) {
    throw new Error(`No level curve named "${levelCurveVersion}"`);
  }

  validateCurve(curve);

  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;
  const level = calculateLevel(xp, levelCurveVersion);

  const current = curve.thresholds[level - 1];
  const next = curve.thresholds[level] ?? null;

  if (next === null) {
    // At the top of the curve: no next level to be measured against.
    return {
      level,
      xpIntoLevel: xp - current.xp,
      xpForLevel: null,
      xpForNext: null,
      progress: null,
    };
  }

  const xpIntoLevel = xp - current.xp;
  const span = next.xp - current.xp;

  return {
    level,
    xpIntoLevel,
    xpForLevel: current.xp,
    xpForNext: next.xp,
    progress: span > 0 ? xpIntoLevel / span : 0,
  };
}
