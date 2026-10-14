import { expect, test } from "@playwright/test";

import { INITIAL_VIEWPORT } from "../components/skill-tree/skill-tree-geometry";
import { SKILL_NODES } from "../components/skill-tree/skill-tree-data";

/**
 * RootRealm — skill tree hit targets (the second V1 audit finding).
 *
 * ```text
 * every node on the map → a target a fingertip can actually hit
 * ```
 *
 * Lighthouse found this, not this suite: `target-size` failed because the map's
 * node targets sat 21.9px from their neighbours against a 24px minimum, and
 * before the overlay alignment fix they overlapped outright — 15 of 36 pairs, so
 * some nodes genuinely could not be tapped.
 *
 * There are two independent ways this can break again, so there are two checks.
 */

/** The touch-target minimum, from DESIGN_SYSTEM §30 and WCAG 2.5.8. */
const MIN_TARGET_PX = 44;

/** The free space Lighthouse requires around a target. */
const MIN_FREE_SPACE_PX = 24;

/**
 * The scale at which the opening viewport draws one map unit, in CSS pixels.
 *
 * An `<svg>` with a `viewBox` fits the viewBox inside the element and centres
 * the slack (`preserveAspectRatio="xMidYMid meet"`), so the scale is whichever
 * ratio is smaller — height here, because the canvas is taller relative to its
 * width than the viewport is.
 */
function openingScale(canvas: { width: number; height: number }): number {
  return Math.min(
    canvas.width / INITIAL_VIEWPORT.width,
    canvas.height / INITIAL_VIEWPORT.height,
  );
}

/** The canvas box at 1440×900 — the desktop three-column layout. */
const DESKTOP_CANVAS = { width: 704, height: 546 };

test.describe("skill tree node spacing", () => {
  test("leaves room between every pair of targets at the opening zoom", () => {
    const scale = openingScale(DESKTOP_CANVAS);

    // Free space is what is left after both 44px targets are placed.
    const centreDistancePx = (a: number, b: number) => Math.abs(a - b) * scale;
    const tightest: string[] = [];

    for (let i = 0; i < SKILL_NODES.length; i += 1) {
      for (let j = i + 1; j < SKILL_NODES.length; j += 1) {
        const a = SKILL_NODES[i];
        const b = SKILL_NODES[j];

        // Distance between centres, which for two 44px boxes is what determines
        // the gap on whichever axis separates them.
        const dx = centreDistancePx(a.visualX, b.visualX);
        const dy = centreDistancePx(a.visualY, b.visualY);

        // The free space is the larger of the two axis gaps: two boxes that are
        // 10px apart horizontally and 200px apart vertically are not touching.
        const free = Math.max(dx, dy) - MIN_TARGET_PX;

        if (free < MIN_FREE_SPACE_PX) {
          tightest.push(
            `${a.id} ↔ ${b.id}: ${Math.round(free)}px free (needs ${MIN_FREE_SPACE_PX}px)`,
          );
        }
      }
    }

    expect(tightest, tightest.join("\n")).toEqual([]);
  });

  test("keep the Foundation row spread wide enough to clear the rule", () => {
    // This row is the one that regressed. It holds eleven nodes where every
    // other tier holds six, so it is the only place the arithmetic above is
    // close to the limit.
    const row = SKILL_NODES.filter((n) => n.visualY === 1000);
    expect(row.length).toBe(11);

    const xs = row.map((n) => n.visualX).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    const tightest = Math.min(...gaps);

    // The literal spacing is the thing worth pinning, because "no pair is too
    // close" can also be satisfied by quietly zooming the map out.
    expect(tightest).toBeGreaterThanOrEqual(140);

    // And the row stays centred, which is what keeps it symmetric on the map.
    expect(xs[0] + xs[xs.length - 1]).toBe(0);
  });

  test("do not overlap when the map is actually drawn", async ({ page }) => {
    await page.goto("/skill-tree");

    // The map is fetched client-side, so the targets are not in the server HTML.
    await expect(page.locator("[data-skill-node]").first()).toBeVisible({
      timeout: 30_000,
    });

    const { total, overlaps, visible } = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll<HTMLElement>("[data-skill-node]"));
      const boxes = all
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0);

      let overlaps = 0;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 0 && oy > 0) overlaps += 1;
        }
      }

      return { total: all.length, overlaps, visible: boxes.length };
    });

    expect(total).toBeGreaterThan(20);
    expect(visible).toBeGreaterThan(0);
    // This is the assertion that would have caught the original bug: targets
    // that sit on top of each other mean the upper one takes every tap.
    expect(overlaps, `${overlaps} overlapping node targets`).toBe(0);
  });

  test("align each target with the hexagon it belongs to", async ({ page }) => {
    await page.goto("/skill-tree");
    await expect(page.locator("[data-skill-node]").first()).toBeVisible({
      timeout: 30_000,
    });

    // The overlay is positioned imperatively from the same transform the `<svg>`
    // uses. It used to be a plain percentage of the *whole* map frame, which
    // stopped matching the drawing the moment the map opened zoomed in — the
    // direct cause of the overlaps above.
    //
    // So: recompute where each target *should* be, from its node's drawing
    // coordinates and the SVG's own fit-and-centre transform, and compare with
    // where it actually is.
    const results = await page.evaluate((viewportArg) => {
      const viewport = viewportArg as { x: number; y: number; width: number; height: number };
      const svg = document.querySelector("svg");
      const container = svg?.parentElement;
      if (!container) return null;

      const box = container.getBoundingClientRect();
      const scale = Math.min(box.width / viewport.width, box.height / viewport.height);
      const offX = (box.width - viewport.width * scale) / 2;
      const offY = (box.height - viewport.height * scale) / 2;

      // Reading the node's drawn centre straight off the `<path>` is the
      // strongest check available: it is the hexagon the visitor can see, not a
      // copy of the coordinates the overlay is derived from.
      const worst = { offset: 0, id: "" };

      for (const el of Array.from(
        container.querySelectorAll<HTMLElement>("[data-skill-node]"),
      )) {
        if (getComputedStyle(el).visibility === "hidden") continue;

        const id = el.dataset.skillNode ?? "";
        const shell = container.querySelector<SVGPathElement>(`[data-node-shell="${id}"]`);
        if (!shell) continue;

        const centre = shell.getBBox();
        const drawnX = offX + (centre.x + centre.width / 2 - viewport.x) * scale;
        const drawnY = offY + (centre.y + centre.height / 2 - viewport.y) * scale;

        const rect = el.getBoundingClientRect();
        const targetX = rect.left + rect.width / 2 - box.left;
        const targetY = rect.top + rect.height / 2 - box.top;

        const offset = Math.max(Math.abs(drawnX - targetX), Math.abs(drawnY - targetY));
        if (offset > worst.offset) {
          worst.offset = offset;
          worst.id = id;
        }
      }

      return worst;
    }, INITIAL_VIEWPORT);

    expect(results, "no measurable targets on the map").not.toBeNull();

    // Sub-pixel: the overlay and the SVG derive the same number the same way,
    // so they should agree to within rounding. Before the fix the worst
    // disagreement was the full letterbox offset, around 95px.
    expect(
      results!.offset,
      `target "${results!.id}" is ${results!.offset.toFixed(1)}px from its hexagon`,
    ).toBeLessThan(2);
  });
});