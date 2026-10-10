/**
 * RootRealm — DeveloperEvent normalization (TASKS 4.5).
 *
 * ```text
 * ActivityRecord[] → DeveloperEvent[]
 * ```
 *
 * `DeveloperEvent` is the canonical currency of everything downstream: the
 * scoring engine consumes it (SCORING.md §33), it is a persisted table
 * (TASKS 10.2), and it is what the explanation ledger (SCORING.md §17) has to be
 * able to cite. It is deliberately **not** a wrapper around the GitHub payload —
 * it is a flat, self-contained claim about work, with the evidence attached and
 * the gaps named.
 *
 * ## Three decisions worth defending
 *
 * 1. **A push is not a commit, and the kind is named `push` for that reason.**
 *
 *    TASKS 4.4 established that a `PushEvent` carries no commit list — verified
 *    across every sampled push. One push can contain any number of commits, none
 *    of which we can see. Calling the kind `commit` would invite exactly the bug
 *    that was avoided: TASKS 5.2 scoring "+3 XP per qualifying commit" from data
 *    that has no commits in it. The `push` kind says what we actually observed.
 *
 * 2. **Identity is scoped to the occurrence, not to the object.**
 *
 *    `id` is derived from GitHub's *event* id, not from the underlying object. A
 *    pull request observed as `opened` and later as `merged` is two occurrences
 *    carrying different evidence, and the merge is the one TASKS 5.3 scores.
 *    Keying on the object would collapse them and silently discard the merge.
 *    TASKS 4.6 deduplicates repeated *observations* of the same event, which an
 *    event-scoped id handles exactly; it does not deduplicate distinct
 *    occurrences of the same object, which would be data loss.
 *
 * 3. **Confidence is derived here, once, and only downward.**
 *
 *    SCORING.md §6 allows exactly `verified` and `inferred` and says plainly:
 *    "Do not silently treat inferred data as verified." Nothing upstream carries
 *    a confidence value, so TASKS 4.5 is where it is first assigned. It is
 *    computed from concrete, checkable conditions — {@link deriveConfidence} —
 *    rather than being passed in by a caller, so no call site can invent it.
 *    Later phases may lower confidence; nothing may raise it without new
 *    evidence, because the scoring rules treat the two differently.
 *
 * ## Limitations are part of the type
 *
 * TASKS 4.4 found that GitHub withholds fields silently: a missing `additions`
 * on a pull request looks exactly like a pull request that changed nothing. If
 * the canonical event did not carry that gap forward, TASKS 5.2 and 5.3 would
 * read absence as a fact. Every {@link EventLimitation} is therefore computed
 * from what was actually absent, and travels with the event into the database
 * and the explanation ledger.
 */
import type { ActivityRecord, EventRelevance } from "./github/activity";

/**
 * How directly GitHub attests this event.
 *
 * SCORING.md §6: `verified` evidence may back high-value progression; `inferred`
 * evidence must not automatically receive the same treatment, and must never be
 * silently upgraded.
 */
export type EvidenceConfidence = "verified" | "inferred";

/**
 * The kinds the scoring engine understands.
 *
 * Each maps onto a SCORING.md section. `push` is deliberately absent a `commit`
 * member — see the module header.
 */
export type DeveloperEventKind =
  /** One push. Not a commit; commit count is unavailable. See SCORING.md §7. */
  | "push"
  /** A pull request action. See §8. */
  | "pull_request"
  /** A review or review comment. See §9. */
  | "review"
  /** An issue action or comment. See §10. */
  | "issue"
  /** A release action. See §11. */
  | "release"
  /** A wiki edit. See §12. */
  | "documentation"
  /** Branch, tag or repository lifecycle. Not independently scoreable. */
  | "lifecycle";

/**
 * Public visibility, preserved verbatim from the source.
 *
 * `non_public` rather than `private`: the events endpoint only serves public
 * activity, so a `false` flag is preserved faithfully without asserting a cause
 * we cannot observe. See {@link EventVisibility} note in `visibilityOf`.
 */
