/**
 * RootRealm — quest progress (TASKS 12.2).
 *
 * ```text
 * QuestDefinition + DeveloperEvent[] + a moment → QuestProgress
 * ```
 *
 * TASKS 12.2 is "connect quest progress to normalized evidence". The connecting
 * is the whole of it: progress is not a stored number that some other code path
 * increments, it is *counted from the events* every time it is asked for. That is
 * what makes it impossible for a quest to show progress the evidence does not
 * support, and it is why the stored `quest_progress` row (TASKS 10.3) is a cache
 * of a completion, not a source of truth for a count.
 *
 * ## The window is the whole difference between the three kinds
 *
 * A daily quest counts today's evidence, a weekly one counts this week's, and a
 * goal counts everything. The counting rule is identical — it is
 * `evaluateRequirement` from the skill evidence module — and the window is
 * applied to the events first. So "merge 3 pull requests" cannot mean one thing
 * for a daily quest and another for a goal.
 *
 * ## Windows are calendar periods, in UTC
 *
 * "Today" is `[00:00:00Z, next midnight Z)`. UTC rather than the developer's
 * local zone because the alternative is a quest that resets differently for two
 * people looking at the same account, and a period key that is not stable cannot
 * be used as a database key (`quest_progress`'s `(user_id, quest_id,
 * period_key)`). Day and week boundaries are the one place a timezone would
 * matter, and pinning them to UTC makes the reset a fact rather than a setting.
 *
 * ## Why an event with no timestamp is excluded from a windowed count
 *
 * A windowed quest asks "did this happen this week". An event with no
 * `occurredAt` cannot answer that, so it is not counted — the same conservatism
 * the evidence module applies everywhere. It still counts toward a `lifetime`
 * goal, where the question is only "did this happen at all".
 */
import type { DeveloperEvent } from "../developer-event";
import { evaluateRequirement, contributesTo } from "../skills/evidence";
import type { QuestDefinition, QuestWindow } from "./definition";

/** One quest's standing for one developer at one moment. */
export interface QuestProgress {
  readonly questId: string;
  /** Evidence counted within the window, clamped to what the quest requires. */
  readonly current: number;
  readonly required: number;
  /** True once the unclamped count reached `required`. */
  readonly met: boolean;
  /**
   * The period this count belongs to, e.g. `daily:2026-10-12`.
   *
   * Stable and derived from the same instant as the count, so it can key a
   * `quest_progress` row and a re-query at the same instant finds the same row.
   */
  readonly periodKey: string;
  /** The window's start, ISO-8601, or null for a lifetime goal. */
  readonly windowStart: string | null;
  /** The window's end (exclusive), ISO-8601, or null for a lifetime goal. */
  readonly windowEnd: string | null;
}

/**
 * The period key for a window at a moment.
 *
 * Exported because the caller persists it: the same instant must produce the key
 * the progress row was written under, or a completion would be recorded in one
 * period and looked for in another.
 */
export function periodKeyFor(window: QuestWindow, at: Date): string {
  const iso = at.toISOString();

  switch (window) {
    case "daily":
      // `YYYY-MM-DD` in UTC.
      return `daily:${iso.slice(0, 10)}`;
    case "weekly": {
      // ISO-8601 week: the Monday of the week containing `at`, in UTC.
      const monday = startOfWeekUtc(at);
      return `weekly:${monday.toISOString().slice(0, 10)}`;
    }
    case "lifetime":
      return "lifetime";
  }
}

/** The UTC midnight at the start of the day containing `at`. */
function startOfDayUtc(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** The UTC Monday at the start of the ISO week containing `at`. */
function startOfWeekUtc(at: Date): Date {
  const day = startOfDayUtc(at);
  // `getUTCDay()`: Sunday is 0. ISO weeks start Monday, so Sunday belongs to the
  // week that began six days earlier.
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

/** The `[start, end)` boundaries of a window containing `at`. */
export function windowBounds(
  window: QuestWindow,
  at: Date,
): { readonly start: Date; readonly end: Date } | null {
  if (window === "lifetime") return null;

  if (window === "daily") {
    const start = startOfDayUtc(at);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  const start = startOfWeekUtc(at);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/**
 * The events inside a window.
 *
 * A `lifetime` window returns the events unchanged. An event with no timestamp is
 * dropped from a bounded window (see the module header).
 */
export function eventsInWindow(
  events: readonly DeveloperEvent[],
  window: QuestWindow,
  at: Date,
): readonly DeveloperEvent[] {
  const bounds = windowBounds(window, at);
  if (bounds === null) return events;

  return events.filter((event) => {
    if (event.occurredAt === null) return false;
    const occurred = new Date(event.occurredAt);
    if (Number.isNaN(occurred.getTime())) return false;
    return occurred >= bounds.start && occurred < bounds.end;
  });
}

/**
 * Evaluates one quest at a moment.
 *
 * `current` is clamped to `required` so a quest with 12 of 10 shows 10 of 10
 * rather than an impossible overshoot; `met` uses the unclamped count so it stays
 * correct at the boundary — the same convention achievement eligibility uses.
 */
export function evaluateQuest(
  definition: QuestDefinition,
  events: readonly DeveloperEvent[],
  at: Date,
): QuestProgress {
  const windowed = eventsInWindow(events, definition.window, at);
  const counted = evaluateRequirement(definition.criterion, windowed);
  const bounds = windowBounds(definition.window, at);

  return {
    questId: definition.id,
    current: Math.min(counted, definition.criterion.count),
    required: definition.criterion.count,
    met: counted >= definition.criterion.count,
    periodKey: periodKeyFor(definition.window, at),
    windowStart: bounds?.start.toISOString() ?? null,
    windowEnd: bounds?.end.toISOString() ?? null,
  };
}

/** Evaluates every quest in a catalog, in catalog order. */
export function evaluateAllQuests(
  definitions: readonly QuestDefinition[],
  events: readonly DeveloperEvent[],
  at: Date,
): readonly QuestProgress[] {
  return definitions.map((definition) => evaluateQuest(definition, events, at));
}

/** The events a quest's criterion counted within its window, for evidence links. */
export function evidenceEventsFor(
  definition: QuestDefinition,
  events: readonly DeveloperEvent[],
  at: Date,
): readonly DeveloperEvent[] {
  return eventsInWindow(events, definition.window, at).filter((event) =>
    contributesTo(definition.criterion, event),
  );
}