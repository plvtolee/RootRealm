import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Contrast, measured rather than believed (TASKS 17.5).
 *
 * Every value here is read out of `styles/tokens/color.css` at test time. A
 * hand-copied table is a snapshot that silently stops describing the palette the
 * day someone tunes a token; parsing the file means this test fails the moment a
 * contrast regresses, which is the only version of a contrast audit that is worth
 * keeping.
 *
 * ## Why the thresholds are what they are
 *
 * - Text: WCAG 2.2 SC 1.4.3 asks 4.5:1 for normal text. Every role in
 *   DESIGN_SYSTEM §5 is normal text — the largest is the 20px `heading`, well
 *   under the 24px large-text threshold — so 4.5 applies throughout.
 * - `text-disabled` is exempt (SC 1.4.3 excludes inactive controls). Its ratio
 *   is still asserted, as a ceiling, so it cannot be lightened into looking
 *   enabled.
 * - Borders are WCAG SC 1.4.11 territory (3:1), which applies to boundaries
 *   *required to identify* a control — not to every hairline. The measured
 *   values are pinned below so the exception is a recorded decision with numbers
 *   attached, rather than something nobody looked at.
 */

/** Relative luminance, per WCAG 2.x. */
function luminance(hex: string): number {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** The contrast ratio between two hex colours, 1–21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];

  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const CSS_PATH = fileURLToPath(new URL("../styles/tokens/color.css", import.meta.url));

/**
 * Every `--rr-*` primitive in the palette, parsed from the token file.
 *
 * Parsed rather than restated so the numbers below always describe the palette
 * that ships.
 */
const PRIMITIVES: Record<string, string> = (() => {
  const css = readFileSync(CSS_PATH, "utf8");
  const found: Record<string, string> = {};
  const pattern = /--rr-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi;

  for (const match of css.matchAll(pattern)) {
    found[match[1]] = match[2].toLowerCase();
  }

  return found;
})();

const BG = PRIMITIVES["bg"];
const SURFACE = PRIMITIVES["surface"];
const SURFACE_2 = PRIMITIVES["surface-2"];
const SURFACES = [
  ["bg", BG],
  ["surface", SURFACE],
  ["surface-secondary", SURFACE_2],
] as const;

describe("the palette parses (17.5)", () => {
  it("finds the primitives the audit depends on", () => {
    expect(BG).toMatch(/^#[0-9a-f]{6}$/);
    expect(SURFACE).toMatch(/^#[0-9a-f]{6}$/);
    expect(SURFACE_2).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("parses more than the surfaces, so a renamed token cannot pass silently", () => {
    expect(Object.keys(PRIMITIVES).length).toBeGreaterThan(15);
  });
});

describe("text contrast — 4.5:1 (17.5)", () => {
  const roles: Array<[role: string, primitive: string]> = [
    ["text-primary", "text-primary"],
    ["text-secondary", "text-secondary"],
    ["text-muted", "text-muted"],
    ["accent", "accent"],
    ["success", "emerald"],
    ["warning", "amber"],
    ["danger", "crimson"],
    ["info", "cyan"],
  ];

  for (const [role, primitive] of roles) {
    it(`--rr-${primitive} (${role}) reaches 4.5:1 on every surface`, () => {
      for (const [name, background] of SURFACES) {
        const ratio = contrastRatio(PRIMITIVES[primitive], background);

        // The message carries the measured value: a failure here is a design
        // decision to make, and the number is what makes it decidable.
        expect(
          ratio,
          `${role} on ${name} measures ${ratio.toFixed(2)}:1, below the 4.5:1 that WCAG 1.4.3 requires`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("--rr-text-muted passes on its darkest surface, which is the binding case", () => {
    // It is used on all three; the darkest is the one that decides the value.
    const ratio = contrastRatio(PRIMITIVES["text-muted"], SURFACE_2);

    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(6);
  });
});

describe("disabled text — exempt, but bounded (17.5)", () => {
  it("stays dimmer than muted, so an inactive control never looks active", () => {
    const disabled = luminance(PRIMITIVES["text-disabled"]);
    const muted = luminance(PRIMITIVES["text-muted"]);

    expect(disabled).toBeLessThan(muted);
  });

  it("does not reach the enabled-text threshold, which would defeat the exemption", () => {
    const ratio = contrastRatio(PRIMITIVES["text-disabled"], SURFACE_2);

    expect(ratio).toBeLessThan(4.5);
  });
});

describe("borders — SC 1.4.11, measured and recorded (17.5)", () => {
  it("pins the hairline borders at their measured ratios", () => {
    // These do not reach 3:1, and that is a deliberate position rather than an
    // oversight: 1.4.11 governs boundaries *required to identify* a control, and
    // in RootRealm every control is identified by more than its border — a
    // label, its text, a badge, or the accent that marks the selected state. A
    // card's hairline is decoration.
    //
    // The numbers are asserted so that raising a border for contrast is a
    // conscious change with its before-value recorded, rather than a silent one.
    const border = contrastRatio(PRIMITIVES["border"], SURFACE);
    const borderStrong = contrastRatio(PRIMITIVES["border-strong"], SURFACE);

    expect(border).toBeGreaterThan(1);
    expect(border).toBeLessThan(3);
    expect(borderStrong).toBeGreaterThan(border);
    expect(borderStrong).toBeLessThan(3);
  });

  it("keeps the selected state distinguishable without relying on the border", () => {
    // The active navigation item is accent text plus an accent underline. If
    // either the accent or the border is the only signal, the pair stops
    // working — so the accent has to carry it on its own.
    const accentOnSurface = contrastRatio(PRIMITIVES["accent"], SURFACE);

    expect(accentOnSurface).toBeGreaterThan(3);
  });
});