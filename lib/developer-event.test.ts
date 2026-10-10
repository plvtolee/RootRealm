import { describe, expect, it } from "vitest";

import type { ActivityRecord, EventRelevance } from "./github/activity";
import {
  normalizeActivity,
  type DeveloperEvent,
  type NormalizationContext,
} from "./developer-event";

/**
 * Activity records matching the shapes captured from the live API on
 * 2026-10-10 (TASKS 4.4), including the commit-less push and the stubbed pull
 * request. Normalization is only meaningful against real payload shapes.
 */

const OWNED_REPO = 170_270;
const FOREIGN_REPO = 999_999;

function activity(
  over: Partial<ActivityRecord> & Pick<ActivityRecord, "eventId" | "type">,
): ActivityRecord {
  return {
    relevance: "scored",
    createdAt: "2026-10-09T05:51:24Z",
    actorLogin: "octocat",
    repositoryId: OWNED_REPO,
    repositoryFullName: "octocat/octo-repo",
    sourceUrl: "https://github.com/octocat/octo-repo",
    push: null,
    pullRequest: null,
    content: null,
    ref: null,
    source: {
      id: over.eventId,
      type: over.type,
      public: true,
      createdAt: over.createdAt ?? "2026-10-09T05:51:24Z",
      actorLogin: "octocat",
      actorAvatarUrl: null,
      repoId: OWNED_REPO,
      repoFullName: "octocat/octo-repo",
      payload: {},
    },
    ...over,
  } as ActivityRecord;
}

const push = (over: Partial<ActivityRecord> = {}) =>
  activity({
    eventId: "23548893202",
    type: "PushEvent",
    sourceUrl: "https://github.com/octocat/octo-repo/commit/09b6b43",
    push: {
      ref: "refs/heads/main",
      branch: "main",
      headSha: "09b6b43401e844c23bf5222220b06ad9199458de",
      beforeSha: "2dcfb4a2cc090d1b8c7efef7ff94b06d8ee4adfe",
      pushId: "45928426596",
    },
    ...over,
  });

const pullRequest = (
  action: string,
  over: Partial<ActivityRecord> = {},
) =>
  activity({
    eventId: `pr-${action}`,
    type: "PullRequestEvent",
    sourceUrl: "https://github.com/octocat/octo-repo/pull/82",
    pullRequest: {
      pullRequestId: 9_000_001,
      number: 82,
      action,
      merged: action === "merged",
      headRef: "feature",
      headSha: "36a17e52",
      baseRef: "main",
    },
    ...over,
  });

const issuesEvent = (action: string, authored: boolean | null = true) =>
  activity({
    eventId: `issue-${action}`,
    type: "IssuesEvent",
    sourceUrl: "https://github.com/octocat/octo-repo/issues/12",
    content: {
      action,
      number: 12,
      title: "Crash on launch",
      state: "closed",
      authoredByActor: authored,
      commentId: null,
      releaseTag: null,
      isDraft: null,
      isPrerelease: null,
      htmlUrl: "https://github.com/octocat/octo-repo/issues/12",
    },
  });

const review = () =>
  activity({
    eventId: "rev-1",
    type: "PullRequestReviewEvent",
    sourceUrl: "https://github.com/octocat/octo-repo/pull/82",
    content: {
      action: "created",
      number: 82,
      title: null,
      state: "approved",
      authoredByActor: true,
      commentId: 7_000_001,
      releaseTag: null,
      isDraft: null,
      isPrerelease: null,
      htmlUrl: null,
    },
  });

const release = () =>
  activity({
    eventId: "rel-1",
    type: "ReleaseEvent",
    sourceUrl: "https://github.com/octocat/octo-repo/releases/tag/v2.0.0",
    content: {
      action: "published",
      number: null,
      title: "Two",
      state: null,
      authoredByActor: null,
      commentId: null,
      releaseTag: "v2.0.0",
      isDraft: false,
      isPrerelease: false,
      htmlUrl: "https://github.com/octocat/octo-repo/releases/tag/v2.0.0",
    },
  });

const lifecycle = () =>
  activity({
    eventId: "create-1",
    type: "CreateEvent",
    relevance: "weak",
    sourceUrl: null,
    ref: { refType: "branch", ref: "refs/heads/feature" },
  });