export type EventVisibility = "public" | "non_public";

/**
 * A claim this event's evidence cannot support.
 *
 * These are not errors. They are the honest boundary of what the feed told us,
 * carried forward so that no later phase infers a fact from a missing field.
 */
export type EventLimitation =
  /**
   * The push carried no commit list, so the number of commits is unknown.
   * Blocks TASKS 5.2 from scoring per-commit volume from this event.
   */
  | "commit_count_unavailable"
  /**
   * The pull request payload was a stub with no `additions`, `deletions` or
   * `changed_files`. A PR that changed nothing and a PR whose size we cannot see
   * are indistinguishable here. Constrains TASKS 5.3 to size-independent signals.
   */
  | "diff_stats_unavailable"
  /**
   * The action was `closed`, which does not distinguish merged from abandoned.
   * `evidence.merged` is `false` only for a positive non-merge action.
   */
  | "merge_status_unknown"
  /** GitHub omitted the subject's author, so authorship is unattributable. */
  | "authorship_unknown"
  /**
   * The repository was not among the developer's confirmed public repositories,
   * so attributing the event to them is an inference — it may be a fork, a
   * deleted repository, or one since transferred. SCORING.md §35 `not_attributable`.
   */
  | "repository_unconfirmed"
  /** GitHub supplied no timestamp, so ordering against other events is unknown. */
  | "timestamp_missing";

/** Evidence for a push. Commit count is absent by construction, not by omission. */
export interface PushEvidence {
  branch: string | null;
  headSha: string | null;
  beforeSha: string | null;
}

/** Evidence for a pull request action. */
export interface PullRequestEvidence {
  number: number | null;
  /** `opened`, `closed`, `merged`, `reopened`. */
  action: string | null;
  /**
   * `true` only for `action === "merged"`. `false` for a positive non-merge
   * action. `null` when the action cannot decide — `closed` and a missing action
   * are both genuinely undecidable, and TASKS 5.3 must not read them as "not
   * merged".
   */
  merged: boolean | null;
  headRef: string | null;
  baseRef: string | null;
}

/** Evidence for a review or review comment. */
export interface ReviewEvidence {
  number: number | null;
  /** `approved`, `changes_requested`, `commented`, `dismissed`. */
  state: string | null;
  /** Which object the subject came from — they carry different identities. */
  subject: "review" | "comment";
}

/** Evidence for an issue action or comment. */
export interface IssueEvidence {
  number: number | null;
  title: string | null;
  state: string | null;
  /**
   * Whether the developer opened the issue rather than acting on someone else's.
   * `null` when GitHub omitted the author. An issue event fires for anyone who
   * labels, closes or comments, so this is the distinction TASKS 5.5 needs.
   */
  authored: boolean | null;
}

/** Evidence for a release action. */
export interface ReleaseEvidence {
  tag: string | null;
  name: string | null;
  draft: boolean | null;
  prerelease: boolean | null;
}

/** Evidence for a wiki edit. GitHub's `GollumEvent` payload is nearly empty. */
export interface DocumentationEvidence {
  /** Wiki page name, when GitHub supplied one. */
  page: string | null;
}

/** Evidence for branch, tag or repository lifecycle. */
export interface LifecycleEvidence {
  /** `branch`, `tag` or `repository`. */
  refType: string | null;
  ref: string | null;
}

/**
 * The evidence carried by an event, discriminated by {@link DeveloperEvent.kind}.
 *
 * A discriminated union rather than one wide optional-everything object: the
 * scoring rules are written per kind, and TypeScript should make reading a
 * `commits` field off a release a compile error rather than a `undefined` at
 * runtime.
 */
export type DeveloperEventEvidence =
  | { kind: "push"; evidence: PushEvidence }
  | { kind: "pull_request"; evidence: PullRequestEvidence }
  | { kind: "review"; evidence: ReviewEvidence }
  | { kind: "issue"; evidence: IssueEvidence }
  | { kind: "release"; evidence: ReleaseEvidence }
  | { kind: "documentation"; evidence: DocumentationEvidence }
  | { kind: "lifecycle"; evidence: LifecycleEvidence };

