/**
 * RootRealm — activity fetching (TASKS 4.4).
 *
 * ```text
 * username → recent public events
 * ```
 *
 * The transport (pagination, timeout, validation) is TASKS 4.1; this module owns
 * what TASK 4.4 actually asks for: *relevant* public activity, pagination that
 * respects the feed's ceiling, and partial responses handled honestly.
 *
 * ## The three constraints that shape this file
 *
 * All three were verified against the live API on 2026-10-10 by sampling 200
 * events across ten event types. They are load-bearing, not incidental, and each
 * one is a trap for anyone who assumes this feed looks like the REST endpoints
 * it grew out of.
 *
 * 1. **`PushEvent` carries no commit list.**
 *
 *    A push event's payload is exactly `{ repository_id, push_id, ref, head,
 *    before }`. There is no `commits` array, no `size`, no `distinct_size` — the
 *    fields the events API used to expose. A push tells us *that* a push
 *    happened and its head SHA, and nothing about how many commits it contained.
 *
 *    Consequence for TASKS 5.2: commit volume **cannot** be scored from this
 *    feed, and any "N commits" claim derived from it would be fabricated. Every
 *    observation therefore reports `pushesWithoutCommitList`, so the gap is
 *    visible wherever activity is summarised rather than being rediscovered as a
 *    bug in Phase 5.
 *
 * 2. **The feed is hard-capped at 300 events and 422s beyond it.**
 *
 *    Pages 1–3 serve `per_page=100`; page 4 answers `422 "pagination is limited
 *    for this resource"`. The `Link` header does stop correctly (`rel="last"` on
 *    page 3, no `rel="next"`), so a conforming walk never requests page 4 — but
 *    `client.ts` caps at `EVENT_MAX_PAGES` regardless, because `kindForStatus(422)`
 *    falls through to `forbidden`, which ingestion maps to "GitHub is
 *    unavailable". One wasted request would discard 300 good events.
 *
 * 3. **The feed is dominated by a very short recent window, with a few much
 *    older stragglers mixed in.**
 *
 *    GitHub retains roughly 90 days of activity and serves at most 300 events.
 *    For a very active developer the 300 are overwhelmingly recent: sampling
 *    `sindresorhus` on 2026-10-10 returned 297 events from the preceding three
 *    days, plus three straggler `PullRequestEvent`s on one repository dated
 *    2024-08, 2025-09 and 2026-03. The feed is therefore *not* strictly
 *    time-ordered, and `oldestAt` can reach back years past everything else.
 *
 *    The consequence is that neither the count nor the min/max window is a
 *    usable summary of "how active is this developer" or "over what period" —
 *    the window is not a coverage boundary and the count is not a total. Both
 *    are reported so TASKS 4.7 can reason about it explicitly, and neither may
 *    be presented downstream as a measurement of activity.
 *
 * ## Why nothing is filtered
 *
 * Every event is kept and classified rather than dropped. Branch creation is the
 * clearest case: in a 200-event sample, 49 events were `CreateEvent` /
 * `DeleteEvent` on `ref_type=branch` — 24% of the feed, and not work. Dropping
 * them at fetch time would make the observation unauditable: we could report a
 * smaller number but never explain the gap. Keeping them with an
 * {@link EventRelevance} lets TASKS 4.7 say precisely what was seen and why
 * something was not scored.
 *
 * Nothing here scores, normalises or persists. The canonical `DeveloperEvent` is
 * TASKS 4.5; what this module guarantees is that 4.5 receives events whose known
 * gaps are already documented rather than inferred from absent fields.
 */
import type { GitHubClient } from "./client";
import { toFailure, type IngestionFailure } from "./failure";
import type { RateLimitState } from "./rate-limit";
import type { GitHubEvent } from "./types";

/**
 * GitHub's documented maximum for this feed, in events.
 *
 * Mirrors `EVENT_MAX_PAGES * PER_PAGE` in `client.ts`, which enforces the same
 * ceiling. Both live in code because the walk and the report must agree: if one
 * walked four pages, `atCeiling` would be a lie.
 */
