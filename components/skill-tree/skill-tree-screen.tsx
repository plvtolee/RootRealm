/**
 * RootRealm — skill tree screen (TASKS §2.3–2.6).
 *
 * Client component owning the prototype's UI state: the learned id list
 * (from `INITIAL_LEARNED_IDS`, no persistence), the selected node, the
 * branch highlight and the map/list toggle. Every render derives
 * `computeSkillTreeState` from the learned ids and hands views down —
 * the screen never duplicates eligibility logic.
 */

"use client";

import { useMemo, useState } from "react";

import type { AttributeKey } from "@/lib/attributes";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";

import { INITIAL_LEARNED_IDS } from "./skill-tree-data";
import type { SkillNode } from "./skill-tree-data";
import { SkillBranchRail } from "./skill-branch-rail";
import { SkillNodeDetail } from "./skill-node-detail";
import { SkillTreeCanvas } from "./skill-tree-canvas";
import { SkillTreeList } from "./skill-tree-list";
import { cheapestPathTo } from "./skill-tree-logic";
import { computeSkillTreeState } from "./skill-tree-logic";
import { learnNode } from "./skill-tree-logic";
import { refundNode } from "./skill-tree-logic";

type ViewMode = "map" | "list";

function nodeLabel(node: SkillNode, status: string): string {
  return `${node.title} — ${status}`;
}

export function SkillTreeScreen() {
  const [learnedIds, setLearnedIds] = useState<readonly string[]>(INITIAL_LEARNED_IDS);
  const [selectedId, setSelectedId] = useState<string | null>("origin");
  const [activeBranch, setActiveBranch] = useState<AttributeKey | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");

  const state = useMemo(() => computeSkillTreeState(learnedIds), [learnedIds]);
  const selectedView = selectedId ? (state.nodes.get(selectedId) ?? null) : null;
  const previewIds = useMemo(() => {
    if (!selectedView || selectedView.status === "learned") return new Set<string>();
    return new Set(cheapestPathTo(state, selectedView.node.id).nodeIds);
  }, [state, selectedView]);

  function handleLearn(id: string) {
    const next = learnNode(state, id);
    if (next) setLearnedIds(next);
  }

  function handleRefund(id: string) {
    const next = refundNode(state, id);
    if (next) setLearnedIds(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Text variant="heading" as="h1">
            Skill Tree
          </Text>
          <Badge variant="accent" size="sm">
            Prototype
          </Badge>
          <Text variant="caption" className="text-text-muted">
            {state.pointsLeft} of 22 points left
          </Text>
        </div>
        <ProgressBar
          label="Skill points"
          value={state.spentPoints}
          max={22}
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
                "rounded-md border px-4 text-label transition-colors duration-(--motion-fast) ease-standard",
                "h-(--control-height-sm)",
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
              onSelect={setSelectedId}
            />
          ) : (
            <Card>
              <SkillTreeList
                state={state}
                selectedId={selectedId}
                onSelect={setSelectedId}
                nodeLabel={(node) => nodeLabel(node, state.nodes.get(node.id)?.status ?? "locked")}
              />
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 xl:col-span-1">
          <SkillNodeDetail state={state} view={selectedView} onLearn={handleLearn} onRefund={handleRefund} />
        </div>
      </div>
    </div>
  );
}
