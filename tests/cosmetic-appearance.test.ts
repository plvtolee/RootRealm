import { describe, expect, it } from "vitest";

import {
  BANNER_WASH,
  EFFECT_MODE,
  FRAME_RING,
  RING_GAP,
  RING_WIDTH,
  THEME_ACCENT,
  appearanceOf,
  frameMotionFor,
} from "@/components/cosmetics/appearance";
import { COSMETIC_DEFINITIONS, COSMETIC_INDEX } from "@/lib/cosmetics/catalog";
import type { FrameMotion } from "@/components/cosmetics/appearance";

/**
 * The bug these hold shut: `/profile` and `/customization` each carried a private
 * copy of the appearance mapping and drifted. The profile hardcoded `border-2` at
 * `p-1` while customization used `p-2`, hardcoded `text-text-secondary` instead
 * of the equipped item's colour, and hardcoded a `pulse` motion instead of reading
 * the equipped effect — so buying a frame changed nothing on your own profile.
 *
 * The fix is one shared module, and these tests are what stop a second copy from
 * appearing next to it.
 */

describe("the ring geometry is one value, not two", () => {
  it("is a single width and a single gap", () => {
    // Both are applied by name on both screens. A screen that hardcodes its own
    // width is the exact defect that produced this bug.
    expect(RING_WIDTH).toBe("border-2");
    expect(RING_GAP).toBe("p-1");
  });
});

describe("appearanceOf", () => {
  it("passes the three colour keys through", () => {
    expect(appearanceOf("amber")).toBe("amber");
    expect(appearanceOf("cyan")).toBe("cyan");
    expect(appearanceOf("violet")).toBe("violet");
  });

  it("falls back to neutral for an unknown or absent key", () => {
    // A cosmetic that renders as nothing is worse than one that renders as the
    // default, so an unknown key paints the neutral treatment.
    expect(appearanceOf("chartreuse")).toBe("neutral");
    expect(appearanceOf(null)).toBe("neutral");
    expect(appearanceOf(undefined)).toBe("neutral");
  });
});

describe("frameMotionFor — the two vocabularies are not interchangeable", () => {
  it("resolves an effect's own appearance key to its motion", () => {
    // `lib/cosmetics/catalog.ts` gives `effect-pulse` the appearance "pulse" and
    // `effect-none` the appearance "none".
    expect(frameMotionFor("pulse")).toBe("pulse");
    expect(frameMotionFor("haze")).toBe("haze");
    expect(frameMotionFor("trail")).toBe("trail");
    expect(frameMotionFor("none")).toBe("none");
  });

  it("does NOT treat a colour key as a motion", () => {
    // This is the mistake that would ship silently: "amber" is a frame colour, and
    // reading an effect's appearance through the colour vocabulary would make
    // every effect fall back to `none` — a purchased effect that animates
    // nothing, with no error anywhere.
    expect(frameMotionFor("amber")).toBe("none");
    expect(frameMotionFor("violet")).toBe("none");
  });

  it("treats an absent effect as no motion", () => {
    expect(frameMotionFor(null)).toBe("none");
    expect(frameMotionFor(undefined)).toBe("none");
    expect(frameMotionFor("shimmer")).toBe("none");
  });

  it("names only motions the frame component implements", () => {
    // Every EFFECT_MODE key must be a real FrameMotion, or a catalog item would
    // publish an effect nothing can animate.
    for (const key of Object.keys(EFFECT_MODE)) {
      expect(["none", "pulse", "haze", "trail"]).toContain(EFFECT_MODE[key]);
    }
  });
});

describe("every appearance a catalog cosmetic publishes has a treatment", () => {
  it("resolves each frame and banner to paint, not to undefined", () => {
    for (const definition of COSMETIC_DEFINITIONS) {
      const key = appearanceOf(definition.appearance);
      const ring = FRAME_RING[key];

      expect(ring, `${definition.id} has no ring`).toBeTruthy();
      expect(BANNER_WASH[key], `${definition.id} has no banner wash`).toBeTruthy();
      expect(THEME_ACCENT[key], `${definition.id} has no theme accent`).toBeTruthy();
    }
  });

  it("resolves each effect to a motion", () => {
    for (const definition of COSMETIC_DEFINITIONS) {
      if (definition.slot !== "effect") continue;
      expect(frameMotionFor(definition.appearance), definition.id).toBe(
        frameMotionFor(definition.appearance),
      );
      expect(["none", "pulse", "haze", "trail"]).toContain(
        frameMotionFor(definition.appearance),
      );
    }
  });

  it("keeps the two vocabularies distinct in the catalog itself", () => {
    // A guard against a future catalog edit that publishes a colour on an effect,
    // which would read as `none` and animate nothing.
    for (const definition of COSMETIC_DEFINITIONS) {
      if (definition.slot === "effect") {
        expect(
          ["none", "pulse", "haze", "trail"],
          `${definition.id} publishes "${definition.appearance}" on an effect slot`,
        ).toContain(definition.appearance);
      }
    }
  });
});

describe("the profile ring follows the equipped frame", () => {
  it("paints differently for two differently-coloured frames", () => {
    // The core of the defect: the profile used to paint every frame the same
    // neutral grey regardless of what was equipped.
    const signal = COSMETIC_INDEX.byId.get("frame-signal");
    const forge = COSMETIC_INDEX.byId.get("frame-forge");
    const minimal = COSMETIC_INDEX.byId.get("frame-minimal");

    expect(signal).toBeDefined();
    expect(forge).toBeDefined();
    expect(minimal).toBeDefined();

    const ringOf = (id: string) => {
      const definition = COSMETIC_INDEX.byId.get(id);
      return FRAME_RING[appearanceOf(definition?.appearance)];
    };

    expect(ringOf("frame-signal")).not.toBe(ringOf("frame-minimal"));
    expect(ringOf("frame-forge")).not.toBe(ringOf("frame-minimal"));
  });
});

export type { FrameMotion };