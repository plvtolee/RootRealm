import { describe, expect, it } from "vitest";

import { GitHubClient } from "./client";
import { fetchActivity, relevanceOf, EVENT_CEILING } from "./activity";
import type { FailureReason } from "./failure";

const NOW = 1_700_000_000_000;
const API = "https://api.github.com";

interface Stub {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function client(stubs: Stub[]): GitHubClient {
  let index = 0;
  const fetchImpl = (async () => {
    const stub = stubs[Math.min(index, stubs.length - 1)];
    index += 1;
    return new Response(JSON.stringify(stub.body ?? {}), {
      status: stub.status ?? 200,
      headers: new Headers(stub.headers ?? {}),
    });
  }) as unknown as typeof fetch;

  return new GitHubClient({
    fetch: fetchImpl,
    now: () => NOW,
    retryBaseDelayMs: 1,
    maxRetries: 0,
  });
}

/**
 * Fixtures reproducing the payload shapes captured from the live API on
 * 2026-10-10. They are deliberately faithful to what GitHub actually returns —
 * in particular the stubbed `pull_request` and the commit-less `PushEvent` —
 * because invented fixtures would test a shape GitHub does not serve.
 */

const pushEvent = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "23548893202",
  type: "PushEvent",
  public: true,
  created_at: "2026-10-09T05:51:24Z",
  actor: { login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/1" },
  repo: { id: 170270, name: "octocat/octo-repo" },
  payload: {
    repository_id: 170270,
    push_id: 45928426596,
    ref: "refs/heads/main",
    head: "09b6b43401e844c23bf5222220b06ad9199458de",
    before: "2dcfb4a2cc090d1b8c7efef7ff94b06d8ee4adfe",
  },
  ...over,
});

/** Exactly the five fields GitHub returns — verified across 37 real events. */
const prStub = (over: Record<string, unknown> = {}) => ({
  url: "https://api.github.com/repos/octocat/octo-repo/pulls/82",
  id: 9_000_001,
  number: 82,
  head: {
    ref: "feature",
    sha: "36a17e5205c60fe558969a7b07eb5454fda44793",
    repo: { id: 170270, name: "octocat/octo-repo" },
  },
  base: { ref: "main", sha: "aaaa", repo: { id: 170270, name: "octocat/octo-repo" } },
  ...over,
});

const prEvent = (action: string, over: Record<string, unknown> = {}) => ({
  id: `pr-${action}`,
  type: "PullRequestEvent",
  public: true,
  created_at: "2026-10-08T12:00:00Z",
  actor: { login: "octocat", avatar_url: null },
  repo: { id: 170270, name: "octocat/octo-repo" },
  payload: { action, number: 82, pull_request: prStub() },
  ...over,
});

const issuesEvent = (action: string, user: string | null = "octocat") => ({
  id: `issue-${action}`,
  type: "IssuesEvent",
  public: true,
  created_at: "2026-10-08T09:00:00Z",
  actor: { login: "octocat", avatar_url: null },
  repo: { id: 170270, name: "octocat/octo-repo" },
  payload: {
    action,
    issue: {
      id: 5_000_001,
      number: 12,
      title: "Crash on launch",
      state: "closed",
      user: user === null ? null : { login: user },
      html_url: "https://github.com/octocat/octo-repo/issues/12",
      closed_at: "2026-10-08T09:00:00Z",
    },
  },
});

const releaseEvent = () => ({
  id: "rel-1",
  type: "ReleaseEvent",
  public: true,
  created_at: "2026-10-07T18:00:00Z",
  actor: { login: "octocat", avatar_url: null },
  repo: { id: 170270, name: "octocat/octo-repo" },
  payload: {
    action: "published",
    release: {
      id: 6_000_001,
      tag_name: "v2.0.0",
      name: "Two",
      draft: false,
      prerelease: false,
      html_url: "https://github.com/octocat/octo-repo/releases/tag/v2.0.0",
    },
  },
});

const createBranchEvent = () => ({
  id: "create-1",
  type: "CreateEvent",
  public: true,
  created_at: "2026-10-07T03:13:25Z",
  actor: { login: "octocat", avatar_url: null },
  repo: { id: 170270, name: "octocat/octo-repo" },
  payload: {
    ref: "refs/heads/feature",
    ref_type: "branch",
    master_branch: "main",
    description: null,
    pusher_type: "user",
  },
});

const forkEvent = () => ({
  id: "fork-1",
  type: "ForkEvent",
  public: true,
  created_at: "2026-10-07T02:00:00Z",
  actor: { login: "octocat", avatar_url: null },
  repo: { id: 170270, name: "someone-else/their-repo" },
  payload: { forkee: { full_name: "someone-else/their-repo" } },
});

