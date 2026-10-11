/**
 * RootRealm — scoring fixtures (TASKS 5.12).
 *
 * ```text
 * six profile shapes → DeveloperEvent batches to score
 * ```
 *
 * TASKS 5.12 asks for fixtures covering:
 *
 * - active profile
 * - inactive profile
 * - new profile
 * - large profile
 * - duplicate activity
 * - mixed activity
 *
 * These are the six states `SCORING.md` §38 (Tuning Process) expects to be
 * tested against before the XP values are called final: values tuned on an
 * active developer's feed would flatter a quiet one, and a rule that works on a
 * handful of events may not survive a full 300.
 *
 * ## Why these are built from real shapes, not invented ones
 *
 * Every fixture here reproduces the payload shapes actually observed from the
 * live API (TASKS 4.4, verified 2026-10-10) and passes them through the same
 * normalization used in production. So a fixture fails the way reality would
 * rather than being internally consistent in a way GitHub never is:
 *
 * - a push carries no commit list, so `commit count unavailable` is present on
 *   every push in every fixture;
 * - `payload.pull_request` is the five-field stub, so `diff stats unavailable`
 *   is present on every pull request;
 * - the activity feed is not time-ordered, so `oldestAt` can reach back years
 *   past everything else in the same batch.
 *
 * ## What the fixtures are for
 *
 * They are inputs, not expectations. No fixture asserts a score: the XP values
 * are §4's own starting placeholders, and pinning them would make tuning look
 * like a regression. What the fixtures do pin is *shape* — how many events
 * normalize, how many are unsupported, whether a batch balances — because those
 * are properties of the data rather than of the balance.
 */
import { toActivityRecord } from "../github/activity";
import type { GitHubEvent } from "../github/types";
import {
  normalizeActivity,
  type NormalizationResult,
} from "../developer-event";
import { dedupeEvents, type DedupeResult } from "../event-dedupe";

