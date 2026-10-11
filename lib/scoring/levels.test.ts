import { describe, expect, it } from "vitest";

import {
  LEVEL_CURVE_V1,
  calculateLevel,
  levelProgress,
  validateAllCurves,
  validateCurve,
} from "./levels";
import type { LevelCurve } from "./levels";

const KNOWN_LEVELS = LEVEL_CURVE_V1.thresholds.map((t) => t.xp);

/* -------------------------------------------------------------------------- */

describe("calculateLevel — §24", () => {
  it("puts a new character at level 1", () => {
    // A character exists before earning anything, so 0 XP must be defined.
    expect(calculateLevel(0, "curve-v1")).toBe(1);
  });

  it("reaches each level exactly at its threshold", () => {
    for (const threshold of LEVEL_CURVE_V1.thresholds) {
      expect(calculateLevel(threshold.xp, "curve-v1")).toBe(threshold.level);
    }
  });

  it("holds a level below its next threshold", () => {
    for (let index = 0; index + 1 < LEVEL_CURVE_V1.thresholds.length; index += 1) {
      const current = LEVEL_CURVE_V1.thresholds[index];
      const next = LEVEL_CURVE_V1.thresholds[index + 1];

      expect(calculateLevel(current.xp + 1, "curve-v1")).toBe(current.level);
      expect(calculateLevel(next.xp - 1, "curve-v1")).toBe(current.level);
    }
  });

  it("is deterministic (§24)", () => {
    for (const xp of [0, 1, 49, 50, 500, 4200, 99_999]) {
      expect(calculateLevel(xp, "curve-v1")).toBe(calculateLevel(xp, "curve-v1"));
    }
  });

  it("holds the top level beyond the whole curve", () => {
    // A developer who has passed every threshold stays at the top level rather
    // than becoming unleveled.
    expect(calculateLevel(4200, "curve-v1")).toBe(10);
    expect(calculateLevel(10_000, "curve-v1")).toBe(10);
  });

  it("clamps a negative total rather than returning NaN", () => {
    expect(calculateLevel(-50, "curve-v1")).toBe(1);
  });

  it("clamps a non-finite total", () => {
    // Infinity is not a real state — it can only come from a bug. Treating it
    // as "no XP earned" is the safe reading rather than handing out the top
    // level on a broken total.
    expect(calculateLevel(Number.NaN, "curve-v1")).toBe(1);
    expect(calculateLevel(Number.NEGATIVE_INFINITY, "curve-v1")).toBe(1);
    expect(calculateLevel(Number.POSITIVE_INFINITY, "curve-v1")).toBe(1);
  });

  it("floors a fractional total, matching integer XP awards", () => {
    expect(calculateLevel(49.9, "curve-v1")).toBe(1);
    expect(calculateLevel(50.1, "curve-v1")).toBe(2);
  });

  it("never decreases as XP increases (§24)", () => {
    let last = 0;
    for (let xp = 0; xp <= 4200; xp += 37) {
      const level = calculateLevel(xp, "curve-v1");
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it("costs more XP at every later level", () => {
    // The shape every progression system converges on: early levels quick, the
    // gap growing. §24 asks for "easy to tune", which means visible.
    for (let index = 1; index < LEVEL_CURVE_V1.thresholds.length; index += 1) {
      const previous = LEVEL_CURVE_V1.thresholds[index - 1];
      const current = LEVEL_CURVE_V1.thresholds[index];
      const previousGap = index > 1
        ? previous.xp - LEVEL_CURVE_V1.thresholds[index - 2].xp
        : previous.xp;

      expect(current.xp - previous.xp).toBeGreaterThan(previousGap);
    }
  });

  it("throws for an unknown curve", () => {
    expect(() => calculateLevel(0, "curve-v2" as never)).toThrow(
      /No level curve named/,
    );
  });
});

describe("validateCurve", () => {
  const good: LevelCurve = {
    id: "curve-v1",
    thresholds: [
      { level: 1, xp: 0 },
      { level: 2, xp: 50 },
    ],
  };

  it("accepts the shipped curve", () => {
    expect(() => validateCurve(LEVEL_CURVE_V1)).not.toThrow();
    expect(() => validateAllCurves()).not.toThrow();
  });

  it("rejects a curve with no thresholds", () => {
    expect(() => validateCurve({ id: "curve-v1", thresholds: [] })).toThrow(
      /no thresholds/,
    );
  });

  it("rejects a curve that does not start at level 1 / 0 XP", () => {
    expect(() =>
      validateCurve({ ...good, thresholds: [{ level: 1, xp: 100 }, { level: 2, xp: 200 }] }),
    ).toThrow(/level 1 \/ 0 XP/);

    expect(() =>
      validateCurve({ ...good, thresholds: [{ level: 2, xp: 0 }, { level: 3, xp: 50 }] }),
    ).toThrow(/level 1 \/ 0 XP/);
  });

  it("rejects a skipped level", () => {
    expect(() =>
      validateCurve({ ...good, thresholds: [{ level: 1, xp: 0 }, { level: 3, xp: 50 }] }),
    ).toThrow(/skips a level/);
  });

  it("rejects a threshold that does not ascend", () => {
    expect(() =>
      validateCurve({ ...good, thresholds: [{ level: 1, xp: 0 }, { level: 2, xp: 0 }] }),
    ).toThrow(/does not ascend/);

    expect(() =>
      validateCurve({ ...good, thresholds: [{ level: 1, xp: 0 }, { level: 2, xp: -10 }] }),
    ).toThrow(/does not ascend/);
  });

  it("validates on construction rather than on call", () => {
    // A malformed curve should be a startup failure, not a wrong answer for one
    // developer.
    const broken: LevelCurve = {
      id: "curve-v1",
      thresholds: [{ level: 1, xp: 0 }, { level: 3, xp: 50 }],
    };

    expect(() => calculateLevel(50, "curve-v1")).not.toThrow();
    expect(() => validateCurve(broken)).toThrow();
  });
});

describe("levelProgress", () => {
  it("measures XP into the current level", () => {
    expect(levelProgress(0, "curve-v1")).toMatchObject({
      level: 1,
      xpIntoLevel: 0,
      xpForLevel: 0,
      xpForNext: 50,
      progress: 0,
    });
  });

  it("measures a fraction through a level", () => {
    expect(levelProgress(25, "curve-v1")).toMatchObject({
      level: 1,
      xpIntoLevel: 25,
      progress: 0.5,
    });
  });

  it("reports no next level at the top of the curve", () => {
    const result = levelProgress(10_000, "curve-v1");

    expect(result.level).toBe(10);
    expect(result.xpForNext).toBeNull();
    expect(result.progress).toBeNull();
  });

  it("starts a new level's progress at zero", () => {
    expect(levelProgress(150, "curve-v1")).toMatchObject({
      level: 3,
      xpIntoLevel: 0,
      progress: 0,
    });
    expect(levelProgress(299, "curve-v1")).toMatchObject({
      level: 3,
      xpIntoLevel: 149,
    });
  });

  it("agrees with calculateLevel on the level", () => {
    for (const xp of [0, 1, 49, 50, 149, 150, 300, 4199, 4200, 9999]) {
      expect(levelProgress(xp, "curve-v1").level).toBe(calculateLevel(xp, "curve-v1"));
    }
  });

  it("keeps progress within [0, 1)", () => {
    for (let xp = 0; xp <= 4200; xp += 31) {
      const { progress } = levelProgress(xp, "curve-v1");
      if (progress === null) continue;
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThan(1);
    }
  });

  it("clamps a negative total the same way", () => {
    expect(levelProgress(-100, "curve-v1")).toMatchObject({
      level: 1,
      xpIntoLevel: 0,
    });
  });

  it("throws for an unknown curve", () => {
    expect(() => levelProgress(0, "curve-v9" as never)).toThrow(
      /No level curve named/,
    );
  });
});

describe("the curve as data", () => {
  it("is versioned, so a historical character keeps its curve (§3, §24)", () => {
    // A curve named in a transaction can be re-evaluated, because the
    // breakpoints it used are still available.
    expect(LEVEL_CURVE_V1.id).toBe("curve-v1");
    expect(KNOWN_LEVELS[0]).toBe(0);
  });

  it("tunes by editing a number, not an expression", () => {
    // §24 "easy to tune": early progression is one breakpoint.
    const faster: LevelCurve = {
      ...LEVEL_CURVE_V1,
      id: "curve-v1",
      thresholds: [{ level: 1, xp: 0 }, { level: 2, xp: 25 }],
    };

    expect(calculateLevel(24, "curve-v1")).toBe(1);
    validateCurve(faster);
  });
});
