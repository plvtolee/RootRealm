/**
 * RootRealm — quest completion (TASKS 12.3).
 *
 * ```text
 * met progress → XP + CodeCoins + cosmetic, or nothing
 * ```
 *
 * TASKS 12.3 is one sentence with a sharp clause: award XP, CodeCoins and
 * cosmetic rewards "without fabricating evidence". The clause is the task. It
 * rules out the easy implementation — grant the reward and write a progress row
 * that claims the work happened — because that row would be indistinguishable
 * from one backed by real activity, and a reader could not tell them apart.
 *
 * So completion has two independent gates, and both must pass:
 *
 * 1. the quest's criterion is **met by the events** (TASKS 12.2's count);
 * 2. the completion is recorded **against the evidence that met it** — the entry
 *    cites the event ids, and an entry with no evidence is refused.
 *
 * ## Why completing twice is a no-op that reports itself
 *
 * The completion's idempotency key is `quest:<userId>:<questId>:<periodKey>`.
 * A daily quest completed today therefore cannot be completed again today, but
 * *can* be completed tomorrow — the period key changes. That is exactly the
 * "resets honestly" property the window is for, expressed as uniqueness.
 *
 * ## What a completion produces, and what it does not
 *
 * It returns the records to write — an XP transaction, a currency transaction,
 * an inventory grant, and the completion itself. It writes nothing; the caller
 * persists them atomically. Keeping the decision pure is what makes 12.3's
 * "without fabricating evidence" a property a test can assert: an incomplete
 * quest produces an empty result, whatever the caller asks for.
 */
import type { DeveloperEvent } from "../developer-event";
import type { XPTransaction } from "../scoring/types";
import type { CurrencyTransaction } from "../currency/ledger";
import { earnFromQuestCompletion } from "../currency/earn";
import { evidenceEventsFor, evaluateQuest, type QuestProgress } from "./progress";
import type { QuestDefinition } from "./definition";

/** A recorded completion. */
export interface QuestCompletion {
  /** `quest:<userId>:<questId>:<periodKey>` — the idempotency key. */
  readonly id: string;
  readonly userId: string;
  /** GitHub login used in the explanation ledger. */
  readonly developerLogin?: string;
  readonly questId: string;
  readonly periodKey: string;
  /** When it was recorded, ISO-8601. */
  readonly completedAt: string;
  /** The scoring version the evidence was read under. */
  readonly scoringVersionId: string;
  /** The event ids that met the criterion. Never empty. */
  readonly evidenceEventIds: readonly string[];
}

/** A cosmetic granted by a completion. */
export interface CosmeticGrant {
  readonly userId: string;
  readonly itemId: string;
  readonly sourceId: string;
  /** The idempotency key: `inv:<userId>:<itemId>`. */
  readonly id: string;
}

/** Everything a completion produces. */
export interface CompletionResult {
  readonly completion: QuestCompletion;
  /** The XP transaction for the reward, or null when the quest grants none. */
  readonly xpTransaction: XPTransaction | null;
  /** The currency entry for the reward, or null when the quest grants none. */
  readonly currencyTransaction: CurrencyTransaction | null;
  /** The cosmetic grant, or null when the quest grants none. */
  readonly cosmeticGrant: CosmeticGrant | null;
}

/** Why a completion was refused. */
export type CompletionRefusal =
  | "not_met"
  | "no_evidence"
  | "already_completed";

/** The outcome of attempting a completion. */
export type CompletionOutcome =
  | { readonly ok: true; readonly result: CompletionResult }
  | { readonly ok: false; readonly refusal: CompletionRefusal };

/** The idempotency key for a completion. */
export function completionKey(userId: string, questId: string, periodKey: string): string {
  return `quest:${userId}:${questId}:${periodKey}`;
}

/**
 * Attempts to complete a quest.
 *
 * Evaluates the quest itself rather than trusting a passed-in `met` flag, so a
 * caller cannot complete a quest by asserting it is complete. The evaluation is
 * the same function TASKS 12.2 exposes, at the same instant, so the record and
 * the display cannot disagree about whether the quest was met.
 */