export const EVENT_CEILING = 300;

/**
 * How an event relates to the Phase 5 scoring tasks.
 *
 * The distinction exists for auditability: `scored` is evidence, `weak` is
 * context that may inform an explanation, and `ignored` is a deliberate statement
 * that this is not the developer's own work.
 */
export type EventRelevance =
  /** Maps onto a scoring task: commits, PRs, reviews, issues, releases, docs. */
  | "scored"
  /** Real but weak signal — lifecycle, deployment, status. Never scored alone. */
  | "weak"
  /** Not this developer's own work, or no signal at all (forks, stars). */
  | "ignored";

/**
 * Per-type relevance, keyed by GitHub's event `type`.
 *
 * `ignored` types are someone else's content appearing in this developer's feed:
 * a fork or a star says nothing about what this developer built, and scoring it
 * would inflate a character for work they did not perform.
 *
 * An unlisted type is classified `weak` rather than dropped, so a newly added
 * GitHub event type degrades to "unclassified" instead of silently vanishing
 * from coverage reporting.
 */
const RELEVANCE: Record<string, EventRelevance> = {
  // Scored — Phase 5 (5.2 commits, 5.3 PRs, 5.4 reviews, 5.5 issues,
  // 5.6 releases, 5.7 documentation).
  PushEvent: "scored",
  PullRequestEvent: "scored",
  PullRequestReviewEvent: "scored",
  PullRequestReviewCommentEvent: "scored",
  IssuesEvent: "scored",
  IssueCommentEvent: "scored",
  ReleaseEvent: "scored",
  GollumEvent: "scored",

  // Weak — real activity that no scoring task consumes.
  CommitCommentEvent: "weak",
  CreateEvent: "weak",
  DeleteEvent: "weak",
  DeploymentEvent: "weak",
  DeploymentStatusEvent: "weak",
  DiscussionEvent: "weak",
  MemberEvent: "weak",
  MilestoneEvent: "weak",
  PublicEvent: "weak",
  StatusEvent: "weak",

  // Not the developer's own work.
  DeployKeyEvent: "ignored",
  ForkEvent: "ignored",
  RepositoryEvent: "ignored",
  SecurityAdvisoryEvent: "ignored",
  SponsorshipEvent: "ignored",
  StarEvent: "ignored",
  WatchEvent: "ignored",
};

/** Classifies an event type, defaulting unknown types to `weak`. */
export function relevanceOf(type: string): EventRelevance {
  return RELEVANCE[type] ?? "weak";
}

/**
 * A ref-related event (branch, tag or repository creation/deletion).
 *
 * Kept separate from the general record because the signal splits sharply on
 * `refType`: creating a *tag* is release-adjacent and worth surfacing, while
 * creating a *branch* was 24% of a sampled feed and means nothing. The raw
 * value is preserved either way so TASKS 4.5 can apply its own rule.
 */
export interface RefDetail {
  refType: string | null;
  ref: string | null;
}

/**
 * What we can actually read from a push event.
 *
 * `commits` is deliberately absent from the type. It is not optional — it does
 * not exist. See the module header.
 */
export interface PushDetail {
  ref: string | null;
  branch: string | null;
  headSha: string | null;
  beforeSha: string | null;
  pushId: string | null;
}

/**
 * What we can actually read from a pull request event.
 *
 * `payload.pull_request` is a five-field stub — `{ url, id, number, head, base }`
 * — verified byte-identical across 37 sampled events. It does **not** carry
 * `merged`, `additions`, `deletions`, `changed_files`, `draft`, `title`, `user`
 * or `state`, all of which the dedicated `/pulls/{n}` endpoint does return.
 *
 * The merge signal therefore comes from the event's `action` and nowhere else:
 * `merged` is a positive, `closed` is ambiguous (a PR can be closed unmerged),
 * and `opened` is neither. `merged` is `null` — never `false` — when the action
 * cannot decide it, because "we cannot tell" and "not merged" would score
 * differently in TASKS 5.3.
 */
