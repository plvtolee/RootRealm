import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TASKS 22 accessibility audit — colour contrast of the text tokens.
 *
 * Lighthouse caught a real failure on `/achievements`: an unearned card carried
 * `opacity-80`, which dimmed the card's *text* as well as its decoration and
 * pushed `--color-text-muted` to 3.53:1 and `--color-text-disabled` to 1.79:1,
 * against a 4.5:1 minimum.
 *
 * That bug lived in a component, not in a token, so a token test would not have
 * caught it. But the tokens are what it was measured against, and asserting them
 * is worth doing anyway: it pins the palette to the standard, so a future
 * "slightly dimmer" edit is caught in milliseconds rather than by re-running an
 * audit.
 *
 * The component-level cause is what `e2e` and Lighthouse cover. This file is the
 * floor beneath them.
 */

/** WCAG 2.1 AA for text at or below 18.66px bold / 24px regular. */
const AA_TEXT = 4.5;

/**
 * WCAG 1.4.11 exempts *inactive* UI components from 1.4.3, so a disabled label
 * needs only the 3:1 non-text minimum — it is still a perceivable, identifiable
 * element rather than invisible text.
 */
const AA_INACTIVE = 3;

/** Reads the `--rr-*` primitives out of the token source. */
function primitives(): Map<string, string> {
  const source = readFileSync(join(process.cwd(), "styles/tokens/color.css"), "utf8");
  const map = new Map<string, string>();

  for (const match of source.matchAll(/--rr-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    map.set(match[1], expandHex(match[2]));
  }

  return map;
}

/** `#abc` and `#aabbcc` both become `#aabbcc`. */
function expandHex(hex: string): string {
  const body = hex.slice(1);
  return body.length === 3
    ? `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
    : `#${body.slice(0, 6)}`;
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const raw = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio between two hex colours, from 1 to 21. */
function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const tokens = primitives();

describe("colour tokens", () => {
  it("defines every token this file asserts on", () => {
    // A regex typo that matches nothing would make every assertion below pass
    // vacuously, which is the worst possible failure for a contrast test.
    for (const name of ["bg", "surface", "surface-2", "text-primary", "text-secondary", "text-muted", "text-disabled"]) {
      expect(tokens.has(name), `--rr-${name} not found in color.css`).toBe(true);
    }
  });

  describe("meet WCAG AA against every surface they sit on", () => {
    const surfaces = ["bg", "surface", "surface-2"] as const;

    const cases = [
      { token: "text-primary", minimum: AA_TEXT, why: "body copy" },
      { token: "text-secondary", minimum: AA_TEXT, why: "supporting copy" },
      { token: "text-muted", minimum: AA_TEXT, why: "metadata and captions" },
      // Deliberately weaker: 1.4.3 exempts inactive components, and
      // `--color-text-disabled` exists to label them. It is still required to be
      // perceivable, so it is held to 3:1 rather than dropped entirely.
      { token: "text-disabled", minimum: AA_INACTIVE, why: "inactive controls" },
    ] as const;

    for (const { token, minimum, why } of cases) {
      for (const surface of surfaces) {
        it(`${token} on ${surface} (${why})`, () => {
          const ratio = contrast(tokens.get(token)!, tokens.get(surface)!);
          expect(
            ratio,
            `--rr-${token} on --rr-${surface} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`,
          ).toBeGreaterThanOrEqual(minimum);
        });
      }
    }
  });

  it("keeps the text scale ordered, so hierarchy survives", () => {
    // The four roles are a ramp. If two ever land on the same value the
    // hierarchy the design system describes stops existing, and every contrast
    // assertion would still pass.
    const ramp = ["text-primary", "text-secondary", "text-muted", "text-disabled"].map(
      (name) => luminance(tokens.get(name)!),
    );

    for (let i = 1; i < ramp.length; i += 1) {
      expect(ramp[i - 1], "text ramp is not strictly decreasing").toBeGreaterThan(ramp[i]);
    }
  });

  it("records the margin the muted token actually has", () => {
    // Not an assertion about a number that could drift — a note of where the
    // limit actually is, so the next person to dim it knows how little room
    // there is. On the default surface:
    const ratio = contrast(tokens.get("text-muted")!, tokens.get("surface")!);

    // Any element that dims this token — an `opacity-*` wrapper, a
    // translucent overlay — eats into that margin. `opacity-80` was exactly
    // that, and it is what broke `/achievements`.
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio).toBeLessThan(6);
  });
});