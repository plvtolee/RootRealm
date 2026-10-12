import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reduced-motion preference changes (TASKS 17.4).
 *
 * `lib/motion.ts` is a client module that imports GSAP, so this test stubs the
 * two browser things it touches — `matchMedia` and the computed styles — and
 * exercises the subscription logic rather than any animation. The animation
 * helpers themselves are unchanged and still guard on the same preference.
 */

type Listener = (event: { matches: boolean }) => void;

/** A MediaQueryList stand-in whose `matches` the test controls. */
class FakeMediaQueryList {
  matches = false;
  private listeners = new Set<Listener>();

  addEventListener(_event: string, listener: Listener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_event: string, listener: Listener): void {
    this.listeners.delete(listener);
  }

  /** The browser changing the OS preference. */
  set(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) {
      listener({ matches });
    }
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}

let query: FakeMediaQueryList;

beforeEach(() => {
  vi.resetModules();
  query = new FakeMediaQueryList();

  const matchMedia = (media: string) => {
    if (media.includes("prefers-reduced-motion")) {
      return query as unknown as MediaQueryList;
    }
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  };

  // No jsdom in this project (no new dependencies), so the module's two browser
  // entry points are stubbed: `window.matchMedia` for the preference, and a
  // `getComputedStyle` that returns an empty declaration.
  vi.stubGlobal("window", { matchMedia });
  vi.stubGlobal("matchMedia", matchMedia);
  vi.stubGlobal("document", { documentElement: {} });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: () => "",
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadMotion() {
  return import("@/lib/motion");
}

describe("reduced motion preference (17.4)", () => {
  it("reads the current preference", async () => {
    const motion = await loadMotion();
    expect(motion.prefersReducedMotion()).toBe(false);

    query.set(true);
    expect(motion.prefersReducedMotion()).toBe(true);
  });

  it("tells a subscriber immediately, so no separate read is needed", async () => {
    query.set(true);
    const motion = await loadMotion();
    const seen: boolean[] = [];

    motion.onReducedMotionChange((reduced) => seen.push(reduced));

    expect(seen).toEqual([true]);
  });

  it("notifies every subscriber when the preference changes", async () => {
    const motion = await loadMotion();
    const first: boolean[] = [];
    const second: boolean[] = [];

    motion.onReducedMotionChange((reduced) => first.push(reduced));
    motion.onReducedMotionChange((reduced) => second.push(reduced));

    query.set(true);

    expect(first).toEqual([false, true]);
    expect(second).toEqual([false, true]);
  });

  it("stops notifying after unsubscribe", async () => {
    const motion = await loadMotion();
    const seen: boolean[] = [];

    const stop = motion.onReducedMotionChange((reduced) => seen.push(reduced));
    query.set(true);
    stop();
    query.set(false);

    expect(seen).toEqual([false, true]);
  });

  it("keeps one media-query listener for the whole app, however many subscribers", async () => {
    const motion = await loadMotion();

    const stops = [
      motion.onReducedMotionChange(() => {}),
      motion.onReducedMotionChange(() => {}),
      motion.onReducedMotionChange(() => {}),
    ];

    // One query listener, not one per surface: the query outlives the surfaces.
    expect(query.subscriberCount).toBe(1);

    stops[0]();
    stops[1]();
    expect(query.subscriberCount).toBe(1);

    stops[2]();
    expect(query.subscriberCount).toBe(0);
  });
});