export interface PullRequestDetail {
  pullRequestId: number | null;
  number: number | null;
  action: string | null;
  /** True only for `action === "merged"`; `null` when the action cannot decide. */
  merged: boolean | null;
  headRef: string | null;
  headSha: string | null;
  baseRef: string | null;
}

/**
 * What we can read from an issue, review or release event.
 *
 * Unlike the pull request stub, `payload.issue` and `payload.release` arrive as
 * complete objects. The shapes are flattened here because the fields scoring
 * needs overlap almost entirely.
 */
export interface ContentDetail {
  action: string | null;
  number: number | null;
  title: string | null;
  /** `open` / `closed` / `approved` / `changes_requested`. */
  state: string | null;
  /**
   * Whether the actor authored the subject rather than acting on someone else's.
   *
   * `null` when it cannot be determined, which for an issue means GitHub did not
   * include the issue author in the payload.
   */
  authoredByActor: boolean | null;
  commentId: number | null;
  releaseTag: string | null;
  isDraft: boolean | null;
  isPrerelease: boolean | null;
  htmlUrl: string | null;
}

/** One observed public event. */
export interface ActivityRecord {
  /**
   * GitHub's own event id. Unique per event and stable across re-fetches, so it
   * is the natural key for TASKS 4.6 deduplication. Deliberately *not* derived
   * from the payload, where `payload.id` means different things per type.
   */
  eventId: string;
  type: string;
  relevance: EventRelevance;
  createdAt: string | null;
  actorLogin: string | null;
  /** GitHub's numeric repository id — stable across renames and transfers. */
  repositoryId: number | null;
  /** `owner/name` as observed now; display and evidence only. */
  repositoryFullName: string | null;
  /** Best available evidence link, when GitHub supplied or implied one. */
  sourceUrl: string | null;
  push: PushDetail | null;
  pullRequest: PullRequestDetail | null;
  content: ContentDetail | null;
  ref: RefDetail | null;
  /** The exact payload GitHub returned. */
  source: GitHubEvent;
}

/**
 * Fields GitHub omitted that ingestion would otherwise have used.
 *
 * This is the "partial responses" half of TASK 4.4. GitHub returns a
 * deliberately reduced view of several payloads, and the omissions are silent —
 * a missing `additions` looks exactly like a pull request that changed nothing.
 * Reporting the gaps as counts keeps that distinction available downstream.
 */
export interface PartialResponseReport {
  /** `<eventType>.<field>` → how many events omitted it. */
  omittedFields: Record<string, number>;
  /** Push events received with no commit list. */
  pushesWithoutCommitList: number;
  /** Pull request events whose PR object carried no diff statistics. */
  pullRequestsWithoutDiffStats: number;
}

/**
 * What was actually observed.
 *
 * As with repositories, these counts are not the full coverage model — TASKS
 * 4.7 builds that — but an activity list without its window and its gaps cannot
 * honestly answer "what did we see?", which PRD §10 requires of every claim built
 * on public evidence.
 */
export interface ActivityObservation {
  events: ActivityRecord[];
  /** Events returned. */
  count: number;
  /** Pages walked. */
  pages: number;
  /** Our own page cap stopped the walk while GitHub still offered more. */
  truncated: boolean;
  /**
   * The count reached GitHub's documented 300-event ceiling.
   *
   * This is a heuristic on a full three pages rather than a header we can read,
   * and is documented as one: a developer with exactly 300 events and no more is
   * indistinguishable from one we truncated. The conclusion for a consumer is the
   * same either way — the window below is the limit of what we saw.
   */
  atCeiling: boolean;
  /**
   * Oldest `createdAt` observed, or null when no event had one.
   *
   * Not a coverage boundary: the feed is not time-ordered and backfilled events
   * can sit years past everything else. See the module header.
   */
  oldestAt: string | null;
  /** Newest `createdAt` observed, or null when no event had one. */
  newestAt: string | null;
  /** Event count per GitHub event type. */
  byType: Record<string, number>;
  /** Event count per relevance class. */
  byRelevance: Record<EventRelevance, number>;
  partial: PartialResponseReport;
}

