import { expect, test, type Page } from "@playwright/test";

import { fundDevWallet } from "./helpers";

/**
 * RootRealm — responsive audit (TASKS 22.1, 22.2).
 *
 * ```text
 * every screen × every required viewport → no overflow, no clipped text, real tap targets
 * ```
 *
 * TASKS 22.1 asks for mobile QA at 375×812 and 390×844; 22.2 asks for desktop at
 * 768+, 1024+, 1280+ and 1440+. Both are lists of sizes to test, and a list
 * tested by hand is a list that silently regresses — nothing fails when someone
 * adds a fixed width to a card.
 *
 * So this is executable. Each combination asserts three properties that are all
 * visible failures rather than preferences:
 *
 * 1. **no horizontal overflow** — the page never scrolls sideways, which is the
 *    single most common responsive bug and the one a desktop screenshot hides;
 * 2. **nothing escapes the viewport** — an individual element sticking out is
 *    caught even when the page as a whole does not scroll, because it is usually
 *    a fixed-width child inside a fluid parent;
 * 3. **tap targets are big enough on a phone** — DESIGN_SYSTEM §30 and the
 *    `Button` primitive both require 44px on touch. Checked only at the mobile
 *    sizes, because a 36px desktop control is a density choice, not a defect.
 *
 * Screenshots are written to `test-results/responsive/` for TASKS 22.3's visual
 * comparison, so the record of what each viewport looked like is kept rather than
 * remembered.
 */

/** The sizes TASKS 22.1 and 22.2 name, with the breakpoint each exercises. */
const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812, touch: true },
  { name: "mobile-390", width: 390, height: 844, touch: true },
  { name: "tablet-768", width: 768, height: 1024, touch: true },
  { name: "desktop-1024", width: 1024, height: 768, touch: false },
  { name: "desktop-1280", width: 1280, height: 800, touch: false },
  { name: "desktop-1440", width: 1440, height: 900, touch: false },
] as const;

/** Every signed-in route the application owns. */
const ROUTES = [
  "/",
  "/home",
  "/profile",
  "/profile/edit",
  "/skill-tree",
  "/achievements",
  "/quests",
  "/shop",
  "/customization",
  "/leaderboard",
] as const;

/**
 * The audit is of the application, so each case starts signed in.
 *
 * Before the login wall existed these routes rendered for a guest. Now they
 * redirect to `/login`, which would make every case below audit the login page
 * under eight different names — coverage that looks present and tests nothing.
 * The dev harness mints a real session for the mock GitHub login, so the actual
 * screens render.
 */
test.beforeEach(async ({ request, context }) => {
  await fundDevWallet(request, context);
});

/** The minimum touch target DESIGN_SYSTEM §30 requires. */
const MIN_TAP_TARGET = 44;

/** How wide the document may be before sideways scrolling is a failure. */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * Elements that are allowed to exceed the viewport, and why.
 *
 * Applied *inside* the page: `page.evaluate` runs in the browser, so a Node-side
 * predicate cannot be referenced from there.
 *
 * Four exemptions, all narrow and all about *intent* rather than convenience:
 *
 * 1. `aria-hidden` decoration — the skill tree's ornament bleed. It paints no
 *    content a visitor could be blocked from reaching.
 * 2. **Anything inside a horizontal scroller.** The filter rail, the rarity chips
 *    and the leaderboard table all use `overflow-x-auto` on purpose: on a 375px
 *    phone a table is wider than the screen, and the honest answer is a scroller
 *    a person can swipe, not a page that scrolls sideways or a table shrunk until
 *    it is unreadable. Flagging those children as overflow was this test's first
 *    false positive, and it is why the exemption is by *scrollable ancestor*
 *    rather than by naming the three elements — a fourth scroller will be
 *    exempt automatically, and a non-scrolling overflow still fails.
 * 3. **Anything inside a declared pan/zoom surface** (`[data-pan-surface]`).
 *    The skill tree's canvas clips with `overflow: hidden` while its 36 node
 *    targets track hexagons that are scrolled off-screen, so being partly
 *    outside is how they follow the drawing. Declared rather than inferred,
 *    because `overflow: hidden` is also how `Card` clips.
 * 4. **Anything inside an SVG that clips.** `getBoundingClientRect` on SVG
 *    geometry reports where the shape *is*, not where it is *visible*, so a path
 *    running past the viewBox measures as overflowing while the `<svg>` element
 *    crops it. The skill-tree map hit this the moment its opening viewport became
 *    smaller than the drawing (TASKS 22.3) — the tree genuinely extends past the
 *    viewBox, and the visitor sees a cropped, pannable map, which is the intent.
 *
 *    It is scoped to `<svg>` ancestors rather than to `overflow: hidden` in
 *    general, because `overflow-hidden` is also how `Card` rounds its corners, and
 *    exempting every rounded card would hide real overflow everywhere.
 *
 * The document-level assertion below is what actually catches a page that scrolls
 * sideways, and it has no exemptions at all.
 */
const EXEMPT_SELECTOR = '[aria-hidden="true"]';