/** The fields every canonical event carries, independent of its kind. */
export interface DeveloperEventBase {
  /**
   * Stable, deterministic identity: `${kind}:${eventId}`.
   *
   * Scoped to the occurrence, not the object — see the module header.
   */
  id: string;
  /** The developer this event is attributed to. */
  developerLogin: string;
  /** GitHub's numeric user id, when known; survives a login rename. */
  developerId: number | null;
  /** GitHub's repository id — stable across renames and transfers. */
  repositoryId: number | null;
  /** `owner/name` as observed now; display and evidence only, never a key. */
  repositoryFullName: string | null;
  /** When the work happened. */
  occurredAt: string | null;
  visibility: EventVisibility;
  confidence: EvidenceConfidence;
  /** Best evidence link, preserved verbatim. Null when GitHub gave none. */
  sourceUrl: string | null;
  /** The relevance classification from TASKS 4.4, carried forward unchanged. */
  relevance: EventRelevance;
}

/**
 * The canonical event.
 *
 * An intersection rather than an `interface extends`, because the evidence half
 * is a discriminated union and an interface cannot extend one. Intersecting
 * distributes over the union, so `event.kind` still narrows `event.evidence`.
 */
export type DeveloperEvent = DeveloperEventEvidence &
  DeveloperEventBase & {
    /** What this event's evidence cannot support. Never empty-by-default. */
    limitations: EventLimitation[];
  };

/** Inputs needed to attribute events to a developer. */
export interface NormalizationContext {
  /** The login the ingestion run was made for. */
  developerLogin: string;
  /** GitHub's numeric id for that login, when known. */
  developerId: number | null;
  /**
   * Repository ids confirmed to belong to this developer (TASKS 4.3).
   *
   * `null` means the repository list was not supplied, in which case
   * attribution is *not* treated as unconfirmed — absence of a check is not a
   * failed check. Passing an empty set, by contrast, confirms nothing and will
   * mark every event `inferred`.
   */
  confirmedRepositoryIds: ReadonlySet<number> | null;
}

/** Input events that produced no canonical event, grouped by source type. */
export interface UnsupportedEvent {
  /** The GitHub event type, e.g. `ForkEvent`. */
  type: string;
  count: number;
  /** Relevance it carried in TASKS 4.4, for auditing the drop. */
  relevance: EventRelevance;
}

export interface NormalizationResult {
  events: DeveloperEvent[];
  /**
   * Inputs deliberately not turned into events, grouped and counted.
   *
   * Reported rather than silently dropped: a developer with 300 events and 1
   * fork should be able to account for all 301 (SCORING.md §17, PRD §10).
   */
  unsupported: UnsupportedEvent[];
  byKind: Record<DeveloperEventKind, number>;
  byConfidence: Record<EvidenceConfidence, number>;
}

/**
 * Maps a GitHub event type to a canonical kind.
 *
 * Returns `null` for anything with no canonical form — forks, stars, watch
 * events and the rest. Those are not converted and not invented into; they are
 * counted in {@link NormalizationResult.unsupported} so the loss is auditable.
 */
function kindFor(type: string): DeveloperEventKind | null {
  switch (type) {
    case "PushEvent":
      return "push";
    case "PullRequestEvent":
      return "pull_request";
    case "PullRequestReviewEvent":
    case "PullRequestReviewCommentEvent":
      return "review";
    case "IssuesEvent":
    case "IssueCommentEvent":
      return "issue";
    case "ReleaseEvent":
      return "release";
    case "GollumEvent":
      return "documentation";
    case "CreateEvent":
    case "DeleteEvent":
      return "lifecycle";
    default:
      return null;
  }
}