const unsupportedEvent = () =>
  activity({
    eventId: "fork-1",
    type: "ForkEvent",
    relevance: "ignored",
    sourceUrl: null,
  });

const context = (over: Partial<NormalizationContext> = {}): NormalizationContext => ({
  developerLogin: "octocat",
  developerId: 583_231,
  confirmedRepositoryIds: new Set([OWNED_REPO]),
  ...over,
});

const normalize = (
  records: ActivityRecord[],
  ctx: NormalizationContext = context(),
) => normalizeActivity(records, ctx);

const only = (result: ReturnType<typeof normalize>): DeveloperEvent =>
  result.events[0];

/* -------------------------------------------------------------------------- */

describe("normalizeActivity — canonical kinds", () => {
  it("maps each scoring-relevant GitHub type to a canonical kind", () => {
    const result = normalize([
      push(),
      pullRequest("merged"),
      review(),
      issuesEvent("closed"),
      release(),
      lifecycle(),
    ]);

    expect(result.byKind).toEqual({
      push: 1,
      pull_request: 1,
      review: 1,
      issue: 1,
      release: 1,
      documentation: 0,
      lifecycle: 1,
    });
  });

  it("names a push as a push, never a commit", () => {
    const result = normalize([push()]);

    // One push may hold any number of commits and we can see none of them.
    // A `commit` kind would invite TASK 5.2 to score volume from data that has
    // no commits in it.
    expect(only(result).kind).toBe("push");
    expect(only(result).evidence).toEqual({
      branch: "main",
      headSha: "09b6b43401e844c23bf5222220b06ad9199458de",
      beforeSha: "2dcfb4a2cc090d1b8c7efef7ff94b06d8ee4adfe",
    });
  });

  it("maps both review event types onto one kind but keeps them distinct", () => {
    const comment = activity({
      eventId: "rev-comment",
      type: "PullRequestReviewCommentEvent",
      content: review().content,
    });

    const result = normalize([review(), comment]);

    expect(result.byKind.review).toBe(2);
    // A review and a review comment are different contributions and carry
    // different identities, so the subject is preserved. Reading `evidence`
    // without narrowing on `kind` is a compile error, which is the point of the
    // discriminated union.
    const subjects = result.events.flatMap((e) =>
      e.kind === "review" ? [e.evidence.subject] : [],
    );
    expect(subjects).toEqual(["review", "comment"]);
  });

  it("maps a wiki edit to documentation", () => {
    const result = normalize([
      activity({ eventId: "wiki-1", type: "GollumEvent" }),
    ]);

    expect(only(result).kind).toBe("documentation");
  });
});

describe("normalizeActivity — stable identifiers", () => {
  it("keys on the occurrence, so opened and merged survive as distinct events", () => {
    const result = normalize([pullRequest("opened"), pullRequest("merged")]);

    // Both describe pull request #82. Keying on the object would collapse them
    // and silently discard the merge, which is the one TASK 5.3 scores.
    expect(result.events).toHaveLength(2);
    expect(new Set(result.events.map((e) => e.id)).size).toBe(2);
    expect(result.events.map((e) => e.id).sort()).toEqual([
      "pull_request:pr-merged",
      "pull_request:pr-opened",
    ]);
  });

  it("produces the same id for the same event re-observed later", () => {
    const first = normalize([pullRequest("merged")]);
    const second = normalize([pullRequest("merged")]);

    // TASK 4.6 deduplicates repeated observations; this is what makes that work.
    expect(only(first).id).toBe(only(second).id);
  });

  it("gives different kinds different ids for the same underlying event id", () => {
    const asPush = normalize([push({ eventId: "shared" })]);
    const asReview = normalize([review()]);

    expect(only(asPush).id).toBe("push:shared");
    expect(only(asReview).id).not.toBe("push:shared");
  });

  it("keys repositories on the numeric id, never the name", () => {
    const result = normalize([push({ repositoryFullName: "octocat/Renamed" })]);

    expect(only(result).repositoryId).toBe(OWNED_REPO);
    expect(only(result).repositoryFullName).toBe("octocat/Renamed");
  });
});

describe("normalizeActivity — visibility preserved", () => {
  it("preserves a public flag", () => {
    expect(only(normalize([push()])).visibility).toBe("public");
  });

  it("records a non-public flag without inventing that the work was private", () => {
    const hidden = push();
    hidden.source.public = false;

    // The events endpoint only serves public activity, so `non_public` is what
    // was told — asserting `private` would claim a cause we cannot observe.
    expect(only(normalize([hidden])).visibility).toBe("non_public");
  });
});

