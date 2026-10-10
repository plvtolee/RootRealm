/**
 * RootRealm — event deduplication (TASKS 4.6).
 *
 * ```text
 * DeveloperEvent[] → one event per source
 * ```
 *
 * TASKS 4.5 established that `DeveloperEvent.id` is occurrence-scoped, so the
 * same source event always produces the same canonical identity. This module
 * turns that into the guarantee TASK 4.6 asks for: *the same source event
 * processed repeatedly yields one canonical event.*
 *
 * ## Why duplicates are expected, not exceptional
 *
 * SCORING.md §19 lists five ways the *same* event arrives more than once:
 *
 * - multiple GitHub endpoints describing one action;
 * - repeated syncs, the normal case — a nightly job re-reads the same feed;
 * - pagination overlap, when a page shifts between two requests and an event
 *   appears on both the tail of one page and the head of the next;
 * - retry operations, where a timed-out request succeeded after all;
 * - webhook/poll combinations, where the same action is seen twice through
 *   different transport.
 *
 * None of these are errors. Deduplication is therefore a normal pipeline stage
 * that must be idempotent on its own input, not a cleanup step for bad data —
 * and the engine must "assume that duplicate input is possible" rather than
 * defending against it after the fact.
 *
 * ## What deduplication must not do
 *
 * Collapse *distinct* events. TASKS 4.5 deliberately keyed `id` on the
 * occurrence rather than the object, so a pull request seen as `opened` and later
 * as `merged` is two events — and the merge is the one TASKS 5.3 scores. A
 * deduplication pass that grouped by pull request number would silently discard
 * the merge, which is the opposite of what the pipeline is for. The acceptance
 * criterion is about repeated *observations of one event*, not about distinct
 * occurrences of the same object.
 *
 * ## Idempotency key
 *
 * SCORING.md §18 states the protection is "a stable event identity plus an
 * idempotency key", and gives the shape `xp:user123:event456:scoring-v1`. Both
 * halves live here: the identity is `DeveloperEvent.id`, and
 * {@link idempotencyKeyFor} composes it with the developer and the scoring
 * version. The version is a parameter rather than a constant because a scoring
 * change must be able to award an event again without looking like a duplicate
 * — that is the entire point of versioning.
 */
import type { DeveloperEvent } from "./developer-event";
/** One duplicate group found during deduplication. */
export interface DuplicateGroup {
  /** The canonical identity shared by every copy. */
  id: string;
  /** How many times it was observed, including the first. */
  count: number;
  /**
   * Whether the observations disagreed in content.
   *
   * `count > 1` with `conflicting: false` is the expected case — repeated
   * processing of identical data. `count > 1` with `conflicting: true` means two
   * observations of the same event differed, which should not happen and is
   * surfaced rather than resolved silently.
   */
  conflicting: boolean;
}

export interface DedupeResult {
  /** One event per identity, in first-seen order. */
  events: DeveloperEvent[];
  /** Groups observed more than once, ordered by first occurrence. */
  duplicates: DuplicateGroup[];
  /**
   * Identities supplied from a previous run, so a re-sync does not re-emit them.
   *
   * These are *not* included in `events` — the caller already holds them —
   * but they are reported so a sync can account for its full input.
   */
  alreadySeen: string[];
}

/**
 * How many fields of an event's evidence are populated.
 *
 * Used to pick which observation to keep: when the same event is observed
 * twice and the observations differ, the more complete one is the better
 * record of what GitHub said. A retry that lost a field should not be able to
 * degrade the canonical event.
 */
function completenessOf(event: DeveloperEvent): number {
  let populated = 0;

  for (const value of Object.values(event.evidence)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.length === 0) continue;
    populated += 1;
  }

  for (const field of [
    event.occurredAt,
    event.sourceUrl,
    event.repositoryId,
    event.repositoryFullName,
    event.developerId,
  ]) {
    if (field !== null) populated += 1;
  }

  // Fewer limitations means more of the evidence was present.
  populated -= event.limitations.length;

  return populated;
}

/**
 * Keeps the more complete of two observations of the same event.
 *
 * Content is not merged field-by-field. Picking one observation whole keeps the
 * result deterministic — the same input always yields the same output, which
 * TASKS 5.11 (idempotent scoring) requires — whereas a field-wise merge could
 * combine two halves that never co-occurred and produce an event that matches
 * no real GitHub response.
 */