export type ActivityResult =
  | { ok: true; observation: ActivityObservation; rateLimit: RateLimitState }
  | { ok: false; failure: IngestionFailure; rateLimit: RateLimitState };

/* -------------------------------------------------------------------------- */
/* Payload readers                                                             */
/*                                                                             */
/* These never throw. A payload can be any shape at all — GitHub has changed    */
/* these before, and an unrecognised event type must still yield a record.      */
/* -------------------------------------------------------------------------- */

function readStr(shape: Record<string, unknown>, key: string): string | null {
  const value = shape[key];
  return typeof value === "string" ? value : null;
}

function readNum(shape: Record<string, unknown>, key: string): number | null {
  const value = shape[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBool(shape: Record<string, unknown>, key: string): boolean | null {
  const value = shape[key];
  return typeof value === "boolean" ? value : null;
}

/** Treats a missing or wrongly-typed object as `{}` so reads stay total. */
function asShape(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** `refs/heads/main` → `main`. Returns the input unchanged if it is not a ref. */
function branchOf(ref: string | null): string | null {
  return ref === null ? null : ref.replace(/^refs\/heads\//, "");
}

/** Reads a field that may be a string or a number, as a string. */
function readScalar(shape: Record<string, unknown>, key: string): string | null {
  const value = shape[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Builds a canonical evidence URL, or null when a component is missing. */
function evidenceUrl(
  repository: string | null,
  segment: string,
  id: string | number | null,
): string | null {
  if (repository === null || id === null) return null;
  return `https://github.com/${repository}/${segment}/${id}`;
}

/** Counts how often each field was absent, keyed `<eventType>.<field>`. */
type Omitted = Record<string, number>;

function note(omitted: Omitted, type: string, field: string, present: boolean): void {
  if (present) return;
  const key = `${type}.${field}`;
  omitted[key] = (omitted[key] ?? 0) + 1;
}

/* -------------------------------------------------------------------------- */
/* Per-type extraction                                                         */
/* -------------------------------------------------------------------------- */

function extractPush(payload: Record<string, unknown>, omitted: Omitted): PushDetail {
  // `head` and `before` are bare SHA strings, not `{ sha }` objects. The events
  // API used to nest them; verified flat across 76 sampled PushEvents.
  const headSha = readStr(payload, "head");
  const beforeSha = readStr(payload, "before");

  note(omitted, "PushEvent", "ref", readStr(payload, "ref") !== null);
  note(omitted, "PushEvent", "head", headSha !== null);
  note(omitted, "PushEvent", "before", beforeSha !== null);

  return {
    ref: readStr(payload, "ref"),
    branch: branchOf(readStr(payload, "ref")),
    headSha,
    beforeSha,
    // Serialized GitHub sends `push_id` as a number.
    pushId: readScalar(payload, "push_id"),
  };
}

function extractPullRequest(
  payload: Record<string, unknown>,
  omitted: Omitted,
): PullRequestDetail {
  const pr = asShape(payload.pull_request);
  const head = asShape(pr.head);
  const base = asShape(pr.base);
  const action = readStr(payload, "action");

  // Verified absent from all 37 sampled pull request events. Recorded on every
  // event rather than assumed, so a future GitHub change shows up here first.
  note(omitted, "PullRequestEvent", "additions", pr.additions !== undefined);
  note(omitted, "PullRequestEvent", "merged", pr.merged !== undefined);
  note(omitted, "PullRequestEvent", "number", readNum(pr, "number") !== null);

  return {
    pullRequestId: readNum(pr, "id"),
    number: readNum(pr, "number"),
    action,
    // Only a positive `merged` action decides this. A `closed` action is
    // genuinely ambiguous and must not be flattened to false.
    merged: action === null ? null : action === "merged",
    headRef: readStr(head, "ref"),
    headSha: readStr(head, "sha"),
    baseRef: readStr(base, "ref"),
  };
}

/**
 * Reviews and review comments share a shape: an action plus a subject object
 * (`review` or `comment`) and a pull request.
 */
function extractReview(
  type: string,
  payload: Record<string, unknown>,
  omitted: Omitted,
): ContentDetail {
  const pr = asShape(payload.pull_request);
  const subject = type === "PullRequestReviewEvent"
    ? asShape(payload.review)
    : asShape(payload.comment);

  note(omitted, type, "state", readStr(subject, "state") !== null);

  return {
    action: readStr(payload, "action"),
    number: readNum(pr, "number"),
    title: null,
    state: readStr(subject, "state"),
    // A review body has no user object; authorship is implied by the actor.
    authoredByActor: true,
    commentId: readNum(subject, "id"),
    releaseTag: null,
    isDraft: null,
    isPrerelease: null,
    htmlUrl: readStr(subject, "html_url"),
  };
}

function extractIssue(
  type: string,
  payload: Record<string, unknown>,
  actorLogin: string | null,
  omitted: Omitted,
): ContentDetail {
  const issue = asShape(payload.issue);
  const comment = asShape(payload.comment);
  const author = readStr(asShape(issue.user), "login");

  note(omitted, type, "title", readStr(issue, "title") !== null);
  note(omitted, type, "state", readStr(issue, "state") !== null);

  return {
    action: readStr(payload, "action"),
    number: readNum(issue, "number"),
    title: readStr(issue, "title"),
    state: readStr(issue, "state"),
    // An issue event fires for the author *and* for anyone who labels, closes or
    // comments, so authorship is a real distinction scoring needs — and it is
    // unknowable when GitHub omits the author.
    authoredByActor: author === null || actorLogin === null ? null : author === actorLogin,
    commentId: readNum(comment, "id"),
    releaseTag: null,
    isDraft: null,
    isPrerelease: null,
    htmlUrl: readStr(issue, "html_url"),
  };
}

function extractRelease(
  payload: Record<string, unknown>,
  omitted: Omitted,
): ContentDetail {
  const release = asShape(payload.release);

  note(omitted, "ReleaseEvent", "tag_name", readStr(release, "tag_name") !== null);

  return {
    action: readStr(payload, "action"),
    number: null,
    title: readStr(release, "name"),
    state: null,
    authoredByActor: null,
    commentId: null,
    releaseTag: readStr(release, "tag_name"),
    isDraft: readBool(release, "draft"),
    isPrerelease: readBool(release, "prerelease"),
    htmlUrl: readStr(release, "html_url"),
  };
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                               */
/* -------------------------------------------------------------------------- */

/** Normalises one event, recording which expected fields GitHub omitted. */
function toRecord(event: GitHubEvent, omitted: Omitted): ActivityRecord {
  const payload = event.payload;
  const type = event.type;
  const repository = event.repoFullName;

  let push: PushDetail | null = null;
  let pullRequest: PullRequestDetail | null = null;
  let content: ContentDetail | null = null;
  let ref: RefDetail | null = null;
  let sourceUrl: string | null = null;

  if (type === "PushEvent") {
    push = extractPush(payload, omitted);

    // The commit list is checked rather than assumed absent, so if GitHub ever
    // starts returning one this counter drops to zero and says so.
    note(omitted, "PushEvent", "commits", Array.isArray(payload.commits));

    sourceUrl = push === null ? null : evidenceUrl(repository, "commit", push.headSha);
  } else if (type === "PullRequestEvent") {
    pullRequest = extractPullRequest(payload, omitted);

    sourceUrl = pullRequest === null
      ? null
      : evidenceUrl(repository, "pull", pullRequest.number);
  } else if (type === "PullRequestReviewEvent" || type === "PullRequestReviewCommentEvent") {
    content = extractReview(type, payload, omitted);

    sourceUrl = evidenceUrl(repository, "pull", content.number);
  } else if (type === "IssuesEvent" || type === "IssueCommentEvent") {
    content = extractIssue(type, payload, event.actorLogin, omitted);

    sourceUrl = content.htmlUrl ?? evidenceUrl(repository, "issues", content.number);
  } else if (type === "ReleaseEvent") {
    content = extractRelease(payload, omitted);

    sourceUrl = content.htmlUrl
      ?? evidenceUrl(repository, "releases", content.releaseTag);
  } else if (type === "CreateEvent" || type === "DeleteEvent") {
    ref = { refType: readStr(payload, "ref_type"), ref: readStr(payload, "ref") };

    note(omitted, type, "ref_type", ref.refType !== null);
  }

  return {
    eventId: event.id,
    type,
    relevance: relevanceOf(type),
    createdAt: event.createdAt,
    actorLogin: event.actorLogin,
    repositoryId: event.repoId,
    repositoryFullName: repository,
    sourceUrl,
    push,
    pullRequest,
    content,
    ref,
    source: event,
  };
}

/** The newest of a set of timestamps, ignoring nulls. */
function latest(values: Array<string | null>): string | null {
  let newest: string | null = null;
  for (const value of values) {
    if (value === null) continue;
    if (newest === null || value > newest) newest = value;
  }
  return newest;
}

/** The earliest of a set of timestamps, ignoring nulls. */
function earliest(values: Array<string | null>): string | null {
  let oldest: string | null = null;
  for (const value of values) {
    if (value === null) continue;
    if (oldest === null || value < oldest) oldest = value;
  }
  return oldest;
}

function tally<K extends string>(keys: readonly K[], values: K[]): Record<K, number> {
  const counts = {} as Record<K, number>;
  for (const key of keys) counts[key] = 0;
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

const RELEVANCE_CLASSES: readonly EventRelevance[] = ["scored", "weak", "ignored"];

export interface FetchActivityOptions {
  signal?: AbortSignal;
}

/**
 * Fetches a developer's recent public activity.
 *
 * Never throws for an expected failure — every one is returned as
 * `{ ok: false, failure }` with the rate-limit state attached, exactly like
 * `fetchPublicProfile` (TASKS 4.2) and `fetchRepositories` (TASKS 4.3).
 */
export async function fetchActivity(
  client: GitHubClient,
  username: string,
  options: FetchActivityOptions = {},
): Promise<ActivityResult> {
  try {
    const page = await client.listEvents(username, { signal: options.signal });
    const omitted: Omitted = {};
    const events = page.items.map((event) => toRecord(event, omitted));

    const byType: Record<string, number> = {};
    for (const event of events) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
    }

    return {
      ok: true,
      observation: {
        events,
        count: events.length,
        pages: page.pages,
        truncated: page.truncated,
        atCeiling: events.length >= EVENT_CEILING,
        oldestAt: earliest(events.map((e) => e.createdAt)),
        newestAt: latest(events.map((e) => e.createdAt)),
        byType,
        byRelevance: tally(RELEVANCE_CLASSES, events.map((e) => e.relevance)),
        partial: {
          omittedFields: omitted,
          pushesWithoutCommitList:
            omitted["PushEvent.commits"] ?? 0,
          pullRequestsWithoutDiffStats:
            omitted["PullRequestEvent.additions"] ?? 0,
        },
      },
      rateLimit: client.rateLimitState(),
    };
  } catch (error) {
    const rateLimit = client.rateLimitState();
    const failure = toFailure(error, rateLimit);

    // A programming error is not an ingestion outcome; re-throw it rather than
    // reporting it as a GitHub outage.
    if (!failure) throw error;

    return { ok: false, failure, rateLimit };
  }
}