/**
 * RootRealm — the authenticated quest boundary.
 *
 * The browser may ask to claim a published quest, but it cannot name the user or
 * submit evidence. The session selects the account, and the same profile preview
 * service used by the shared client snapshot supplies fresh normalized events.
 */
import { accountStore } from "../db/stores";
import type { ProgressionStore } from "../db/progression-store";
import { progressionStore } from "../db/stores";
import { walletStore } from "../db/stores";
import type { WalletStore } from "../currency/store";
import { SCORING_V1 } from "../scoring/types";
import { buildProfilePreview } from "../profile/service";
import type { DeveloperEvent } from "../developer-event";
import { completeQuest, type CompletionRefusal, type CompletionResult } from "./completion";
import { QUEST_INDEX } from "./catalog";
import { evaluateQuest } from "./progress";

export type QuestClaimFailure =
  | "unauthenticated"
  | "not_found"
  | "unknown_quest"
  | CompletionRefusal
  | "evidence_unavailable";

export type QuestClaimOutcome =
  | { readonly ok: true; readonly result: CompletionResult; readonly duplicate: boolean }
  | { readonly ok: false; readonly refusal: QuestClaimFailure; readonly message: string };

export interface QuestEvidence {
  readonly events: readonly DeveloperEvent[];
  readonly repositories?: Parameters<ProgressionStore["saveRepositories"]>[1];
}

/** The completion keys for a signed-in developer, for the quest screen. */
export async function completedQuestKeysFor(
  userId: string,
  store: ProgressionStore = progressionStore(),
): Promise<ReadonlySet<string>> {
  return store.completedQuestKeys(userId);
}

/**
 * Attempts one authenticated claim.
 *
 * `evidence` is injectable for tests only. The route does not pass it, so a real
 * request always loads the account's current profile snapshot on the server.
 */
export async function claimQuest(input: {
  readonly userId: string | null;
  readonly login?: string;
  readonly questId: string;
  readonly at?: Date;
  readonly evidence?: QuestEvidence;
  readonly progression?: ProgressionStore;
  readonly wallet?: WalletStore;
}): Promise<QuestClaimOutcome> {
  if (input.userId === null || input.login === undefined) {
    return { ok: false, refusal: "unauthenticated", message: "Sign in to claim quests." };
  }

  const definition = QUEST_INDEX.byId.get(input.questId);
  if (definition === undefined) {
    return { ok: false, refusal: "unknown_quest", message: "That quest is not published." };
  }

  const progression = input.progression ?? progressionStore();
  const wallet = input.wallet ?? walletStore();
  const at = input.at ?? new Date();
  const evidence = input.evidence ?? (await evidenceFor(input.login));

  if (evidence === null) {
    return {
      ok: false,
      refusal: "evidence_unavailable",
      message: "Your GitHub activity could not be read. Try again when it is available.",
    };
  }

  const completedKeys = await progression.completedQuestKeys(input.userId);
  const currentWallet = await wallet.read(input.userId);
  const outcome = completeQuest({
    definition,
    userId: input.userId,
    developerLogin: input.login,
    events: evidence.events,
    at,
    scoringVersionId: SCORING_V1.id,
    completedKeys,
    currencyKeys: new Set(currentWallet.transactions.map((transaction) => transaction.id)),
  });

  if (!outcome.ok) {
    return {
      ok: false,
      refusal: outcome.refusal,
      message: messageFor(outcome.refusal),
    };
  }

  // Evidence is written before the XP transaction because the SQL schema keeps
  // the transaction's supporting developer event as a foreign key.
  if (evidence.repositories !== undefined) {
    await progression.saveRepositories(input.login, evidence.repositories);
  }
  await progression.saveEvents(input.login, evidence.events);

  const { result } = outcome;
  if (result.xpTransaction !== null) {
    await progression.recordTransactions(input.userId, input.login, [result.xpTransaction]);
  }
  await wallet.grant({
    userId: input.userId,
    transaction: result.currencyTransaction,
    cosmeticGrant: result.cosmeticGrant,
    at: result.completion.completedAt,
  });

  const written = await progression.recordQuestCompletion(
    input.userId,
    result.completion,
    // This is a cache for audit/readback only. The screen still derives progress
    // from events, so the cache cannot become fabricated evidence.
    evaluateQuest(definition, evidence.events, at).current,
  );

  return { ok: true, result, duplicate: written === 0 };
}

async function evidenceFor(login: string): Promise<QuestEvidence | null> {
  const snapshot = await buildProfilePreview(login);
  if (!snapshot.ok) return null;

  return {
    events: snapshot.preview.events,
    repositories: snapshot.preview.repositories,
  };
}

function messageFor(refusal: CompletionRefusal): string {
  switch (refusal) {
    case "not_met":
      return "That quest is not complete yet.";
    case "no_evidence":
      return "The quest has no citable evidence, so it cannot be claimed.";
    case "already_completed":
      return "That quest has already been claimed for this period.";
  }
}

/** Resolves a session to an existing account without trusting request input. */
export async function accountFor(userId: string) {
  return accountStore().findById(userId);
}
