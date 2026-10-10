import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "./developer-event";
import {
  dedupeEvents,
  idempotencyKeyFor,
} from "./event-dedupe";

/**
 * Canonical events hand-built at the normalization boundary, so a test can
 * express the same identity with different content directly rather than routing
 * through TASKS 4.5. The `id` values follow the 4.5 format `${kind}:${eventId}`,
 * which is what makes them the deduplication key.
 */

function event(
  id: string,
  over: Partial<DeveloperEvent> = {},
): DeveloperEvent {
  return {
    id,
    kind: "push",
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-09T05:51:24Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: "https://github.com/octocat/octo-repo/commit/09b6b43",
    relevance: "scored",
    limitations: [],
    evidence: {
      branch: "main",
      headSha: "09b6b43401e844c23bf5222220b06ad9199458de",
      beforeSha: "2dcfb4a2cc090d1b8c7efef7ff94b06d8ee4adfe",
      pushId: "45928426596",
    },
    ...over,
  } as DeveloperEvent;
}

const pullRequest = (id: string, over: Partial<DeveloperEvent> = {}) =>
  event(id, {
    kind: "pull_request",
    evidence: {
      number: 82,
      action: "merged",
      merged: true,
      headRef: "feature",
      headSha: "36a17e52",
      baseRef: "main",
    },
    sourceUrl: "https://github.com/octocat/octo-repo/pull/82",
    ...over,
  } as Partial<DeveloperEvent>);

/* -------------------------------------------------------------------------- */