describe("normalizeActivity — source URL preserved", () => {
  it("carries the evidence link through verbatim", () => {
    const url = "https://github.com/octocat/octo-repo/pull/82";
    expect(only(normalize([pullRequest("merged", { sourceUrl: url })])).sourceUrl).toBe(url);
  });

  it("leaves it null rather than constructing one when GitHub gave none", () => {
    expect(only(normalize([lifecycle()])).sourceUrl).toBeNull();
  });
});

describe("normalizeActivity — confidence", () => {
  it("is verified when GitHub attests the actor is the developer", () => {
    // `/users/{login}/events` only returns events that login performed, so a
    // matching actor is a direct attestation of both occurrence and performer.
    const result = normalize([push()]);

    expect(only(result).confidence).toBe("verified");
    expect(result.byConfidence).toEqual({ verified: 1, inferred: 0 });
  });

  it("is inferred when the actor is a different developer", () => {
    const someoneElse = push({ actorLogin: "someone-else" });
    const result = normalize([someoneElse]);

    expect(only(result).confidence).toBe("inferred");
  });

  it("is inferred when GitHub supplied no actor", () => {
    const unknownActor = push({ actorLogin: null });

    expect(only(normalize([unknownActor])).confidence).toBe("inferred");
  });

  it("keeps verified work in an unconfirmed repository verified", () => {
    // The developer pushing to a fork or a colleague's repository did that work;
    // GitHub attests it. Marking it inferred would report verified evidence as
    // uncertain, which SCORING.md §6 warns against in the opposite direction.
    const inForeignRepo = push({ repositoryId: FOREIGN_REPO });
    const result = normalize([inForeignRepo]);

    expect(only(result).confidence).toBe("verified");
    // The weaker claim — that the repository is theirs — is still recorded.
    expect(only(result).limitations).toContain("repository_unconfirmed");
  });

  it("does not treat an unsupplied repository list as a failed check", () => {
    const result = normalize([push({ repositoryId: FOREIGN_REPO })], context({
      confirmedRepositoryIds: null,
    }));

    expect(only(result).limitations).not.toContain("repository_unconfirmed");
  });

  it("records a limitation, not a downgrade, when no repository id exists", () => {
    const result = normalize([push({ repositoryId: null })]);

    expect(only(result).confidence).toBe("verified");
    expect(only(result).limitations).toContain("repository_unconfirmed");
  });

  it("treats an empty repository list as confirming nothing", () => {
    const result = normalize([push({ repositoryId: FOREIGN_REPO })], context({
      confirmedRepositoryIds: new Set(),
    }));

    expect(only(result).limitations).toContain("repository_unconfirmed");
  });

  it("keeps a closed pull request verified while flagging the unknown merge", () => {
    const result = normalize([pullRequest("closed")]);

    // GitHub did record the closure, so the event is verified. What is unknown
    // is the merge — a different kind of uncertainty, carried as a limitation.
    expect(only(result).confidence).toBe("verified");
    expect(only(result).limitations).toContain("merge_status_unknown");
  });

  it("does not let an incomplete repository inventory downgrade confidence", () => {
    // The live regression this guards: sindresorhus' repository walk truncates at
    // 1000 entries sorted oldest-first, so his newest repositories are absent and
    // 150 of 300 events were being reported as inferred on that basis alone.
    const newestRepo = push({ repositoryId: FOREIGN_REPO, repositoryFullName: "octocat/newest" });
    const result = normalize([newestRepo]);

    expect(result.byConfidence.inferred).toBe(0);
    expect(only(result).limitations).toContain("repository_unconfirmed");
  });
});

