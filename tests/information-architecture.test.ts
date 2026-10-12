import { describe, expect, it } from "vitest";

import { isNavActive, NAV_ITEMS } from "@/components/layout/nav-items";

/**
 * The information architecture is a design decision, so it is asserted rather
 * than assumed. TASKS 1.5 names five mobile destinations and DESIGN_SYSTEM §22
 * repeats them; this test is what stops one of them being quietly traded for a
 * destination nobody asked for, which is exactly what happened before the Phase
 * 17 audit (17.1).
 */
const SPECIFIED = [
  { href: "/", label: "Home" },
  { href: "/skill-tree", label: "Skill Tree" },
  { href: "/achievements", label: "Achievements" },
  { href: "/shop", label: "Shop" },
  { href: "/profile", label: "Profile" },
];

describe("primary navigation (17.1)", () => {
  it("is exactly TASKS 1.5's five destinations, in order", () => {
    expect(NAV_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual(SPECIFIED);
  });

  it("has no duplicate routes", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every destination an icon", () => {
    for (const item of NAV_ITEMS) {
      expect(typeof item.icon).toBe("function");
    }
  });

  it("uses one label for the visible text and the accessible name", () => {
    // WCAG 2.5.3 (Label in Name). The nav bars derive the accessible name from
    // the visible text, so a second label field would be a second chance to
    // disagree with itself.
    for (const item of NAV_ITEMS) {
      expect(item.label).toBe(item.label.trim());
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps the bar to five destinations, which is the design decision", () => {
    expect(NAV_ITEMS.length).toBe(5);
  });
});

describe("active state (17.1)", () => {
  it("marks only the exact home route as home", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/shop", "/")).toBe(false);
  });

  it("keeps a destination active across its sub-routes", () => {
    expect(isNavActive("/profile/edit", "/profile")).toBe(true);
    expect(isNavActive("/skill-tree/node", "/skill-tree")).toBe(true);
  });

  it("does not treat a prefix as a match", () => {
    expect(isNavActive("/shopkeeper", "/shop")).toBe(false);
  });

  it("marks exactly one destination active on any primary route", () => {
    for (const item of NAV_ITEMS) {
      const active = NAV_ITEMS.filter((entry) => isNavActive(item.href, entry.href));

      expect(active).toHaveLength(1);
    }
  });
});