const reviewEvent = () => ({
  id: "rev-1",
  type: "PullRequestReviewEvent",
  public: true,
  created_at: "2026-10-08T11:00:00Z",
  actor: { login: "octocat", avatar_url: null },
  repo: { id: 170270, name: "octocat/octo-repo" },
  payload: {
    action: "created",
    pull_request: prStub(),
    review: {
      id: 7_000_001,
      state: "approved",
      body: "LGTM",
      html_url: "https://github.com/octocat/octo-repo/pull/82#pullrequestreview-1",
    },
  },
});

async function observationOf(stubs: Stub[], username = "octocat") {
  const result = await fetchActivity(client(stubs), username);
  if (!result.ok) throw new Error(`expected success, got ${result.failure.reason}`);
  return result.observation;
}

/* -------------------------------------------------------------------------- */

describe("fetchActivity — relevance classification", () => {
  it("marks the event types Phase 5 scores as scored evidence", async () => {
    const observation = await observationOf([
      {
        body: [
          pushEvent(),
          prEvent("merged"),
          reviewEvent(),
          issuesEvent("closed"),
          releaseEvent(),
        ],
      },
    ]);

    expect(observation.byRelevance.scored).toBe(5);
    expect(observation.byRelevance.weak).toBe(0);
    expect(observation.byRelevance.ignored).toBe(0);
  });

  it("treats a fork as someone else's work rather than the developer's own", async () => {
    const observation = await observationOf([{ body: [forkEvent()] }]);

    expect(observation.events[0].relevance).toBe("ignored");
    expect(observation.byRelevance.ignored).toBe(1);
  });

  it("keeps branch lifecycle events as weak context instead of dropping them", async () => {
    const observation = await observationOf([{ body: [createBranchEvent()] }]);

    // 24% of a real sampled feed was branch create/delete. Dropping them would
    // make the count unauditable, so they survive as weak signal.
    expect(observation.count).toBe(1);
    expect(observation.events[0]).toMatchObject({
      type: "CreateEvent",
      relevance: "weak",
      ref: { refType: "branch", ref: "refs/heads/feature" },
    });
  });

  it("classifies an unknown event type as weak rather than discarding it", async () => {
    const observation = await observationOf([
      { body: [{ ...pushEvent(), id: "x", type: "SomeBrandNewEvent" }] },
    ]);

    expect(observation.count).toBe(1);
    expect(observation.events[0].relevance).toBe("weak");
    expect(observation.byType.SomeBrandNewEvent).toBe(1);
  });

  it("maps event types to relevance consistently", () => {
    expect(relevanceOf("PushEvent")).toBe("scored");
    expect(relevanceOf("WatchEvent")).toBe("ignored");
    expect(relevanceOf("NeverHeardOfIt")).toBe("weak");
  });
});

describe("fetchActivity — partial responses", () => {
  it("records that a push carried no commit list rather than inferring one", async () => {
    const observation = await observationOf([{ body: [pushEvent()] }]);
    const [record] = observation.events;

    expect(record.push).toEqual({
      ref: "refs/heads/main",
      branch: "main",
      headSha: "09b6b43401e844c23bf5222220b06ad9199458de",
      beforeSha: "2dcfb4a2cc090d1b8c7efef7ff94b06d8ee4adfe",
      pushId: "45928426596",
    });

    // The field that TASKS 5.2 needs and cannot have.
    expect(observation.partial.pushesWithoutCommitList).toBe(1);
    expect(observation.partial.omittedFields["PushEvent.commits"]).toBe(1);
  });

  it("stops claiming a missing commit list once GitHub supplies one", async () => {
    const base = pushEvent();
    const withCommits = {
      ...base,
      payload: { ...(base.payload as object), commits: [{ sha: "a" }] },
    };

    const observation = await observationOf([{ body: [withCommits] }]);

    // The counter is checked, not assumed — a future GitHub change must be able
    // to drive it to zero.
    expect(observation.partial.pushesWithoutCommitList).toBe(0);
    expect(observation.partial.omittedFields["PushEvent.commits"]).toBeUndefined();
  });

  it("takes the merge signal from the action, never from a missing field", async () => {
    const observation = await observationOf([
      { body: [prEvent("merged"), prEvent("closed"), prEvent("opened")] },
    ]);
    const [merged, closed, opened] = observation.events;

    expect(merged.pullRequest?.merged).toBe(true);
    // "closed" cannot distinguish merged-closed from abandoned — null, not false.
    expect(closed.pullRequest?.merged).toBe(false);
    expect(opened.pullRequest?.merged).toBe(false);

    expect(observation.partial.pullRequestsWithoutDiffStats).toBe(3);
    expect(observation.partial.omittedFields["PullRequestEvent.additions"]).toBe(3);
  });

  it("marks an absent pull request action as undecidable rather than unmerged", async () => {
    const withoutAction = {
      ...prEvent("merged"),
      payload: { number: 82, pull_request: prStub() },
    };

    const observation = await observationOf([{ body: [withoutAction] }]);

    expect(observation.events[0].pullRequest?.merged).toBeNull();
  });

  it("reports issue authorship, which distinguishes opening from triaging", async () => {
    const observation = await observationOf([
      { body: [issuesEvent("opened"), issuesEvent("closed")] },
    ]);

    expect(observation.events[0].content).toMatchObject({
      action: "opened",
      number: 12,
      title: "Crash on launch",
      state: "closed",
      authoredByActor: true,
    });
  });

  it("reports authorship as unknown when GitHub omits the author", async () => {
    const observation = await observationOf([{ body: [issuesEvent("closed", null)] }]);

    expect(observation.events[0].content?.authoredByActor).toBeNull();
  });

  it("never throws on a payload of an unexpected shape", async () => {
    const observation = await observationOf([
      {
        body: [
          { ...pushEvent(), payload: null },
          { ...prEvent("merged"), payload: {} },
          { ...releaseEvent(), payload: { release: null } },
          { ...createBranchEvent(), payload: { ref: 42 } },
        ],
      },
    ]);

    expect(observation.count).toBe(4);
    expect(observation.events[0].push).toMatchObject({ headSha: null, ref: null });
    expect(observation.events[1].pullRequest).toMatchObject({
      number: null,
      action: null,
      merged: null,
    });
    expect(observation.events[2].content?.releaseTag).toBeNull();
    expect(observation.events[3].ref).toMatchObject({ refType: null, ref: null });
  });
});