export function completeQuest(input: {
  readonly definition: QuestDefinition;
  readonly userId: string;
  /** GitHub login used in the explanation ledger. */
  readonly developerLogin?: string;
  readonly events: readonly DeveloperEvent[];
  readonly at: Date;
  readonly scoringVersionId: string;
  /** Completion ids already recorded, for the duplicate check. */
  readonly completedKeys: { readonly has: (key: string) => boolean };
  /**
   * Currency keys already in the ledger (TASKS 14.3).
   *
   * Required rather than assumed empty: a completion writes a coin entry, and a
   * caller that cannot say what the ledger already holds cannot know whether
   * this completion pays a second time.
   */
  readonly currencyKeys: { readonly has: (key: string) => boolean };
}): CompletionOutcome {
  const { definition, userId, events, at } = input;

  const decision = claimDecision({
    definition,
    userId,
    events,
    at,
    completedKeys: input.completedKeys,
  });
  if (decision.refusal !== null) {
    return { ok: false, refusal: decision.refusal };
  }

  const { progress, evidenceEventIds } = decision;
  const key = completionKey(userId, definition.id, progress.periodKey);
  const completedAt = at.toISOString();

  const completion: QuestCompletion = {
    id: key,
    userId,
    questId: definition.id,
    periodKey: progress.periodKey,
    completedAt,
    scoringVersionId: input.scoringVersionId,
    evidenceEventIds,
  };

  return {
    ok: true,
    result: {
      completion,
      xpTransaction: xpFor(
        definition,
        completion,
        evidenceEventIds,
        input.scoringVersionId,
        input.developerLogin,
      ),
      // TASKS 14.3: the coin reward comes from the earn rules and is keyed in
      // the ledger, so a re-delivered completion of the same period cannot pay
      // twice even if the completion record itself is replayed.
      currencyTransaction: earnFromQuestCompletion(
        {
          definition,
          userId,
          periodKey: progress.periodKey,
          recordedAt: completedAt,
        },
        input.currencyKeys,
      ),
      cosmeticGrant: cosmeticFor(definition, userId, progress.periodKey),
    },
  };
}

/**
 * The XP reward for a completion.
 *
 * Keyed by the completion, not by an event: this XP is a reward for the quest,
 * and SCORING.md's event keying exists to prevent double-awarding *event* XP.
 * The completion key is unique per period, which is the equivalent guarantee.
 */
function xpFor(
  definition: QuestDefinition,
  completion: QuestCompletion,
  evidenceEventIds: readonly string[],
  scoringVersionId: string,
  developerLogin?: string,
): XPTransaction | null {
  if (definition.xpReward === 0) return null;

  return {
    id: `xp:quest:${completion.userId}:${definition.id}:${completion.periodKey}`,
    // XP transactions keep the database's developer-event foreign key honest.
    // The completion remains the transaction's idempotency key; one of the cited
    // events is the supporting event row the transaction points at.
    eventId: evidenceEventIds[0] as string,
    developerLogin: developerLogin ?? completion.userId,
    xp: definition.xpReward,
    classification: "qualifying_push",
    reason: `Quest completed: ${definition.title}.`,
    ruleId: `quest.${definition.kind}`,
    attributeAwards: [],
    scoringVersion: scoringVersionId as XPTransaction["scoringVersion"],
    sourceUrl: null,
    awardedAt: completion.completedAt,
  };
}

function cosmeticFor(
  definition: QuestDefinition,
  userId: string,
  periodKey: string,
): CosmeticGrant | null {
  if (definition.cosmeticRewardId === null) return null;

  return {
    id: `inv:${userId}:${definition.cosmeticRewardId}`,
    userId,
    itemId: definition.cosmeticRewardId,
    sourceId: `${definition.id}:${periodKey}`,
  };
}

/**
 * Whether a quest is ready to claim, and the evidence that would be cited.
 *
 * The three refusals and the citable evidence, separated from the records a
 * completion *writes*. "Can this be claimed?" is a question about evidence and
 * period, and it is answerable without a ledger, a scoring version or a currency
 * entry — which is why a screen asking it does not need to supply one.
 *
 * The evidence clause lives here: a met quest with no citable evidence is refused
 * rather than completed with an empty evidence list, because such a record would
 * assert work it cannot show.
 */
function claimDecision(input: {
  readonly definition: QuestDefinition;
  readonly userId: string;
  readonly events: readonly DeveloperEvent[];
  readonly at: Date;
  readonly completedKeys: { readonly has: (key: string) => boolean };
}): { readonly refusal: CompletionRefusal } | {
  readonly refusal: null;
  readonly progress: QuestProgress;
  readonly evidenceEventIds: readonly string[];
} {
  const { definition, userId, events, at } = input;

  const progress = evaluateQuest(definition, events, at);
  if (!progress.met) {
    return { refusal: "not_met" };
  }

  const key = completionKey(userId, definition.id, progress.periodKey);
  if (input.completedKeys.has(key)) {
    return { refusal: "already_completed" };
  }

  const evidenceEventIds = evidenceEventsFor(definition, events, at).map((event) => event.id);
  if (evidenceEventIds.length === 0) {
    return { refusal: "no_evidence" };
  }

  return { refusal: null, progress, evidenceEventIds };
}

/**
 * Whether a quest is ready to claim.
 *
 * A convenience over {@link claimDecision} for a UI that only needs the answer,
 * without producing the records or needing a ledger.
 */
export function isClaimable(
  definition: QuestDefinition,
  userId: string,
  events: readonly DeveloperEvent[],
  at: Date,
  completedKeys: { readonly has: (key: string) => boolean },
): boolean {
  return claimDecision({ definition, userId, events, at, completedKeys }).refusal === null;
}

/** The progress beside its definition, for a screen. */
export interface QuestView {
  readonly definition: QuestDefinition;
  readonly progress: QuestProgress;
  readonly claimable: boolean;
  readonly completed: boolean;
}