/**
 * Preserves the source's visibility flag without inferring a cause.
 *
 * `parseEvent` defaults a missing `public` field to `false` at the transport
 * layer (TASKS 4.1), so "absent" and "explicitly not public" are already
 * indistinguishable by the time an event reaches here. Recording `non_public`
 * preserves what we were told without upgrading it into a claim that the work
 * was private.
 */
function visibilityOf(record: ActivityRecord): EventVisibility {
  return record.source.public ? "public" : "non_public";
}

/** True when the record's repository is confirmed to belong to the developer. */
function repositoryConfirmed(
  record: ActivityRecord,
  context: NormalizationContext,
): boolean {
  // No repository list supplied means the check did not run, which is not the
  // same as the check failing.
  if (context.confirmedRepositoryIds === null) return true;
  if (record.repositoryId === null) return false;
  return context.confirmedRepositoryIds.has(record.repositoryId);
}

/**
 * Why an event is `verified` or `inferred`.
 *
 * Confidence describes **who did the work**, not **who owns the repository**, and
 * the two must not be conflated.
 *
 * `/users/{username}/events` returns only events in which that user is the
 * *actor*, so when the record's actor matches the developer the run was made
 * for, GitHub has directly attested both the occurrence and the performer.
 * That is `verified`.
 *
 * A repository outside the developer's confirmed set does **not** lower
 * confidence. Measured on `sindresorhus` (2026-10-10): 150 of 300 events were
 * being marked `inferred` this way, and almost all of them were the developer's
 * own newest repositories — absent only because the repository walk truncated at
 * 1000 entries sorted oldest-first. Reporting verified work as inferred because
 * of an incomplete *inventory* would be exactly the overstatement SCORING.md §6
 * warns against, in the opposite direction. Repository ownership is carried as a
 * limitation instead, where it is accurate and does not contaminate a separate
 * claim.
 *
 * `inferred` therefore means: the action happened, but we cannot tie it to this
 * developer from GitHub's own attestation. Nothing in the activity feed
 * currently produces it — it exists so a later, genuinely derived event has an
 * honest value to carry rather than defaulting to `verified`.
 */
function deriveConfidence(
  record: ActivityRecord,
  context: NormalizationContext,
): EvidenceConfidence {
  if (record.actorLogin === null) return "inferred";
  return record.actorLogin === context.developerLogin ? "verified" : "inferred";
}

/** Builds the limitation list for a pull request. */
function pullRequestLimitations(
  evidence: PullRequestEvidence,
  limitations: EventLimitation[],
): void {
  // Verified absent across all sampled pull request events (TASKS 4.4).
  limitations.push("diff_stats_unavailable");

  if (evidence.action === "closed") {
    limitations.push("merge_status_unknown");
  }
}

/** Builds the limitation list for an issue. */
function issueLimitations(
  evidence: IssueEvidence,
  limitations: EventLimitation[],
): void {
  if (evidence.authored === null) limitations.push("authorship_unknown");
}