describe("normalizeActivity — limitations", () => {
  it("records that a push carried no commit list", () => {
    expect(only(normalize([push()])).limitations).toContain("commit_count_unavailable");
  });

  it("drops the commit limitation if a commit list ever appears", () => {
    const withCommits = push();
    withCommits.source.payload = { commits: [{ sha: "a" }] };

    // Checked, not hardcoded, so a future GitHub change can clear it.
    expect(only(normalize([withCommits])).limitations).not.toContain(
      "commit_count_unavailable",
    );
  });

  it("records that a pull request carried no diff statistics", () => {
    // A PR that changed nothing and a PR whose size we cannot see must not be
    // distinguishable at scoring time.
    expect(only(normalize([pullRequest("merged")])).limitations).toContain(
      "diff_stats_unavailable",
    );
  });

  it("does not flag merge status unknown when the action is merged", () => {
    expect(only(normalize([pullRequest("merged")])).limitations).not.toContain(
      "merge_status_unknown",
    );
  });

  it("flags authorship unknown only when GitHub omitted the author", () => {
    expect(only(normalize([issuesEvent("closed", null)])).limitations).toContain(
      "authorship_unknown",
    );
    expect(
      only(normalize([issuesEvent("opened", true)])).limitations,
    ).not.toContain("authorship_unknown");
  });

  it("flags a missing timestamp", () => {
    expect(only(normalize([push({ createdAt: null })])).limitations).toContain(
      "timestamp_missing",
    );
  });

  it("attaches no limitation to a clean release", () => {
    expect(only(normalize([release()])).limitations).toEqual([]);
  });

  it("accumulates every applicable limitation", () => {
    const result = normalize([
      push({ repositoryId: FOREIGN_REPO, createdAt: null }),
    ]);

    // Compared as a set: the order limitations are appended in is a rendering
    // detail, the membership is the contract.
    expect([...only(result).limitations].sort()).toEqual([
      "commit_count_unavailable",
      "repository_unconfirmed",
      "timestamp_missing",
    ]);
  });
});

describe("normalizeActivity — unsupported input is accounted for", () => {
  it("does not invent an event for a type with no canonical form", () => {
    const result = normalize([unsupportedEvent(), unsupportedEvent()]);

    expect(result.events).toHaveLength(0);
    expect(result.unsupported).toEqual([
      { type: "ForkEvent", count: 2, relevance: "ignored" },
    ]);
  });

  it("reports drops rather than losing them silently", () => {
    // 300 observed events and 1 fork must be reconcilable: 299 + 1.
    const many = Array.from({ length: 299 }, (_unused, index) =>
      push({ eventId: `bulk-${index}` }),
    );

    const result = normalize([...many, unsupportedEvent()]);

    expect(result.events).toHaveLength(299);
    expect(result.unsupported[0].count).toBe(1);
  });

  it("orders unsupported types by how many were dropped", () => {
    const result = normalize([
      unsupportedEvent(),
      activity({ eventId: "w-1", type: "WatchEvent", relevance: "ignored" }),
      activity({ eventId: "w-2", type: "WatchEvent", relevance: "ignored" }),
    ]);

    expect(result.unsupported.map((u) => [u.type, u.count])).toEqual([
      ["WatchEvent", 2],
      ["ForkEvent", 1],
    ]);
  });

  it("preserves the TASKS 4.4 relevance on both events and drops", () => {
    const result = normalize([lifecycle(), unsupportedEvent()]);

    expect(only(result).relevance).toBe("weak");
    expect(result.unsupported[0].relevance).toBe("ignored");
  });
});

describe("normalizeActivity — purity", () => {
  it("is deterministic for the same input", () => {
    const input = [push(), pullRequest("merged"), issuesEvent("closed")];

    expect(normalize(input)).toEqual(normalize(input));
  });

  it("does not mutate the records it is given", () => {
    const input = [pullRequest("merged")];
    const before = JSON.stringify(input);

    normalize(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it("handles an empty run without inventing anything", () => {
    const result = normalize([]);

    expect(result.events).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(result.byConfidence).toEqual({ verified: 0, inferred: 0 });
  });

  it("attributes every event to the developer the run was made for", () => {
    const result = normalize([push(), release()]);

    expect(result.events.every((e) => e.developerLogin === "octocat")).toBe(true);
    expect(result.events.every((e) => e.developerId === 583_231)).toBe(true);
  });

  it("reports no inferred events when confidence cannot be lowered", () => {
    const relevance: EventRelevance[] = ["scored", "weak", "ignored"];
    const kinds = ["push", "pull_request", "issue", "release", "lifecycle"] as const;

    const result = normalize(
      kinds.map((kind) => {
        const record = kind === "push" ? push() : pullRequest("merged");
        return { ...record, relevance: relevance[0] };
      }),
    );

    expect(result.byConfidence.inferred).toBe(0);
  });
});