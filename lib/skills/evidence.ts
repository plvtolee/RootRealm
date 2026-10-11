/**
 * RootRealm — evidence rules (TASKS 6.3).
 *
 * ```text
 * EvidenceRequirement + DeveloperEvent[] → how many each node has
 * ```
 *
 * TASKS 6.1 defined the eight evidence kinds a node can require. TASKS 6.2
 * evaluated prerequisites. This module answers the second gate: does the
 * developer's event history satisfy the node's evidence requirement?
 *
 * ## What this module does not do
 *
 * - It does not decide whether a node is "unlocked" — that is TASKS 6.5's
 *   domain, and it needs prerequisites (6.2) + evidence (here) + the learned
 *   set (6.5) together.
 * - It does not store anything. It is a pure function: evidence in, counts out.
 * - It does not infer. If the evidence is not present, the count is zero.
 *   Guessing would violate SCORING.md §1's "evidence-backed" and §5's
 *   "sufficient evidence confidence".
 *
 * ## How the counts are derived
 *
 * Each EvidenceRequirement kind maps to a specific query over the developer's
 * normalized event history. The queries are deliberate and conservative:
 *
 * - `merged_pull_requests` → PullRequestEvent with `merged === true` and `action === "merged"`
 * - `completed_reviews` → ReviewEvent with `state === "approved"` and `action === "created"`
 * - `linked_issue_closures` → IssueEvent with `action === "closed"`, `authored` determines Debugger vs Maintainer
 * - `published_releases` → ReleaseEvent with `action === "published"` and `draft !== true`
 * - `qualifying_documentation` → DocumentationEvent with `pagesCreated > 0`
 * - `verified_regression_tests` → PullRequestEvent with `testFiles` non-null and non-empty
 * - `landed_pushes` → PushEvent with `headSha !== beforeSha` (code actually moved)
 * - `attribute_units` → derived from the attribute progress totals (a separate axis)
 *
 * The counts are integers. The rules are deliberately not fractional, because
 * SCORING.md §16 says attribute units are integers.
 *
 * ## What is not yet supported (and why)
 *
 * - `discussion` events are not yet ingested, so "discussions" for Collaborator
 *   are not counted. This is an evidence gap, not a design decision.
 * - "CI maintenance" for Maintainer needs workflow runs, which are not ingested.
 * - "Cross-project work" for Collaborator needs repository context the current
 *   event does not carry.
 *
 * These are honest gaps — the evidence rule for a kind that nothing ingests
 * simply returns zero, so the skill node reports zero progress rather than
 * pretending the evidence exists.
 */
import type { DeveloperEvent } from "../developer-event";
import type { EvidenceRequirement } from "./definition";

/**
 * Counts how many merged pull requests the developer has.
 */
export function countMergedPullRequests(events: readonly DeveloperEvent[]): number {
  return events.filter(
    (event) =>
      event.kind === "pull_request" &&
      event.evidence.merged === true &&
      event.evidence.action === "merged",
  ).length;
}

/**
 * Counts how many completed (approved) reviews the developer has given.
 */
export function countCompletedReviews(events: readonly DeveloperEvent[]): number {
  return events.filter(
    (event) =>
      event.kind === "review" &&
      event.evidence.state === "approved" &&
      event.evidence.action === "created" &&
      event.evidence.subject === "review",
  ).length;
}

/**
 * Counts how many linked issues the developer closed.
 *
 * Returns the total; the caller splits into Debugger/Maintainer if needed.
 * The distinction is a 6.4 concern; this just counts the closures.
 */
export function countLinkedIssueClosures(
  events: readonly DeveloperEvent[],
): { total: number; authored: number; triaged: number } {
  let total = 0;
  let authored = 0;
  let triaged = 0;

  for (const event of events) {
    if (event.kind !== "issue") continue;
    if (event.evidence.action !== "closed") continue;

    total += 1;
    if (event.evidence.authored === true) authored += 1;
    else if (event.evidence.authored === false) triaged += 1;
    // authored === null → authorship unknown, counted in total but neither split
  }

  return { total, authored, triaged };
}

/**
 * Counts how many releases the developer published.
 */
export function countPublishedReleases(events: readonly DeveloperEvent[]): number {
  return events.filter(
    (event) =>
      event.kind === "release" &&
      event.evidence.action === "published" &&
      event.evidence.draft !== true,
  ).length;
}

/**
 * Counts how many pages of documentation the developer created.
 *
 * Only creations count; edits do not. §12 is explicit: "Documentation must be
 * classified as meaningful qualifying work rather than simply any textual change",
 * and with no diff size available, creation is the only unambiguous signal.
 */
export function countQualifyingDocumentation(events: readonly DeveloperEvent[]): number {
  return events.filter(
    (event) =>
      event.kind === "documentation" &&
      (event.evidence.pagesCreated ?? 0) > 0,
  ).length;
}

/**
 * Counts how many pull requests contain verified regression tests.
 *
 * Requires the TASKS 5.8 files fetch to have run (testFiles non-null and
 * non-empty). If the fetch has not run, the count is zero — an evidence gap,
 * not a failure.
 */
