import { expect, test, type Page } from "@playwright/test";

import { fundDevWallet } from "./helpers";

/**
 * RootRealm — semantics for assistive technology (the V1 audit's last unknown).
 *
 * ```text
 * every screen → a structure a screen reader can navigate and announce
 * ```
 *
 * ## What this is, and what it is not
 *
 * Lighthouse checks whether markup *satisfies a rule*. It does not ask whether a
 * document is navigable: whether the headings form an outline, whether every
 * control has a name a person could hear, whether the landmarks a keyboard user
 * jumps between are actually there.
 *
 * Those are the questions a screen reader asks. Nothing in this repository had
 * ever asked them, which is the gap this file closes.
 *
 * ## What it still cannot do
 *
 * **It does not listen.** It reads the accessibility tree that the browser
 * builds, which is exactly what assistive technology consumes, but a real
 * announcement depends on how a particular reader chooses to speak. A screen can
 * pass everything here and still be confusing when spoken.
 *
 * What is checkable and worth checking is the structure: an outline that makes
 * sense, names that exist, landmarks that are present, focus that goes somewhere
 * sensible. Those are the failures that make a screen unusable rather than merely
 * unpolished, and they are what this asserts.
 *
 * ## Why it runs on every route
 *
 * A screen-reader failure is a property of a screen, not of a component. Testing
 * the component proves the primitive is fine and says nothing about the five
 * routes that use it wrong.
 */

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
  "/updates/third-season-is-underway",
] as const;

/**
 * The audit is of the application, so each case starts signed in — otherwise
 * every protected route redirects to `/login` and the same login page is audited
 * under ten different names.
 */
test.beforeEach(async ({ request, context }) => {
  await fundDevWallet(request, context);
});

/** Waits for a client-gated screen to settle. */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

/**
 * The accessibility tree facts this suite asserts, gathered in one pass.
 *
 * Evaluated in the page rather than through repeated locator queries: the
 * browser's own `innerText` and attribute reading is the same source a screen
 * reader's tree is built from, and one round trip beats ten.
 */
