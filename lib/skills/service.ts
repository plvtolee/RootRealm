/**
 * RootRealm — the authenticated skill mutation service.
 *
 * The browser may ask to learn a node, but it cannot decide whether the node is
 * eligible or which account owns the result. This module combines the current
 * evidence with the durable learned set, then writes through the shared
 * progression-store interface.
 */
import type { DeveloperEvent } from "../developer-event";
import type { AttributeTotals } from "./progress";
import { evaluateAllProgress } from "./progress";
import { SKILL_DEFINITIONS } from "./catalog";
import { indexSkills } from "./definition";
import { computeSkillTreeView } from "./view";
import { refund, unlock } from "./unlock";
import type { ProgressionStore } from "../db/progression-store";

export type SkillMutationCode =
  | "unknown_skill"
  | "not_eligible"
  | "cannot_refund";

export class SkillMutationError extends Error {
  readonly code: SkillMutationCode;

  constructor(code: SkillMutationCode, message: string) {
    super(message);
    this.name = "SkillMutationError";
    this.code = code;
  }
}

export interface SkillMutationInput {
  readonly userId: string;
  readonly developerLogin: string;
  readonly skillId: string;
  readonly events: readonly DeveloperEvent[];
  readonly attributeTotals?: AttributeTotals;
  readonly store: ProgressionStore;
  readonly now?: string;
}

export interface SkillMutationResult {
  readonly learnedIds: readonly string[];
  /** True when a learn request found an existing row rather than adding one. */
  readonly duplicate: boolean;
}

/** Learns one eligible skill, idempotently. */
export async function learnSkill(input: SkillMutationInput): Promise<SkillMutationResult> {
  const node = indexSkills(SKILL_DEFINITIONS).get(input.skillId);
  if (node === undefined) throw unknownSkill(input.skillId);

  const learned = await input.store.learnedSkillIds(input.userId);
  const progress = evaluateAllProgress(SKILL_DEFINITIONS, input.events, {
    attributeTotals: input.attributeTotals,
    learnedIds: learned,
  }).find((entry) => entry.skillId === input.skillId);

  if (progress === undefined) throw unknownSkill(input.skillId);

  let decision: ReturnType<typeof unlock>;
  try {
    decision = unlock(
      {
        progress,
        developerLogin: input.developerLogin,
        scoringVersionId: "scoring-v1",
        unlockedAt: input.now ?? new Date().toISOString(),
      },
      learned,
      node,
    );
  } catch (error) {
    throw new SkillMutationError(
      "not_eligible",
      error instanceof Error ? error.message : "That skill is not eligible.",
    );
  }

  if (!decision.duplicate) {
    // The unique key is enforced again by the store. If two requests race, the
    // second insert returns zero and is reported as an idempotent duplicate.
    const written = await input.store.recordSkillUnlock(input.userId, decision.unlock);
    if (written === 0) return currentResult(input.store, input.userId, true);
  }

  return currentResult(input.store, input.userId, decision.duplicate);
}

/** Refunds one learned skill after checking the same dependency rules as the UI. */
export async function refundSkill(input: SkillMutationInput): Promise<SkillMutationResult> {
  const node = indexSkills(SKILL_DEFINITIONS).get(input.skillId);
  if (node === undefined) throw unknownSkill(input.skillId);

  const learned = await input.store.learnedSkillIds(input.userId);
  const view = computeSkillTreeView(learned, input.events, {
    attributeTotals: input.attributeTotals,
  }).nodes.get(input.skillId);

  if (view === undefined || !view.canRefund) {
    throw new SkillMutationError(
      "cannot_refund",
      view?.refundReason ?? "That skill cannot be refunded.",
    );
  }

  // Keep the domain helper as the single definition of the resulting set; the
  // store delete is the durable counterpart of that pure decision.
  const next = refund(input.skillId, learned);
  await input.store.removeSkillUnlock(input.userId, input.skillId);

  return { learnedIds: [...next], duplicate: false };
}

async function currentResult(
  store: ProgressionStore,
  userId: string,
  duplicate: boolean,
): Promise<SkillMutationResult> {
  return { learnedIds: [...(await store.learnedSkillIds(userId))], duplicate };
}

function unknownSkill(skillId: string): SkillMutationError {
  return new SkillMutationError("unknown_skill", `Unknown skill: ${skillId}.`);
}
