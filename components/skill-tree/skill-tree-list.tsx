/**
 * RootRealm — skill tree list fallback (TASKS §2.6, DESIGN_SYSTEM §30).
 *
 * The accessible alternative to the canvas: every node as a full-size row
 * grouped by branch, each with its status, progress, requirements and rewards,
 * driving the same selection as the map. This is the precise-navigation path on
 * mobile and the keyboard / screen-reader path everywhere.
 *
 * ## Why no `aria-label` on a row (17.2, 17.3)
 *
 * The rows used to carry `aria-label={nodeLabel(node)}`, which replaced the whole
 * row with a title. That threw away the status, progress, requirements and
 * rewards — every reason a screen reader user would be on this screen instead of
 * the map — and it broke WCAG 2.5.3 (Label in Name), because the visible title
 * was not in the accessible name. The name now comes from the row's own text,
 * which is the same information sighted users read.
 *
 * Keyboard operation needs no key handling of its own: each row is a real
 * `<button>`, so tab reaches it and Enter/Space activate it. `nodeLabel` is still
 * used for the visible status line.
 */

import { ATTRIBUTE_LABEL, type AttributeKey } from "@/lib/attributes";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";

import { STATUS_LABEL, type SkillNodeView, type SkillTreeState } from "@/lib/skills/view";
import type { SkillNodePresentation } from "./skill-node-presentation";
import { STATUS_BADGE_VARIANT } from "./skill-tree-presentation";
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
  presentation: ReadonlyMap<string, SkillNodePresentation>;
};

export function SkillTreeList({ state, selectedId, onSelect, presentation }: SkillTreeListProps) {
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
                        Progress: {view.progress.current} of {view.progress.required} · Cost:{" "}
                        {view.node.cost} points
                      </Text>
                      <Text variant="caption" className="mt-1 block text-text-secondary">
                        Requirements: {view.node.prerequisiteIds.length === 0
                          ? "None"
                          : view.node.prerequisiteIds
                              .map((id) => state.nodes.get(id)?.node.title ?? id)
                              .join(" or ")}
                      </Text>
                      <Text variant="caption" className="mt-1 block text-text-secondary">
                        Rewards: {presentation.get(view.node.id)?.effects.join("; ") ?? "—"}; +{presentation.get(view.node.id)?.xpReward ?? 0} XP; +{presentation.get(view.node.id)?.codeCoinReward ?? 0} CodeCoins
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