function preferEvent(
  kept: DeveloperEvent,
  candidate: DeveloperEvent,
): DeveloperEvent {
  return completenessOf(candidate) > completenessOf(kept) ? candidate : kept;
}

/** Whether two observations of the same event carry the same content. */
function conflicts(a: DeveloperEvent, b: DeveloperEvent): boolean {
  return (
    a.occurredAt !== b.occurredAt ||
    a.sourceUrl !== b.sourceUrl ||
    a.repositoryId !== b.repositoryId ||
    a.confidence !== b.confidence ||
    a.visibility !== b.visibility ||
    JSON.stringify(a.evidence) !== JSON.stringify(b.evidence) ||
    a.limitations.join(",") !== b.limitations.join(",")
  );
}

export interface DedupeOptions {
  /**
   * Identities already persisted, from a previous sync.
   *
   * Supplying these is what makes a *repeated* sync idempotent rather than
   * merely a single batch: an event awarded in run one is not re-awarded in run
   * two, because it never re-enters the pipeline.
   */
  alreadySeen?: Iterable<string>;
}

/**
 * Removes duplicate canonical events.
 *
 * Pure, deterministic, and safe on any input — including input that is already
 * deduplicated, which returns it unchanged.
 *
 * @param events   Canonical events from TASKS 4.5.
 * @param options  Identities already known from earlier runs.
 */
export function dedupeEvents(
  events: readonly DeveloperEvent[],
  options: DedupeOptions = {},
): DedupeResult {
  // Normalised to a Set so membership is O(1) regardless of what the caller
  // passed, and so a later deduplication pass names the same lookup.
  const seen = new Set<string>(options.alreadySeen ?? []);

  const kept = new Map<string, DeveloperEvent>();
  const firstSeenOrder: string[] = [];
  const counts = new Map<string, number>();

  const alreadySeen = [...seen];

  for (const event of events) {
    counts.set(event.id, (counts.get(event.id) ?? 0) + 1);

    const existing = kept.get(event.id);

    if (existing === undefined) {
      if (seen.has(event.id)) {
        // Known from an earlier run: count it, but do not re-emit it. Doing so
        // is what keeps a repeated sync from producing a second award.
        continue;
      }

      kept.set(event.id, event);
      firstSeenOrder.push(event.id);
      continue;
    }

    kept.set(event.id, preferEvent(existing, event));
  }

  const duplicates: DuplicateGroup[] = [];
  for (const id of firstSeenOrder) {
    const count = counts.get(id) ?? 1;
    if (count <= 1) continue;
    duplicates.push({
      id,
      count,
      // Conflicts are recorded per identity rather than per pair, so a group
      // observed four times with one divergent copy still reads as conflicting.
      conflicting: hasConflictFor(id, events, kept.get(id)),
    });
  }

  return {
    events: firstSeenOrder
      .map((id) => kept.get(id))
      .filter((event): event is DeveloperEvent => event !== undefined),
    duplicates,
    alreadySeen,
  };
}

/** Whether any observation of `id` differs from the one kept for it. */
function hasConflictFor(
  id: string,
  events: readonly DeveloperEvent[],
  kept: DeveloperEvent | undefined,
): boolean {
  if (kept === undefined) return false;

  return events.some((event) => event.id === id && conflicts(event, kept));
}

/**
 * Composes the idempotency key for one event under one scoring version.
 *
 * Format from SCORING.md §18: `xp:user123:event456:scoring-v1`. The event
 * identity is the canonical id from TASKS 4.5, which already encodes the kind —
 * so `push:123` and `pull_request:123` never collide even if GitHub were to
 * reuse event ids across endpoints.
 *
 * The version is a parameter on purpose: a scoring change must be able to award
 * an event again without the award looking like a duplicate. Freezing it here
 * would couple the persistence layer to a constant it cannot move.
 */
export function idempotencyKeyFor(
  event: DeveloperEvent,
  scoringVersion: string,
): string {
  return `xp:${event.developerLogin}:${event.id}:${scoringVersion}`;
}