export function countVerifiedRegressionTests(events: readonly DeveloperEvent[]): number {
  return events.filter(
    (event) =>
      event.kind === "pull_request" &&
      event.evidence.testFiles !== null &&
      event.evidence.testFiles.length > 0,
  ).length;
}

/**
 * Counts how many pushes actually landed code.
 *
 * A push where `headSha === beforeSha` moved nothing (branch tip unchanged).
 * GitHub emits these, and awarding for them would be the "trivial activity"
 * SCORING.md §7 warns against. A missing `beforeSha` is treated as moved
 * (GitHub withheld the field, not evidence of no change).
 */
export function countLandedPushes(events: readonly DeveloperEvent[]): number {
  return events.filter(
    (event) =>
      event.kind === "push" &&
      event.evidence.headSha !== null &&
      event.evidence.beforeSha !== null &&
      event.evidence.headSha !== event.evidence.beforeSha,
  ).length;
}

/**
 * All evidence counts for a developer's event history, keyed by requirement kind.
 *
 * The attribute_units count is deliberately absent here — it comes from the
 * attribute progress axis (TASKS 6.4), not from event counting.
 */
export interface EvidenceCounts {
  readonly merged_pull_requests: number;
  readonly completed_reviews: number;
  readonly linked_issue_closures_total: number;
  readonly linked_issue_closures_authored: number;
  readonly linked_issue_closures_triaged: number;
  readonly published_releases: number;
  readonly qualifying_documentation: number;
  readonly verified_regression_tests: number;
  readonly landed_pushes: number;
}

/**
 * Computes all evidence counts from a developer's event history.
 *
 * Pure, deterministic, and the single source of truth for "what does this
 * developer have evidence for". Every EvidenceRequirement kind that can be
 * counted from ingested events has a counter here; kinds that cannot be
 * counted (e.g., discussions, CI maintenance) simply don't appear, so they
 * contribute zero rather than being guessed.
 */
export function computeAllEvidence(
  events: readonly DeveloperEvent[],
): EvidenceCounts {
  const issueClosures = countLinkedIssueClosures(events);

  return {
    merged_pull_requests: countMergedPullRequests(events),
    completed_reviews: countCompletedReviews(events),
    linked_issue_closures_total: issueClosures.total,
    linked_issue_closures_authored: issueClosures.authored,
    linked_issue_closures_triaged: issueClosures.triaged,
    published_releases: countPublishedReleases(events),
    qualifying_documentation: countQualifyingDocumentation(events),
    verified_regression_tests: countVerifiedRegressionTests(events),
    landed_pushes: countLandedPushes(events),
  };
}

/**
 * Evaluates one EvidenceRequirement against a developer's events.
 *
 * Returns the count that satisfies the requirement, or 0 if the evidence
 * kind is not among those that can be counted from ingested events.
 */
export function evaluateRequirement(
  requirement: EvidenceRequirement,
  events: readonly DeveloperEvent[],
): number {
  switch (requirement.kind) {
    case "merged_pull_requests":
      return countMergedPullRequests(events);
    case "completed_reviews":
      return countCompletedReviews(events);
    case "linked_issue_closures":
      return countLinkedIssueClosures(events).total;
    case "published_releases":
      return countPublishedReleases(events);
    case "qualifying_documentation":
      return countQualifyingDocumentation(events);
    case "verified_regression_tests":
      return countVerifiedRegressionTests(events);
    case "landed_pushes":
      return countLandedPushes(events);
    case "attribute_units":
      // This is not an event-counting requirement. It is evaluated by
      // comparing the developer's attribute progress (from TASKS 6.4) to the
      // required count. Return 0 here; the caller handles it separately.
      return 0;
  }
}

/**
 * Whether a developer's events satisfy an EvidenceRequirement.
 */
export function satisfiesRequirement(
  requirement: EvidenceRequirement,
  events: readonly DeveloperEvent[],
): boolean {
  if (requirement.kind === "attribute_units") return false; // handled by progress
  return evaluateRequirement(requirement, events) >= requirement.count;
}
/**
 * Whether one event contributes to a countable requirement.
 *
 * The per-event predicate behind each counter above, exported so a caller that
 * needs the matching events (for example, an achievement's evidence references)
 * uses the same rule as the count. Keeping one definition means the count and the
 * references cannot disagree.
 */
export function contributesTo(
  requirement: EvidenceRequirement,
  event: DeveloperEvent,
): boolean {
  switch (requirement.kind) {
    case "merged_pull_requests":
      return event.kind === "pull_request" && event.evidence.merged === true && event.evidence.action === "merged";
    case "completed_reviews":
      return event.kind === "review" && event.evidence.state === "approved" && event.evidence.action === "created" && event.evidence.subject === "review";
    case "published_releases":
      return event.kind === "release" && event.evidence.action === "published" && event.evidence.draft !== true;
    case "qualifying_documentation":
      return event.kind === "documentation" && (event.evidence.pagesCreated ?? 0) > 0;
    default:
      return false;
  }
}

