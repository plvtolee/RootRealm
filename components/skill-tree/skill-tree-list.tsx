/**
 * RootRealm — skill tree list fallback (TASKS §2.6, DESIGN_SYSTEM §30).
 *
 * The accessible alternative to the canvas: every node as a full-size row
 * grouped by branch, each with its status, progress, requirements and rewards,
 * driving the same selection as the map. This is the precise-navigation path
 * on mobile and the keyboard / screen-reader path everywhere.
 */

import { ATTRIBUTE_LABEL, type AttributeKey } from "@/lib/attributes";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";

import type { SkillNode } from "./skill-tree-data";
import { STATUS_BADGE_VARIANT } from "./skill-tree-presentation";
import { STATUS_LABEL, type SkillNodeView, type SkillTreeState } from "./skill-tree-logic";
import { BRANCH_RAIL_ORDER } from "./skill-branch-rail";

function orderedNodes(state: SkillTreeState): Array<{ branch: AttributeKey | null; nodes: SkillNodeView[] }> {
  const groups = new Map<string, SkillNodeView[]>();
  for (const view of state.nodes.values()) {
    const key = view.node.branch ?? "origin";
    const list = groups.get(key) ?? [];
    list.push(view);
    groups.set(key, list);
  }
  const byCostThenTitle = (a: SkillNodeView, b: SkillNodeView) =>
    a.node.cost - b.node.cost || a.node.title.localeCompare(b.node.title);
  const result: Array<{ branch: AttributeKey | null; nodes: SkillNodeView[] }> = [
    {
      branch: null,
      nodes: (groups.get("origin") ?? []).sort(byCostThenTitle),
    },
  ];
  for (const branch of BRANCH_RAIL_ORDER) {
    result.push({
      branch,
      nodes: (groups.get(branch) ?? []).sort(byCostThenTitle),
    });
  }
  return result;
}

export type SkillTreeListProps = {
  state: SkillTreeState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  nodeLabel: (node: SkillNode) => string;
};

export function SkillTreeList({ state, selectedId, onSelect, nodeLabel }: SkillTreeListProps) {
  return (
    <div className="flex flex-col gap-6">
      {orderedNodes(state).map(({ branch, nodes }) => (
        <section key={branch ?? "origin"} aria-label={branch ? ATTRIBUTE_LABEL[branch] : "Origin"}>
          <Text variant="label" className="uppercase text-text-muted">
            {branch ? ATTRIBUTE_LABEL[branch] : "Origin"}
          </Text>
          <ul className="mt-2 flex flex-col gap-2">
            {nodes.map((view) => {
              const selected = selectedId === view.node.id;
              return (
                <li key={view.node.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(view.node.id)}
                    aria-pressed={selected}
                    aria-label={nodeLabel(view.node)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
                      selected
                        ? "border-border-strong bg-surface-secondary text-text-primary"
                        : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Text variant="body" as="span" className="font-medium text-text-primary">
                          {view.node.title}
                        </Text>
                        <Badge variant={STATUS_BADGE_VARIANT[view.status]} size="sm">
                          {STATUS_LABEL[view.status]}
                        </Badge>
                      </span>
                      <Text variant="caption" className="mt-1 block text-text-muted">
                        Progress: {view.node.progress}/{view.node.requiredProgress} · Cost: {view.node.cost} points
                      </Text>
                      <Text variant="caption" className="mt-1 block text-text-secondary">
                        Requirements: {view.node.prerequisiteIds.length === 0
                          ? "None"
                          : view.node.prerequisiteIds
                              .map((id) => state.nodes.get(id)?.node.title ?? id)
                              .join(" or ")}
                      </Text>
                      <Text variant="caption" className="mt-1 block text-text-secondary">
                        Rewards: {view.node.effects.join("; ")}; +{view.node.xpReward} XP; +{view.node.codeCoinReward} CodeCoins
                      </Text>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
