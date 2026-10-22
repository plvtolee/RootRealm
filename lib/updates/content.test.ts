import { describe, expect, it } from "vitest";

import {
  getPublishedUpdate,
  PUBLISHED_UPDATES,
  updatesForCategory,
} from "./content";

describe("published Home updates", () => {
  it("keeps every published update addressable by a unique slug", () => {
    const slugs = PUBLISHED_UPDATES.map((update) => update.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(getPublishedUpdate(slug)?.slug).toBe(slug);
    }
  });

  it("returns the complete feed in published order", () => {
    expect(updatesForCategory("all")).toEqual(PUBLISHED_UPDATES);
    expect(PUBLISHED_UPDATES.map((update) => update.publishedAt)).toEqual([
      "2026-10-15",
      "2026-10-12",
      "2026-10-10",
      "2026-10-09",
    ]);
  });

  it("filters without inventing content for an empty category", () => {
    expect(updatesForCategory("seasons").map((update) => update.category)).toEqual([
      "seasons",
    ]);
    expect(updatesForCategory("cosmetics").map((update) => update.category)).toEqual([
      "cosmetics",
    ]);
  });
});