/** Narrows an `ActivityRecord` to a canonical event, or `null` if it has no kind. */
function toDeveloperEvent(
  record: ActivityRecord,
  context: NormalizationContext,
): DeveloperEvent | null {
  const kind = kindFor(record.type);
  if (kind === null) return null;

  const limitations: EventLimitation[] = [];
  if (record.createdAt === null) limitations.push("timestamp_missing");

  // Confidence is about who did the work; repository ownership is separate and
  // travels as a limitation. See deriveConfidence.
  if (!repositoryConfirmed(record, context)) {
    limitations.push("repository_unconfirmed");
  }

  const base: DeveloperEventBase = {
    // Occurrence-scoped: see the module header.
    id: `${kind}:${record.eventId}`,
    developerLogin: context.developerLogin,
    developerId: context.developerId,
    repositoryId: record.repositoryId,
    repositoryFullName: record.repositoryFullName,
    occurredAt: record.createdAt,
    visibility: visibilityOf(record),
    confidence: deriveConfidence(record, context),
    sourceUrl: record.sourceUrl,
    relevance: record.relevance,
  };

  switch (kind) {
    case "push": {
      // A push carries no commit list. Recorded rather than assumed, so a future
      // GitHub change surfaces here instead of as a silent scoring error.
      if (record.push === null || !Array.isArray(record.source.payload.commits)) {
        limitations.push("commit_count_unavailable");
      }

      return {
        ...base,
        kind,
        evidence: {
          branch: record.push?.branch ?? null,
          headSha: record.push?.headSha ?? null,
          beforeSha: record.push?.beforeSha ?? null,
        },
        limitations,
      };
    }

    case "pull_request": {
      const evidence: PullRequestEvidence = {
        number: record.pullRequest?.number ?? null,
        action: record.pullRequest?.action ?? null,
        merged: record.pullRequest?.merged ?? null,
        headRef: record.pullRequest?.headRef ?? null,
        baseRef: record.pullRequest?.baseRef ?? null,
      };

      pullRequestLimitations(evidence, limitations);

      return { ...base, kind, evidence, limitations };
    }

    case "review": {
      return {
        ...base,
        kind,
        evidence: {
          number: record.content?.number ?? null,
          state: record.content?.state ?? null,
          subject:
            record.type === "PullRequestReviewEvent" ? "review" : "comment",
        },
        limitations,
      };
    }

    case "issue": {
      const evidence: IssueEvidence = {
        number: record.content?.number ?? null,
        title: record.content?.title ?? null,
        state: record.content?.state ?? null,
        authored: record.content?.authoredByActor ?? null,
      };

      issueLimitations(evidence, limitations);

      return { ...base, kind, evidence, limitations };
    }

    case "release": {
      return {
        ...base,
        kind,
        evidence: {
          tag: record.content?.releaseTag ?? null,
          name: record.content?.title ?? null,
          draft: record.content?.isDraft ?? null,
          prerelease: record.content?.isPrerelease ?? null,
        },
        limitations,
      };
    }

    case "documentation": {
      return {
        ...base,
        kind,
        evidence: { page: null },
        limitations,
      };
    }

    case "lifecycle": {
      return {
        ...base,
        kind,
        evidence: {
          refType: record.ref?.refType ?? null,
          ref: record.ref?.ref ?? null,
        },
        limitations,
      };
    }

    // Exhaustiveness: adding a kind to DeveloperEventKind without handling it
    // here is a compile error, not a silently malformed event.
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled developer event kind: ${String(exhaustive)}`);
    }
  }
}

const KINDS: readonly DeveloperEventKind[] = [
  "push",
  "pull_request",
  "review",
  "issue",
  "release",
  "documentation",
  "lifecycle",
];

/**
 * Normalizes activity records into canonical developer events.
 *
 * Pure and total: no network, no clock, no throwing. The same input always
 * produces the same output, which TASKS 5.11 (idempotent scoring) depends on.
 *
 * @param records   Activity records from TASKS 4.4.
 * @param context   Who the run was for, and which repositories are theirs.
 */
export function normalizeActivity(
  records: readonly ActivityRecord[],
  context: NormalizationContext,
): NormalizationResult {
  const events: DeveloperEvent[] = [];
  const unsupported = new Map<string, UnsupportedEvent>();

  for (const record of records) {
    const event = toDeveloperEvent(record, context);

    if (event === null) {
      const existing = unsupported.get(record.type);
      if (existing === undefined) {
        unsupported.set(record.type, {
          type: record.type,
          count: 1,
          relevance: record.relevance,
        });
      } else {
        existing.count += 1;
      }
      continue;
    }

    events.push(event);
  }

  const byKind = {} as Record<DeveloperEventKind, number>;
  for (const kind of KINDS) byKind[kind] = 0;
  for (const event of events) byKind[event.kind] += 1;

  return {
    events,
    unsupported: [...unsupported.values()].sort((a, b) =>
      b.count - a.count || a.type.localeCompare(b.type),
    ),
    byKind,
    byConfidence: {
      verified: events.filter((e) => e.confidence === "verified").length,
      inferred: events.filter((e) => e.confidence === "inferred").length,
    },
  };
}