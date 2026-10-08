/**
 * RootRealm — skill tree presentation maps.
 *
 * Class-name and style helpers shared by the canvas, the branch rail, the
 * detail panel and the list fallback. Tailwind cannot see interpolated class
 * strings, so every map is a literal record keyed by the product vocabulary.
 *
 * The branch hues come from `styles/tokens/color.css` (Layer 2 skill branch
 * accents) and are consumed exactly the way the token file and DESIGN_SYSTEM
 * §3/§33 prescribe: one branch at a time, on that branch's own chip, node marks
 * and lit node borders — nowhere else. Everything else stays monochrome.
 */

import type { BadgeVariant } from "@/components/ui/badge";
import type { AttributeKey } from "@/lib/attributes";

import type { SkillNodeStatus } from "./skill-tree-data";

/** Accent text class per branch (`text-branch-*` from `--color-branch-*`). */
export const BRANCH_TEXT_CLASS: Record<AttributeKey, string> = {
  builder: "text-branch-builder",
  debugger: "text-branch-debugger",
  scholar: "text-branch-scholar",
  collaborator: "text-branch-collaborator",
  maintainer: "text-branch-maintainer",
  architect: "text-branch-architect",
};

/** Accent hairline class per branch — node borders, rail markers, edge paths. */
export const BRANCH_BORDER_CLASS: Record<AttributeKey, string> = {
  builder: "border-branch-builder",
  debugger: "border-branch-debugger",
  scholar: "border-branch-scholar",
  collaborator: "border-branch-collaborator",
  maintainer: "border-branch-maintainer",
  architect: "border-branch-architect",
};

/** Accent fill class per branch — rail dots and compact marks only. */
export const BRANCH_BG_CLASS: Record<AttributeKey, string> = {
  builder: "bg-branch-builder",
  debugger: "bg-branch-debugger",
  scholar: "bg-branch-scholar",
  collaborator: "bg-branch-collaborator",
  maintainer: "bg-branch-maintainer",
  architect: "bg-branch-architect",
};

/** Badge tone per node status (DESIGN_SYSTEM §17 vocabulary). */
export const STATUS_BADGE_VARIANT: Record<SkillNodeStatus, BadgeVariant> = {
  locked: "neutral",
  "in-progress": "warning",
  eligible: "accent",
  learned: "success",
};

/**
 * Lit-node glow for one branch (`styles/tokens/elevation.css`). Returned as an
 * inline style because the token name is assembled from the branch key — no
 * class scanner can follow that — and glow is a single property anyway.
 * Callers apply it only to a lit node: one node's glow at a time (§33).
 */
export function branchGlowFilter(branch: AttributeKey | null): string | undefined {
  return branch ? `drop-shadow(var(--drop-shadow-glow-${branch}))` : undefined;
}