describe("fetchActivity — identifiers and evidence", () => {
  it("keys each record on GitHub's own event id", async () => {
    const observation = await observationOf([{ body: [pushEvent(), forkEvent()] }]);

    // payload.id means different things per type, so the key must be the event id.
    expect(observation.events.map((e) => e.eventId)).toEqual(["23548893202", "fork-1"]);
  });

  it("carries the repository id as the stable key and the name for display", async () => {
    const observation = await observationOf([{ body: [prEvent("merged")] }]);

    expect(observation.events[0]).toMatchObject({
      repositoryId: 170270,
      repositoryFullName: "octocat/octo-repo",
    });
  });

  it("builds an evidence URL from the head SHA for a push", async () => {
    const observation = await observationOf([{ body: [pushEvent()] }]);

    expect(observation.events[0].sourceUrl).toBe(
      "https://github.com/octocat/octo-repo/commit/09b6b43401e844c23bf5222220b06ad9199458de",
    );
  });

  it("omits the evidence URL rather than inventing one when a part is missing", async () => {
    const base = pushEvent();
    const headless = { ...base, payload: { ...(base.payload as object), head: null } };

    const observation = await observationOf([{ body: [headless] }]);

    expect(observation.events[0].sourceUrl).toBeNull();
  });
});

describe("fetchActivity — pagination and the 300-event ceiling", () => {
  it("merges every page and reports how many it walked", async () => {
    const observation = await observationOf([
      {
        body: [pushEvent(), forkEvent()],
        headers: { link: `<${API}/users/octocat/events?page=2>; rel="next"` },
      },
      { body: [releaseEvent()], headers: {} },
    ]);

    expect(observation.count).toBe(3);
    expect(observation.pages).toBe(2);
    expect(observation.truncated).toBe(false);
    expect(observation.atCeiling).toBe(false);
  });

  it("stops at three pages instead of asking for the 422 page", async () => {
    const alwaysNext = {
      body: [pushEvent()],
      headers: { link: `<${API}/users/octocat/events?page=2>; rel="next"` },
    };

    let requests = 0;
    const fetchImpl = (async () => {
      requests += 1;
      return new Response(JSON.stringify(alwaysNext.body), {
        status: 200,
        headers: new Headers(alwaysNext.headers),
      });
    }) as unknown as typeof fetch;

    const result = await fetchActivity(
      new GitHubClient({ fetch: fetchImpl, now: () => NOW, maxRetries: 0 }),
      "octocat",
    );
    if (!result.ok) throw new Error("expected success");

    // GitHub serves 300 events and then 422s. Requesting page 4 would waste a
    // request out of a 60/hour anonymous budget.
    expect(requests).toBe(3);
    expect(result.observation.pages).toBe(3);
  });

  it("keeps the pages already fetched when GitHub answers with the 422", async () => {
    let index = 0;
    const fetchImpl = (async () => {
      index += 1;
      if (index === 1) {
        return new Response(JSON.stringify([pushEvent()]), {
          status: 200,
          headers: new Headers({ link: `<${API}/users/octocat/events?page=2>; rel="next"` }),
        });
      }
      return new Response(
        JSON.stringify({ message: "pagination is limited for this resource" }),
        { status: 422, headers: new Headers() },
      );
    }) as unknown as typeof fetch;

    const result = await fetchActivity(
      new GitHubClient({ fetch: fetchImpl, now: () => NOW, maxRetries: 0 }),
      "octocat",
    );

    // Without the ceiling guard this would be a 503 that discards the event.
    if (!result.ok) throw new Error(`expected success, got ${result.failure.reason}`);
    expect(result.observation.count).toBe(1);
    expect(result.observation.truncated).toBe(false);
  });

  it("still surfaces a 422 on the very first page as a failure", async () => {
    const result = await fetchActivity(
      client([{ status: 422, body: { message: "pagination is limited for this resource" } }]),
      "octocat",
    );

    // Nothing was collected, so there is no partial result worth keeping.
    if (result.ok) throw new Error("expected a failure");
    expect(result.failure.reason).toBe("unavailable");
  });

  it("flags a full walk as having reached GitHub's ceiling", async () => {
    const full = Array.from({ length: EVENT_CEILING }, (_unused, index) =>
      pushEvent({ id: `bulk-${index}` }),
    );

    const observation = await observationOf([{ body: full }]);

    expect(observation.count).toBe(EVENT_CEILING);
    expect(observation.atCeiling).toBe(true);
  });

  it("reports an account with no recent activity as zero, not as a failure", async () => {
    const observation = await observationOf([{ body: [] }]);

    expect(observation.count).toBe(0);
    expect(observation.oldestAt).toBeNull();
    expect(observation.newestAt).toBeNull();
    expect(observation.byRelevance).toEqual({ scored: 0, weak: 0, ignored: 0 });
  });
});

