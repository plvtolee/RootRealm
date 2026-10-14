import { readdirSync, readFileSync } from "node:fs";
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

/**
 * The other way contrast breaks: not the token, but a wrapper around it.
 *
 * The `/achievements` failure was `opacity-80` on a whole card. The tokens were
 * fine; the card multiplied them against its own background and pushed muted text
 * from 4.98:1 to 3.53:1. **No token test can catch that** — the palette is
 * untouched.
 *
 * This rule closes the gap without adding a browser-audit dependency to CI: no
 * container in `components/` may be made translucent.
 *
 * ## Why "containers" and not "elements"
 *
 * Dimming a *decoration* — an icon, a border, a wash — is legitimate and used
 * throughout. Dimming something that *contains text* is the failure, because the
 * text inherits the multiplier without any token changing.
 *
 * This is a source-level rule rather than a computed-style one on purpose: it is
 * cheap enough to run in a unit test, it fails in milliseconds instead of after a
 * browser audit, and it names the cause rather than the symptom. A computed check
 * would pass here and catch only the one card, leaving the pattern free.
 */
describe("transparency", () => {
  /**
   * Walks every component source once, with comments stripped.
   *
   * Stripping matters: an earlier draft of this rule flagged its own
   * documentation, which described the `opacity-80` it had just removed. A check
   * that reads its own comments as code is a check nobody keeps.
   */
  function componentSources(): { readonly file: string; readonly body: string }[] {
    const files: { file: string; body: string }[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".tsx")) {
          files.push({ file: path, body: stripComments(readFileSync(path, "utf8")) });
        }
      }
    };

    for (const root of ["components", "app"]) walk(join(process.cwd(), root));
    return files;
  }

  /** Block and line comments, removed so prose about `opacity-80` is not code. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  }

  /**
   * `Card` must never be made translucent.
   *
   * The rule is this narrow on purpose. An earlier draft banned every `opacity-*`
   * in the components directory and immediately flagged four legitimate uses: an
   * `aria-hidden` decoration in the shop, a `hover:` state on a profile link, and
   * a skill-tree button whose only text is `sr-only` and therefore never painted.
   * A rule that cries wolf gets deleted.
   *
   * `Card` is the one surface guaranteed to contain visible text — that is what a
   * card *is* in this design system — and it is exactly where `/achievements` put
   * `opacity-80` and pushed muted text from 4.98:1 to 3.53:1. Banning it there is
   * narrow enough to be unambiguous and broad enough to prevent the whole family
   * of bug.
   *
   * To express "this particular element is unearned, so dim it", dim a leaf that
   * holds no words — an icon, a border, a wash — not the card.
   */
  it("is never applied to a Card", () => {
    const offenders: string[] = [];

    for (const { file, body } of componentSources()) {
      // Each `<Card ...>` opening tag, and whether it carries an opacity class.
      for (const match of body.matchAll(/<Card\b[\s\S]{0,600}?>/g)) {
        const tag = match[0];
        if (!/\b(?:[a-z-]+:)?opacity-(?!100\b)\d/.test(tag)) continue;

        const raw = readFileSync(file, "utf8");
        const line = raw.slice(0, raw.indexOf(match[0].trim().slice(0, 40))).split("\n").length;
        offenders.push(`${file}:${line}`);
      }
    }

    expect(
      offenders,
      `A translucent Card dims every word inside it:\n${offenders.join("\n")}\n\n` +
        `Express "unearned" with a border, a muted icon, or a status badge — not a multiplier.`,
    ).toEqual([]);
  });
});