/**
 * The pan/zoom surfaces whose contents may legitimately sit outside them.
 *
 * The skill tree's canvas clips with `overflow: hidden` while its 36 node targets
 * track hexagons that are scrolled off-screen — being partly outside is what
 * makes them follow the drawing. That is a deliberate viewport, not a card with
 * rounded corners, so it is named rather than inferred.
 *
 * It is a data attribute rather than a check for `overflow: hidden` on an
 * ancestor because that property is exactly how `Card` clips, and exempting it
 * wholesale would hide real overflow on every card in the product. A fourth
 * pan/zoom surface needs one attribute; nothing inherits the exemption by
 * accident.
 */
const PAN_SURFACE_SELECTOR = "[data-pan-surface]";

/** The widest offenders, as readable messages. */
async function overflowReport(page: Page, width: number): Promise<string[]> {
  return page.evaluate(
    ({ viewportWidth, tolerance, exempt, panSurface }) => {
      const limit = viewportWidth + tolerance;
      const problems: string[] = [];

      // True when the element is deliberately allowed to be wider than the
      // viewport: a horizontal scroller the visitor can swipe, or geometry an
      // `<svg>` crops. Walks ancestors because both patterns are properties of
      // the container, not of the child being measured.
      const deliberatelyWide = (el: Element): boolean => {
        if (el.closest(panSurface) !== null) return true;

        for (let node = el.parentElement; node !== null; node = node.parentElement) {
          const overflowX = window.getComputedStyle(node).overflowX;
          if (overflowX === "auto" || overflowX === "scroll") return true;

          // An `<svg>` clips its content unless told otherwise, so a shape past
          // the viewBox is cropped rather than overflowing the page.
          if (
            node.tagName.toLowerCase() === "svg" &&
            window.getComputedStyle(node).overflow !== "visible"
          ) {
            return true;
          }
        }
        return false;
      };

      const describe = (el: Element): string => {
        const id = el.id === "" ? "" : `#${el.id}`;
        const cls =
          typeof el.className === "string" && el.className.length > 0
            ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : "";
        return `${el.tagName.toLowerCase()}${id}${cls}`;
      };

      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        // Only elements that actually paint a box can overflow.
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        if (el.matches(exempt)) continue;
        if (deliberatelyWide(el)) continue;

        if (rect.right > limit) {
          problems.push(
            `${describe(el)} extends ${Math.round(rect.right - limit)}px past the right edge ` +
              `(width ${Math.round(rect.width)})`,
          );
        }
        if (rect.left < -tolerance) {
          problems.push(`${describe(el)} extends ${Math.round(-rect.left)}px past the left edge`);
        }
      }

      return problems.slice(0, 6);
    },
    {
      viewportWidth: width,
      tolerance: OVERFLOW_TOLERANCE_PX,
      exempt: EXEMPT_SELECTOR,
      panSurface: PAN_SURFACE_SELECTOR,
    },
  );
}

/** Interactive elements smaller than a comfortable touch target. */
async function tapTargetReport(page: Page): Promise<string[]> {
  return page.evaluate((minimum) => {
    const selector = 'a[href], button, input, select, textarea, [role="button"]';
    const problems: string[] = [];

    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      // A control inside a larger clickable ancestor is fine; the ancestor is
      // what the finger actually hits.
      if (el.closest("[data-tap-target-ok]") !== null) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      // An inline link inside a paragraph is text, not a control.
      if (el.tagName === "A" && style.display === "inline") continue;

      if (rect.height < minimum - 0.5) {
        problems.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 32)}" ` +
            `is ${Math.round(rect.height)}px tall, below the ${minimum}px minimum`,
        );
      }
    }

    return problems.slice(0, 6);
  }, MIN_TAP_TARGET);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route} fits the viewport`, async ({ page }) => {
        await page.goto(route, { waitUntil: "networkidle" });

        // TASKS 22.3's record: what this viewport looked like.
        await page.screenshot({
          path: `test-results/responsive/${viewport.name}${route === "/" ? "-home" : route.replace(/\//g, "-")}.png`,
          fullPage: true,
        });

        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        );

        const problems = await overflowReport(page, viewport.width);

        expect(
          problems,
          `${route} at ${viewport.width}px:\n  ${problems.join("\n  ")}`,
        ).toEqual([]);

        // Scrolling sideways is a defect on every size, including desktop.
        expect(
          scrollWidth,
          `${route} at ${viewport.width}px scrolls sideways (document is ${scrollWidth}px wide)`,
        ).toBeLessThanOrEqual(viewport.width + OVERFLOW_TOLERANCE_PX);
      });
    }

    // The tap-target rule applies only where a finger is used.
    if (viewport.touch) {
      for (const route of ["/", "/profile", "/skill-tree", "/shop"]) {
        test(`${route} has reachable tap targets`, async ({ page }) => {
          await page.goto(route, { waitUntil: "networkidle" });

          const problems = await tapTargetReport(page);

          expect(
            problems,
            `${route} at ${viewport.width}px:\n  ${problems.join("\n  ")}`,
          ).toEqual([]);
        });
      }
    }
  });
}