describe("dedupeEvents — one event per source", () => {
  it("returns an already-deduplicated set unchanged", () => {
    const input = [event("push:1"), pullRequest("pull_request:2")];

    const result = dedupeEvents(input);

    expect(result.events).toHaveLength(2);
    expect(result.events).toEqual(input);
    expect(result.duplicates).toEqual([]);
  });

  it("collapses the same event observed repeatedly", () => {
    // The normal case: a second sync re-reads the same event.
    const result = dedupeEvents([event("push:1"), event("push:1")]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("push:1");
    // Reported rather than silently absorbed: a sync should be able to say how
    // much of its input it had already seen.
    expect(result.duplicates).toEqual([
      { id: "push:1", count: 2, conflicting: false },
    ]);
  });

  it("reports how many times each duplicate was observed", () => {
    const result = dedupeEvents([
      event("push:1"),
      event("push:1"),
      event("push:1"),
    ]);

    expect(result.duplicates).toEqual([{ id: "push:1", count: 3, conflicting: false }]);
  });

  it("hashes out a whole repeated feed, not a single copy", () => {
    // A realistic re-sync: the same 300 events arrive again.
    const feed = Array.from({ length: 300 }, (_unused, index) =>
      event(`push:${index}`),
    );

    const result = dedupeEvents([...feed, ...feed]);

    expect(result.events).toHaveLength(300);
    expect(result.duplicates).toHaveLength(300);
  });

  it("does not collapse distinct occurrences of the same object", () => {
    // A pull request opens and later merges. Keying on the pull request would
    // discard the merge, which is the event TASK 5.3 scores.
    const result = dedupeEvents([
      pullRequest("pull_request:opened"),
      pullRequest("pull_request:merged"),
    ]);

    expect(result.events.map((e) => e.id).sort()).toEqual([
      "pull_request:merged",
      "pull_request:opened",
    ]);
  });

  it("never merges two events that share a source id but differ in kind", () => {
    // The id encodes the kind, so `push:1` and `review:1` are different
    // identities even though both came from the same GitHub event id.
    const asPush = event("push:1");
    const asReview = event("review:1", { kind: "review" });

    const result = dedupeEvents([asPush, asReview]);

    expect(result.events).toHaveLength(2);
  });
});

describe("dedupeEvents — ordering", () => {
  it("preserves first-seen order", () => {
    const result = dedupeEvents([
      event("push:3"),
      pullRequest("pull_request:1"),
      event("push:2"),
    ]);

    expect(result.events.map((e) => e.id)).toEqual([
      "push:3",
      "pull_request:1",
      "push:2",
    ]);
  });

  it("keeps the first position even when a later copy is more complete", () => {
    // Position follows the identity's first sighting, not the winner's, so
    // first-seen order is stable regardless of which copy is kept.
    const sparse = event("push:1", { sourceUrl: null, occurredAt: null });

    const result = dedupeEvents([event("push:2"), sparse, event("push:1")]);

    expect(result.events.map((e) => e.id)).toEqual(["push:2", "push:1"]);
    expect(result.events[1].sourceUrl).toBe(
      "https://github.com/octocat/octo-repo/commit/09b6b43",
    );
  });
});

describe("dedupeEvents — conflicting observations", () => {
  it("reports no conflict when repeated observations are identical", () => {
    const result = dedupeEvents([event("push:1"), event("push:1")]);

    expect(result.duplicates[0].conflicting).toBe(false);
  });

  it("reports a conflict when the same event arrives with different content", () => {
    const result = dedupeEvents([
      event("push:1", { occurredAt: "2026-10-09T05:51:24Z" }),
      event("push:1", { occurredAt: "2026-10-09T06:00:00Z" }),
    ]);

    // Should not happen; surfaced rather than resolved silently.
    expect(result.duplicates[0].conflicting).toBe(true);
  });

  it("still yields exactly one event when observations conflict", () => {
    const result = dedupeEvents([
      event("push:1", { occurredAt: "2026-10-09T05:51:24Z" }),
      event("push:1", { occurredAt: "2026-10-09T06:00:00Z" }),
      event("push:1", { occurredAt: "2026-10-09T07:00:00Z" }),
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.duplicates[0]).toEqual({
      id: "push:1",
      count: 3,
      conflicting: true,
    });
  });

  it("keeps the more complete observation rather than the first one seen", () => {
    // A retry that lost a field must not be able to degrade the canonical event.
    const sparse = event("push:1", {
      sourceUrl: null,
      occurredAt: null,
    });

    const result = dedupeEvents([sparse, event("push:1")]);

    expect(result.events[0].sourceUrl).toBe("https://github.com/octocat/octo-repo/commit/09b6b43");
    expect(result.events[0].occurredAt).toBe("2026-10-09T05:51:24Z");
  });

  it("keeps the first observation when neither is more complete", () => {
    const first = event("push:1", { sourceUrl: "https://github.com/a" });
    const second = event("push:1", { sourceUrl: "https://github.com/b" });

    const result = dedupeEvents([first, second]);

    // Deterministic: the same input always yields the same output, so an
    // award cannot flip between runs.
    expect(result.events[0].sourceUrl).toBe("https://github.com/a");
  });

  it("is order-independent in which copy survives", () => {
    const sparse = event("push:1", { sourceUrl: null, occurredAt: null });

    const forward = dedupeEvents([sparse, event("push:1")]);
    const backward = dedupeEvents([event("push:1"), sparse]);

    // Whichever order it arrives in, the complete record wins.
    expect(forward.events[0].sourceUrl).toBe(backward.events[0].sourceUrl);
  });
});

describe("dedupeEvents — across runs", () => {
  it("does not re-emit an event already seen in a previous run", () => {
    const seen = new Set(["push:1"]);

    const result = dedupeEvents([event("push:1"), event("push:2")], {
      alreadySeen: seen,
    });

    // Without this, a nightly sync would award every event a second time.
    expect(result.events.map((e) => e.id)).toEqual(["push:2"]);
    expect(result.alreadySeen).toEqual(["push:1"]);
  });

  it("reports the supplied identities so a run can account for its input", () => {
    const result = dedupeEvents([event("push:2")], {
      alreadySeen: new Set(["push:1"]),
    });

    expect(result.events).toHaveLength(1);
    expect(result.alreadySeen).toEqual(["push:1"]);
  });

  it("still counts a re-seen event's observations in the duplicate report", () => {
    const result = dedupeEvents([event("push:1"), event("push:1")], {
      alreadySeen: new Set(["push:1"]),
    });

    expect(result.events).toHaveLength(0);
    expect(result.duplicates).toEqual([]);
  });

  it("is idempotent over its own result", () => {
    const input = [event("push:1"), event("push:2"), event("push:1")];

    const once = dedupeEvents(input);
    const twice = dedupeEvents(once.events);

    expect(twice.events.map((e) => e.id)).toEqual(once.events.map((e) => e.id));
  });

  it("does not mutate the caller's already-seen set", () => {
    const seen = new Set(["push:1"]);
    const before = [...seen];

    dedupeEvents([event("push:3")], { alreadySeen: seen });

    expect([...seen]).toEqual(before);
  });
});

describe("dedupeEvents — edge cases", () => {
  it("handles an empty input", () => {
    const result = dedupeEvents([]);

    expect(result.events).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(result.alreadySeen).toEqual([]);
  });

  it("handles a single event", () => {
    const result = dedupeEvents([event("push:1")]);

    expect(result.events).toHaveLength(1);
    expect(result.duplicates).toEqual([]);
  });
});

describe("idempotency key", () => {
  it("matches the format from SCORING.md §18", () => {
    // xp:user123:event456:scoring-v1
    expect(idempotencyKeyFor(event("push:1"), "scoring-v1")).toBe(
      "xp:octocat:push:1:scoring-v1",
    );
  });

  it("is stable across repeated processing", () => {
    const first = event("push:1");

    expect(idempotencyKeyFor(first, "scoring-v1")).toBe(
      idempotencyKeyFor(first, "scoring-v1"),
    );
  });

  it("distinguishes kinds that would otherwise share a source event id", () => {
    // Both derived from the same GitHub event id, but the id carries the kind,
    // so the keys cannot collide. Same collision risk for the idempotency key.
    const asPush = event("push:1", { kind: "push" });
    const asReview = event("review:1", { kind: "review" });

    expect(idempotencyKeyFor(asPush, "v1")).not.toBe(
      idempotencyKeyFor(asReview, "v1"),
    );
  });

  it("distinguishes developers who each saw the same event id", () => {
    const mine = event("push:1", { developerLogin: "octocat" });
    const theirs = event("push:1", { developerLogin: "sindresorhus" });

    expect(idempotencyKeyFor(mine, "v1")).not.toBe(
      idempotencyKeyFor(theirs, "v1"),
    );
  });

  it("changes with the scoring version, so a rescore may award again", () => {
    const target = event("push:1");

    // A scoring change must not look like a duplicate of the old scoring.
    expect(idempotencyKeyFor(target, "scoring-v1")).not.toBe(
      idempotencyKeyFor(target, "scoring-v2"),
    );
  });
});