/** Raw GitHub event, as the events endpoint returns it. */
interface RawEvent {
  id: string;
  type: string;
  public: boolean;
  created_at: string | null;
  actor: { login: string; avatar_url: string | null };
  repo: { id: number; name: string } | null;
  payload: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* Raw payload builders — the documented shapes, not convenient ones            */
/* -------------------------------------------------------------------------- */

function push(
  id: string,
  createdAt: string,
  repo: { id: number; name: string },
): RawEvent {
  return {
    id,
    type: "PushEvent",
    public: true,
    created_at: createdAt,
    actor: { login: "octocat", avatar_url: null },
    repo,
    payload: {
      repository_id: repo.id,
      push_id: 45928426596,
      ref: "refs/heads/main",
      head: "09b6b43401e844c23bf5222220b06ad9199458de",
      before: "2dcfb4a2cc090d1b8c7efef7ff94b06d8ee4adfe",
    },
  };
}

function pullRequest(
  id: string,
  action: string,
  createdAt: string,
  repo: { id: number; name: string },
): RawEvent {
  return {
    id,
    type: "PullRequestEvent",
    public: true,
    created_at: createdAt,
    actor: { login: "octocat", avatar_url: null },
    repo,
    payload: {
      action,
      number: 82,
      // The five-field stub, verified live.
      pull_request: {
        url: "https://api.github.com/repos/octocat/octo-repo/pulls/82",
        id: 9_000_001,
        number: 82,
        head: { ref: "feature", sha: "36a17e52", repo },
        base: { ref: "main", sha: "aaaa", repo },
      },
    },
  };
}

function review(
  id: string,
  state: string,
  createdAt: string,
  repo: { id: number; name: string },
): RawEvent {
  return {
    id,
    type: "PullRequestReviewEvent",
    public: true,
    created_at: createdAt,
    actor: { login: "octocat", avatar_url: null },
    repo,
    payload: {
      action: "created",
      pull_request: {
        url: "https://api.github.com/repos/octocat/octo-repo/pulls/82",
        id: 9_000_001,
        number: 82,
        head: { ref: "feature", sha: "36a17e52", repo },
        base: { ref: "main", sha: "aaaa", repo },
      },
      review: {
        id: 7_000_001,
        state,
        body: "LGTM",
        html_url: "https://github.com/octocat/octo-repo/pull/82",
      },
    },
  };
}

function issue(
  id: string,
  action: string,
  authoredByLogin: string,
  createdAt: string,
  repo: { id: number; name: string },
): RawEvent {
  return {
    id,
    type: "IssuesEvent",
    public: true,
    created_at: createdAt,
    actor: { login: "octocat", avatar_url: null },
    repo,
    payload: {
      action,
      issue: {
        id: 5_000_001,
        number: 12,
        title: "Crash on launch",
        state: action === "closed" ? "closed" : "open",
        user: { login: authoredByLogin },
        html_url: "https://github.com/octocat/octo-repo/issues/12",
        closed_at: action === "closed" ? createdAt : null,
      },
    },
  };
}

function release(
  id: string,
  createdAt: string,
  repo: { id: number; name: string },
): RawEvent {
  return {
    id,
    type: "ReleaseEvent",
    public: true,
    created_at: createdAt,
    actor: { login: "octocat", avatar_url: null },
    repo,
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
  };
}

function wiki(
  id: string,
  createdAt: string,
  actions: string[],
  repo: { id: number; name: string },
): RawEvent {
  return {
    id,
    type: "GollumEvent",
    public: true,
    created_at: createdAt,
    actor: { login: "octocat", avatar_url: null },
    repo,
    payload: {
      pages: actions.map((action, index) => ({
        page_name: `Page ${index}`,
        title: `Page ${index}`,
        summary: null,
        action,
        sha: "abc123",
        html_url: `https://github.com/${repo.name}/wiki/Page-${index}`,
      })),
    },
  };
}

/** Branch lifecycle: 24% of a real sampled feed, and not work. */
function branch(
  id: string,
  createdAt: string,
  repo: { id: number; name: string },
): RawEvent {
  return {
    id,
    type: "CreateEvent",
    public: true,
    created_at: createdAt,
    actor: { login: "octocat", avatar_url: null },
    repo,
    payload: {
      ref: "refs/heads/feature",
      ref_type: "branch",
      master_branch: "main",
      description: null,
      pusher_type: "user",
    },
  };
}

/** A fork: someone else's repository appearing in this developer's feed. */
function fork(id: string, createdAt: string): RawEvent {
  const repo = { id: 999_999, name: "someone-else/their-repo" };
  return {
    id,
    type: "ForkEvent",
    public: true,
    created_at: createdAt,
    actor: { login: "octocat", avatar_url: null },
    repo,
    payload: { action: "forked", forkee: { full_name: repo.name } },
  };
}

/* -------------------------------------------------------------------------- */
/* Fixture shapes                                                               */
/* -------------------------------------------------------------------------- */

const OWNED = { id: 170_270, name: "octocat/octo-repo" };
const FOREIGN = { id: 999_999, name: "someone-else/their-repo" };

/** Eventually one per profile, so a fixture can say what it contains. */
export interface Fixture {
  readonly profile:
    | "active"
    | "inactive"
    | "new"
    | "large"
    | "duplicate_activity"
    | "mixed_activity";
  /** The raw feed, before normalization. */
  readonly events: readonly RawEvent[];
  /** What the fixture is meant to exercise. */
  readonly notes: readonly string[];
}

const FIXTURES: readonly Fixture[] = [
  {
    profile: "active",
    events: [
      pullRequest("pr-1", "merged", "2026-10-09T05:00:00Z", OWNED),
      pullRequest("pr-2", "opened", "2026-10-09T04:00:00Z", OWNED),
      review("rev-1", "approved", "2026-10-08T11:00:00Z", OWNED),
      issue("issue-1", "closed", "octocat", "2026-10-08T09:00:00Z", OWNED),
      issue("issue-2", "closed", "someone-else", "2026-10-08T08:00:00Z", OWNED),
      release("rel-1", "2026-10-07T18:00:00Z", OWNED),
      wiki("wiki-1", "2026-10-07T12:00:00Z", ["created"], OWNED),
      wiki("wiki-2", "2026-10-07T06:00:00Z", ["edited"], OWNED),
      branch("create-1", "2026-10-06T03:00:00Z", OWNED),
      fork("fork-1", "2026-10-05T02:00:00Z"),
    ],
    notes: [
      "every scoreable kind in one batch",
      "an opened pull request that must not score",
      "a self-fix and a triage, which must map to different attributes",
      "a wiki edit that must not score",
      "a fork, which has no canonical form",
    ],
  },
  {
    profile: "inactive",
    events: [],
    notes: [
      "no events at all, which is not a failure",
      "GitHub reports public repositories for this account, so the run is complete",
    ],
  },
  {
    profile: "new",
    events: [
      push("push-1", "2026-10-10T09:00:00Z", OWNED),
      issue("issue-1", "opened", "octocat", "2026-10-10T08:00:00Z", OWNED),
    ],
    notes: [
      "a first push and a first issue",
      "neither qualifies: a push carries no commit list, an opened issue is not a closure",
      "the whole run scores nothing, which must not be reported as an error",
    ],
  },
  {
    profile: "large",
    // Densest GitHub will serve: 300 events, the documented ceiling.
    events: Array.from({ length: 300 }, (_unused, index) => {
      // Valid ISO-8601, spread across the most recent 30 days. The newest day
      // is day 10; `day` reaches 1 and never 0.
      const day = 10 - Math.floor(index / 30);
      const hour = String(index % 24).padStart(2, "0");
      const minute = String(index % 60).padStart(2, "0");
      const createdAt = `2026-10-${String(day).padStart(2, "0")}T${hour}:${minute}:00Z`;

      // Distributed the way a real feed is: pushes dominate, lifecycle events
      // are a quarter of it, and the "interesting" events are the minority.
      switch (index % 10) {
        case 0:
          return pullRequest(
            `pr-${index}`,
            index % 20 === 0 ? "merged" : "opened",
            createdAt,
            OWNED,
          );
        case 3:
          return review(`rev-${index}`, "approved", createdAt, OWNED);
        case 5:
          return issue(`issue-${index}`, "closed", "octocat", createdAt, OWNED);
        case 7:
          return release(`rel-${index}`, createdAt, OWNED);
        case 2:
        case 4:
          return branch(`create-${index}`, createdAt, OWNED);
        default:
          return push(`push-${index}`, createdAt, OWNED);
      }
    }),
    notes: [
      "300 events, the documented ceiling a very active developer reaches",
      "a walk that stopped at the ceiling, so the run is not complete",
      "loops like any real feed: pushes dominate and lifecycle events are a quarter",
    ],
  },
  {
    profile: "duplicate_activity",
    // One feed, observed twice: a repeated sync (SCORING.md §19).
    events: [
      ...Array.from({ length: 40 }, (_unused, index) =>
        push(`push-${index}`, `2026-10-09T0${index % 10}:00:00Z`, OWNED),
      ),
      ...Array.from({ length: 40 }, (_unused, index) =>
        push(`push-${index}`, `2026-10-09T0${index % 10}:00:00Z`, OWNED),
      ),
    ],
    notes: [
      "the same 40 events delivered twice, as a repeated sync would",
      "deduplication must collapse 80 observations into 40 identities",
      "ids are GitHub's own, so a re-observation is byte-identical",
    ],
  },
  {
    profile: "mixed_activity",
    events: [
      // A push to a repository that is not the developer's, so attribution is
      // an inference — work they did, in someone else's repository.
      push("push-foreign", "2026-10-09T05:00:00Z", FOREIGN),
      pullRequest("pr-foreign", "merged", "2026-10-09T04:00:00Z", FOREIGN),
      // A backfilled event, which is what makes the feed's window unreliable.
      pullRequest("pr-backfill", "merged", "2024-08-28T05:10:42Z", OWNED),
      // An event with no timestamp at all: the key is absent, which is how
      // GitHub omits a field, and which `parseEvent` maps to null.
      (() => {
        const undated = push("push-undated", "2026-10-09T05:00:00Z", OWNED);
        delete (undated as Partial<RawEvent>).created_at;
        return undated;
      })(),
      fork("fork-another", "2026-10-08T02:00:00Z"),
      branch("create-tag", "2026-10-07T03:00:00Z", OWNED),
    ],
    notes: [
      "work in someone else's repository, which is still their work",
      "a backfilled event years past everything else, so the window is not a boundary",
      "an event with no timestamp",
      "several different kinds, so a rule must not assume its own subject",
    ],
  },
];

/** Every fixture, by profile. */
export const scoringFixtures: readonly Fixture[] = FIXTURES;

/** Looks one fixture up by its profile name. */
export function fixtureFor(
  profile: Fixture["profile"],
): Fixture {
  const found = FIXTURES.find((fixture) => fixture.profile === profile);
  if (found === undefined) {
    throw new Error(`No fixture named "${profile}"`);
  }
  return found;
}

/** The developer a fixture's feed belongs to. */
export const FIXTURE_DEVELOPER = {
  login: "octocat",
  githubId: 583_231,
} as const;

/**
 * Runs one fixture through normalization and deduplication.
 *
 * Repository ids are taken from the feed's own `repo.id` values, which is what
 * `GET /users/{login}/repos` would supply — a truncated inventory would not
 * confirm the foreign repositories, and that is a coverage question for
 * TASKS 4.7 rather than something a fixture should decide.
 */
export function runFixture(
  profile: Fixture["profile"],
): {
  normalized: NormalizationResult;
  deduplicated: DedupeResult;
} {
  const fixture = fixtureFor(profile);

  const repositoryIds = new Set(
    fixture.events
      .map((event) => event.repo?.id)
      .filter((id): id is number => id !== undefined),
  );

  const normalized = normalizeActivity(
    fixture.events.map((event) =>
      toActivityRecord(event as unknown as GitHubEvent),
    ),
    {
      developerLogin: FIXTURE_DEVELOPER.login,
      developerId: FIXTURE_DEVELOPER.githubId,
      confirmedRepositoryIds: repositoryIds,
    },
  );

  return { normalized, deduplicated: dedupeEvents(normalized.events) };
}