describe("fetchActivity — observed window", () => {
  it("reports the oldest and newest event so a total is never read as a period", async () => {
    const observation = await observationOf([
      { body: [pushEvent(), releaseEvent(), issuesEvent("closed")] },
    ]);

    expect(observation.oldestAt).toBe("2026-10-07T18:00:00Z");
    expect(observation.newestAt).toBe("2026-10-09T05:51:24Z");
  });

  it("ignores a null timestamp instead of treating it as the epoch", async () => {
    const undated = pushEvent({ created_at: null });
    const observation = await observationOf([{ body: [undated, forkEvent()] }]);

    expect(observation.oldestAt).toBe("2026-10-07T02:00:00Z");
  });

  it("reports a straggler's full age, since the feed is not time-ordered", async () => {
    // Observed live: 297 events from three days plus three backfilled
    // PullRequestEvents on one repo dated 2024-08, 2025-09 and 2026-03. The
    // window is a true min/max but is not a coverage boundary, and reporting it
    // honestly is what stops TASKS 4.7 treating it as one.
    const observation = await observationOf([
      {
        body: [
          pushEvent(),
          { ...prEvent("merged"), id: "backfill-2024", created_at: "2024-08-28T05:10:42Z" },
          { ...prEvent("merged"), id: "backfill-2025", created_at: "2025-09-19T05:05:35Z" },
        ],
      },
    ]);

    expect(observation.oldestAt).toBe("2024-08-28T05:10:42Z");
    expect(observation.newestAt).toBe("2026-10-09T05:51:24Z");
  });
});

describe("fetchActivity — controlled failures", () => {
  async function reasonFor(stubs: Stub[], username = "octocat"): Promise<FailureReason> {
    const result = await fetchActivity(client(stubs), username);
    if (result.ok) throw new Error("expected a failure");
    return result.failure.reason;
  }

  it("rejects a malformed username without spending a request", async () => {
    expect(await reasonFor([{ body: [] }], "-not-a-login")).toBe("invalid_username");
  });

  it("reports an unknown account as not_found", async () => {
    expect(await reasonFor([{ status: 404, body: {} }])).toBe("not_found");
  });

  it("reports an exhausted budget as rate_limited", async () => {
    expect(
      await reasonFor([
        { status: 403, body: {}, headers: { "x-ratelimit-remaining": "0" } },
      ]),
    ).toBe("rate_limited");
  });

  it("re-throws a programming error rather than reporting an outage", async () => {
    const broken = {
      listEvents: () => Promise.reject(new TypeError("bug")),
      rateLimitState: () => ({
        limit: null,
        remaining: null,
        resetsAt: null,
        retryAfterMs: null,
        observedAt: 0,
      }),
    } as unknown as GitHubClient;

    await expect(fetchActivity(broken, "octocat")).rejects.toThrow(TypeError);
  });
});