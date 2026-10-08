/**
 * RootRealm — skill tree branch rail (TASKS §2.3 left column).
 *
 * The six branch chips from `references/approved-ui/skill-tree.png`: each
 * branch name with its accent glyph, acting as a filter highlight over the
 * map. One branch's accent at a time on its own chip (DESIGN_SYSTEM §33);
 * everything else stays monochrome. Single-select with an "All" reset —
 * keyboard users get real toggle buttons with `aria-pressed`.
 */

import { ATTRIBUTE_LABEL, type AttributeKey } from "@/lib/attributes";
import { cn } from "@/lib/cn";
import { ATTRIBUTE_GLYPH } from "@/components/attributes/attribute-glyphs";

import type { SkillTreeState } from "./skill-tree-logic";
import { BRANCH_TEXT_CLASS } from "./skill-tree-presentation";

export const BRANCH_RAIL_ORDER: readonly AttributeKey[] = [
  "builder",
  "debugger",
  "scholar",
  "collaborator",
  "maintainer",
  "architect",
];

function branchLearnedCount(state: SkillTreeState, branch: AttributeKey): number {
  let count = 0;
  for (const view of state.nodes.values()) {
    if (view.node.branch === branch && view.status === "learned") count += 1;
  }
  return count;
}

export type SkillBranchRailProps = {
  state: SkillTreeState;
  activeBranch: AttributeKey | null;
  onSelectBranch: (branch: AttributeKey | null) => void;
};

export function SkillBranchRail({ state, activeBranch, onSelectBranch }: SkillBranchRailProps) {
  return (
    <div
      role="group"
      aria-label="Filter the tree by branch"
      className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-surface p-2 md:flex-col md:overflow-visible"
    >
      <button
        type="button"
        onClick={() => onSelectBranch(null)}
        aria-pressed={activeBranch === null}
        className={cn(
          "flex shrink-0 items-center gap-3 rounded-md border px-4 py-2 text-left text-label transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
          activeBranch === null
            ? "border-border-strong bg-surface-secondary text-text-primary"
            : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
        )}
      >
        All branches
      </button>
      {BRANCH_RAIL_ORDER.map((branch) => {
        const active = activeBranch === branch;
        const learned = branchLearnedCount(state, branch);
        return (
          <button
            key={branch}
            type="button"
            onClick={() => onSelectBranch(active ? null : branch)}
            aria-pressed={active}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-md border px-4 py-2 text-left text-label transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
              active
                ? "border-border-strong bg-surface-secondary text-text-primary"
                : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
            )}
          >
            <span aria-hidden="true" className={cn("size-(--icon-size-md)", BRANCH_TEXT_CLASS[branch])}>
              {(() => {
                const AttributeGlyph = ATTRIBUTE_GLYPH[branch];
                return <AttributeGlyph className="h-full w-full" />;
              })()}
            </span>
            {ATTRIBUTE_LABEL[branch]}
            <span className="ml-auto text-caption text-text-muted">{learned}/5</span>
          </button>
        );
      })}
    </div>
  );
}
