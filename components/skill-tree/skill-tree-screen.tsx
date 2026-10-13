/**
 * RootRealm — skill tree screen (TASKS §2.3–2.6, 6.6).
 *
 * Client component owning the UI state: the learned id list, the selected node,
 * the branch highlight and the map/list toggle. Every render derives
 * `computeSkillTreeView` from the learned ids and hands views down — the screen
 * never duplicates eligibility logic.
 *
 * TASKS 6.6 replaced the prototype's mock `SKILL_NODES` with the real catalog
 * (`lib/skills/catalog.ts`), and `computeSkillTreeState` with
 * `computeSkillTreeView` (`lib/skills/view.ts`). The screen consumes domain
 * state: events and learned ids in, a derived view model out. It holds no
 * eligibility rules of its own.
 */
"use client";

import { useMemo, useState } from "react";

import type { DeveloperEvent } from "@/lib/developer-event";
import { SKILL_DEFINITIONS } from "@/lib/skills/catalog";
import { evaluateAllProgress, type AttributeTotals } from "@/lib/skills/progress";
import { refund, unlock } from "@/lib/skills/unlock";
import { computeSkillTreeView, SKILL_POINT_BUDGET } from "@/lib/skills/view";
import type { SkillTreeState } from "@/lib/skills/view";
import type { AttributeKey } from "@/lib/attributes";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";

import { SKILL_NODE_PRESENTATION_BY_ID } from "./skill-node-presentation";
import { SkillBranchRail } from "./skill-branch-rail";
import { SkillNodeDetail } from "./skill-node-detail";
import { SkillTreeCanvas } from "./skill-tree-canvas";
import { SkillTreeList } from "./skill-tree-list";

type ViewMode = "map" | "list";
type UnlockEvent = { nodeId: string; fromId: string; revision: number };

export function SkillTreeScreen({
  events = [],
  developerLogin = "octocat",
  learnedIds: learnedIdsProp,
  attributeTotals,
}: {
  /** The developer's normalized events, for evidence. Empty until ingestion is wired. */
  events?: readonly DeveloperEvent[];
  /** Who this tree belongs to. Required by the unlock records. */
  developerLogin?: string;
  /**
   * Skills recorded as learned. `undefined` means "not told", which is the
   * browsing state a signed-out visitor sees: the catalog with its always-granted
   * root open. The Origin is genuinely granted on a connected account
   * (`requirement: null` in the catalog), so seeding it here is derived state, not
   * a mock — but it is *passed in* rather than hardcoded so a developer's real
   * unlock records replace it.
   */
  learnedIds?: readonly string[];
  /** The developer's attribute units, so requirements that need them can evaluate. */
  attributeTotals?: AttributeTotals;
}) {
  const [learnedIds, setLearnedIds] = useState<readonly string[]>(learnedIdsProp ?? ["origin"]);
  const [selectedId, setSelectedId] = useState<string | null>("origin");
  const [activeBranch, setActiveBranch] = useState<AttributeKey | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [unlockEvent, setUnlockEvent] = useState<UnlockEvent | null>(null);

  const state = useMemo<SkillTreeState>(
    () => computeSkillTreeView(learnedIds, events, { attributeTotals }),
    [learnedIds, events, attributeTotals],
  );

  const presentation = SKILL_NODE_PRESENTATION_BY_ID;

  const selectedView = selectedId ? (state.nodes.get(selectedId) ?? null) : null;

  const previewIds = useMemo(() => {
    if (!selectedView || selectedView.status === "learned") return new Set<string>();
    // The cheapest path is derived from the view's own prerequisite info, so the
    // preview cannot disagree with what the node requires.
    return new Set(selectedView.missingPrerequisiteIds);
  }, [selectedView]);

  function handleLearn(id: string) {
    const progress = evaluateAllProgress(SKILL_DEFINITIONS, events, {
      learnedIds: new Set(learnedIds),
    }).find((entry) => entry.skillId === id);

    const node = SKILL_DEFINITIONS.find((candidate) => candidate.id === id);
    if (progress === undefined || node === undefined) return;

    const result = unlock(
      {
        progress,
        developerLogin,
        scoringVersionId: "scoring-v1",
        unlockedAt: new Date().toISOString(),
      },
      new Set(learnedIds),
      node,
    );

    if (result.duplicate) return;

    const view = state.nodes.get(id);
    const fromId = view?.node.prerequisiteIds.find((prerequisiteId) =>
      learnedIds.includes(prerequisiteId),
    );
    setLearnedIds(result.learnedIds);

    if (
      viewMode === "map" &&
      fromId &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setUnlockEvent((current) => ({
        nodeId: id,
        fromId,
        revision: (current?.revision ?? 0) + 1,
      }));
    } else {
      setUnlockEvent(null);
    }
  }

  function handleRefund(id: string) {
    setLearnedIds(refund(id, new Set(learnedIds)));
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Text variant="heading" as="h1">
            Skill Tree
          </Text>
          <Text variant="caption" className="text-text-muted">
            {state.pointsLeft} of {SKILL_POINT_BUDGET} points left
          </Text>
        </div>
        <ProgressBar
          label="Skill points"
          value={state.spentPoints}
          max={SKILL_POINT_BUDGET}
          showValue
          size="sm"
        />
        <div role="group" aria-label="Choose the tree view" className="flex gap-2">
          {(["map", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={cn(
                "rounded-md border px-4 text-label transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
                // TASKS 22.1: `md` (44px) below `lg`, `sm` (36px) above it.
                // The size token says `sm` is a dense *desktop* choice, so using
                // it unconditionally put a 36px target under a finger — the
                // audit at 375/390/768 caught both toggles at 36px.
                "h-(--control-height-md) lg:h-(--control-height-sm)",
                viewMode === mode
                  ? "border-border-strong bg-surface-secondary text-text-primary"
                  : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
              )}
            >
              {mode === "map" ? "Map" : "List"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[15rem_1fr] xl:grid-cols-[15rem_1fr_22rem]">
        <SkillBranchRail
          state={state}
          activeBranch={activeBranch}
          onSelectBranch={setActiveBranch}
        />

        <div className="flex min-w-0 flex-col gap-4">
          {viewMode === "map" ? (
            <SkillTreeCanvas
              state={state}
              previewIds={previewIds}
              selectedId={selectedId}
              activeBranch={activeBranch}
              unlockEvent={unlockEvent}
              onUnlockAnimationEnd={(revision) => {
                setUnlockEvent((current) => current?.revision === revision ? null : current);
              }}
              onSelect={setSelectedId}
            />
          ) : (
            <Card>
              <SkillTreeList
                state={state}
                selectedId={selectedId}
                onSelect={setSelectedId}
                presentation={presentation}
              />
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 xl:col-span-1">
          <SkillNodeDetail
            state={state}
            view={selectedView}
            onLearn={handleLearn}
            onRefund={handleRefund}
            presentation={presentation}
          />
        </div>
      </div>
    </div>
  );
}