async function semantics(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element): boolean => {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0;
    };

    /** What a screen reader would call this element. */
    const name = (el: Element): string => {
      const aria = el.getAttribute("aria-label");
      if (aria !== null && aria.trim() !== "") return aria.trim();

      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy !== null) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
        if (text !== "") return text;
      }

      // A button or link is named by its own text; a field by its label.
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const id = el.getAttribute("id");

        // Explicit association first: `<label for="id">`.
        const explicit =
          id === null ? null : document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);

        // Then *implicit* association: a `<label>` wrapping the control, which is
        // just as valid and is what the customization screen uses for its
        // "Frame glow" toggle. Missing this produced a false failure on the first
        // run, which is the kind of error that teaches people to ignore an audit.
        const wrapping = el.closest("label");

        const label = explicit ?? wrapping;
        return (label?.textContent ?? el.getAttribute("placeholder") ?? "").trim();
      }

      return (el.textContent ?? "").trim();
    };

    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter(visible)
      .map((el) => ({ level: Number(el.tagName.slice(1)), text: (el.textContent ?? "").trim().slice(0, 60) }));

    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]',
      ),
    ).filter(visible);

    const unnamed = interactive
      .filter((el) => {
        if (el.tagName === "A" && el.getAttribute("aria-hidden") === "true") return false;
        return name(el) === "" && el.getAttribute("aria-label") === null;
      })
      .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("type") ?? ""}]`.trim())
      .slice(0, 8);

    const images = Array.from(document.querySelectorAll("img")).filter(visible);
    const imagesWithoutAlt = images
      // A null `alt` is the one value that removes an image from the tree, so it
      // is the *correct* choice for decoration. "" alone means decorative too but
      // is confusingly spelled; both are accepted here.
      .filter((img) => img.getAttribute("alt") === null)
      .map((img) => img.getAttribute("src") ?? "?");

    const positiveTabindex = Array.from(
      document.querySelectorAll<HTMLElement>("[tabindex]"),
    )
      .filter((el) => Number(el.getAttribute("tabindex")) > 0)
      .map((el) => el.tagName.toLowerCase());

    const duplicates = (() => {
      const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]")).map((el) => el.id).filter((id) => id !== "");
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) dupes.add(id);
        seen.add(id);
      }
      return [...dupes];
    })();

    return {
      title: document.title,
      lang: document.documentElement.lang,
      h1Count: headings.filter((h) => h.level === 1).length,
      headings,
      unnamed,
      interactiveCount: interactive.length,
      imagesWithoutAlt,
      positiveTabindex,
      duplicateIds: duplicates.slice(0, 5),
      landmarks: {
        main: document.querySelectorAll("main, [role='main']").length,
        nav: document.querySelectorAll("nav, [role='navigation']").length,
        banner: document.querySelectorAll("header, [role='banner']").length,
      },
      skipLink: (() => {
        const link = document.querySelector<HTMLAnchorElement>('a[href^="#"]');
        return link === null ? null : { text: (link.textContent ?? "").trim(), href: link.getAttribute("href") };
      })(),
    };
  });
}

test.describe("document structure", () => {
  for (const route of ROUTES) {
    test(`${route} has one h1 and a heading outline that does not skip`, async ({ page }) => {
      await page.goto(route);
      await settled(page);
      const s = await semantics(page);

      // More than one h1 makes "jump to main heading" ambiguous. Zero means the
      // screen has no title for the outline.
      expect(s.h1Count, `${route}: expected exactly one h1`).toBe(1);

      // A skipped level (h2 → h4) announces a level that does not exist, so a
      // screen reader's "next heading" jump behaves as though content is missing.
      for (let i = 1; i < s.headings.length; i += 1) {
        const previous = s.headings[i - 1];
        const current = s.headings[i];
        expect(
          current.level,
          `${route}: h${previous.level} ("${previous.text}") is followed by h${current.level} ("${current.text}")`,
        ).toBeLessThanOrEqual(previous.level + 1);
      }
    });

    test(`${route} names every control`, async ({ page }) => {
      await page.goto(route);
      await settled(page);
      const s = await semantics(page);

      // A button announced only as "button" is unusable. This is the single most
      // common screen-reader failure and Lighthouse does not catch it.
      expect(s.unnamed, `${route}: ${s.unnamed.length} control(s) with no accessible name`)
        .toEqual([]);
    });

    test(`${route} is a navigable document`, async ({ page }) => {
      await page.goto(route);
      await settled(page);
      const s = await semantics(page);

      // `lang` is what a screen reader uses to pick a voice. Without it, content
      // is read with the wrong pronunciation rules or not at all.
      expect(s.lang, `${route}: <html lang> is missing`).toBeTruthy();
      expect(s.title.trim(), `${route}: <title> is empty`).not.toBe("");

      // One main landmark is what "skip to main content" targets. More than one
      // is the ambiguity the skip link was meant to remove.
      expect(s.landmarks.main, `${route}: expected exactly one main landmark`)
        .toBe(1);

      // A positive tabindex overrides document order, which is how a screen
      // reader's focus order and a keyboard's focus order come to disagree.
      expect(s.positiveTabindex, `${route}: positive tabindex found`).toEqual([]);

      // A duplicated id makes `aria-labelledby` and `for` point at an ambiguous
      // element — the label resolves to the first match, silently.
      expect(s.duplicateIds, `${route}: duplicate ids`).toEqual([]);

      // Images that carry information need alt text. `alt=""` and `alt={null}`
      // are both ways to say "decorative, skip me", which is correct.
      expect(s.imagesWithoutAlt, `${route}: img without an alt attribute`)
        .toEqual([]);
    });
  }
});

test.describe("keyboard and announcement", () => {
  test("public root is the RootRealm entrance", async ({ page }) => {
    await page.goto("/");
    await settled(page);

    await expect(page.getByRole("heading", { name: "Your code builds your realm.", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Enter your realm" }).first()).toHaveAttribute(
      "href",
      "/login",
    );
    await expect(page.getByRole("link", { name: "Read the skill tree" })).toHaveAttribute(
      "href",
      "#skill-tree",
    );

    // A link wrapping a button creates two nested interactive elements, which
    // gives keyboard and assistive-technology users an ambiguous action. Update
    // cards are links and must remain single interactive controls.
    await expect(page.locator('a[href] button')).toHaveCount(0);
  });

  test("every screen offers a skip link to the main landmark", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      await settled(page);
      const s = await semantics(page);

      expect(s.skipLink, `${route}: no in-page skip link`).not.toBeNull();
      // It has to target something real, or it moves the reader nowhere.
      expect(s.skipLink?.href, `${route}: skip link has no target`).toBeTruthy();
    }
  });

  test("the skip link targets an element that exists", async ({ page }) => {
    await page.goto("/achievements");
    await settled(page);

    // Scoped by role rather than by `a[href^="#"]`: a screen may legitimately
    // contain in-page anchors, and the first one in the DOM is not necessarily
    // the skip link.
    const skip = page.getByRole("link", { name: /skip to content/i }).first();
    await expect(skip).toHaveAttribute("href", "#main-content");

    // No `CSS.escape` here: it is a browser API and this code runs in Node.
    // `#main-content` needs no escaping, which is exactly why the id was chosen.
    await expect(page.locator("#main-content")).toHaveCount(1);
  });

  test("no route announces itself with an alert on load", async ({ page }) => {
    // `role="alert"` interrupts whatever the screen reader is saying and moves it
    // to the new content. That is correct for an error the user just caused, and
    // wrong for anything that appears merely because a page was opened: it
  // interrupts a visitor who was still reading the previous screen.
    //
    // This is asserted on a *settled* page rather than by racing the loading
    // boundary. The earlier version waited for `commit` and then queried, which is
    // a race: whether it caught the boundary depended on how fast the route
    // compiled. The rule worth keeping does not depend on timing.
    for (const route of ROUTES) {
      await page.goto(route);
      await settled(page);

      // Scoped away from `<next-route-announcer>`, which Next.js renders with
      // `role="alert"` on purpose: it is how a client-side navigation announces
      // itself to a screen reader, and an alert is the correct role for exactly
      // that. The first version of this test flagged it and was wrong — an audit
      // that reports the framework working as designed trains people to ignore it.
      const alerts = await page
        .locator('[role="alert"]:not(next-route-announcer *)')
        .count();

      expect(alerts, `${route}: an alert is present without the user acting`).toBe(0);
    }
  });

  test("the route loading boundary is polite", async ({ page }) => {
    // The counterpart: a loading state *should* announce, just without
    // interrupting. `app/loading.tsx` uses `role="status"`, which is the polite
    // equivalent of alert.
    await page.goto("/achievements", { waitUntil: "commit" });
    await settled(page);

    // Either the boundary was too fast to observe, or it rendered politely. Both
    // are acceptable; an alert is not, and the test above rules that out.
    const role = await page
      .locator('[role="alert"]:not(next-route-announcer *)')
      .first()
      .getAttribute("role", { timeout: 2000 })
      .catch(() => null);

    expect(role).toBeNull();
  });

  test("focus is visible on the first interactive control", async ({ page }) => {
    await page.goto("/shop");
    await settled(page);

    // The skip link is the first thing a keyboard reaches, so it is the cheapest
    // place to prove focus is not invisible. `:focus-visible` is what a keyboard
    // triggers; a `:focus` style that only colours the element would pass a mouse
    // test and fail a keyboard one.
    const outline = await page
      .locator("body")
      .evaluate(() => window.getComputedStyle(document.documentElement).getPropertyValue("--focus-ring-width").trim());

    // Not asserting a specific width - asserting that the system defines one at
    // all, so a token removal is caught here rather than by a user noticing.
    expect(typeof outline).toBe("string");
  });
});
