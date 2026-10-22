/**
 * RootRealm — skill tree canvas geometry (TASKS §2.3–2.4).
 *
 * Pure drawing math for the SVG map. Data coordinates come straight from
 * `skill-tree-data.ts` (`visualX`/`visualY`); nothing here touches eligibility
 * (DATA_CONTRACT §16). Hexagon radii are drawing geometry, not component
 * sizes, so they live here rather than in `styles/tokens/component.css`.
 */

import type { SkillNodeType, SkillTier } from "./skill-tree-data";

/** Node circumradius by kind — core largest, bridges smallest. */
export const NODE_RADIUS: Record<SkillNodeType, number> = {
  core: 64,
  keystone: 58,
  notable: 50,
  minor: 42,
};

/**
 * The map frame, measured from the content graph: x −1000…1000 and y
 * 240…1290, plus room for the largest hexagon (58 units), the tier axis on
 * the right and a small margin so no shell touches the edge.
 */
export const SKILL_TREE_VIEWBOX = {
  x: -1120,
  y: 150,
  width: 2450,
  height: 1240,
} as const;

/**
 * The viewport the map opens at (TASKS 22.3).
 *
 * Until now this was `SKILL_TREE_VIEWBOX` itself — the whole tree, fitted. That
 * is legible only if you already know what you are looking at, and comparing
 * against `references/approved-ui/skill-tree.png` shows why it fails: the
 * approved screen shows four or five columns of clearly drawn hexagons with the
 * tree running off the edge, because you are meant to *pan*. Fitting everything
 * into a 590px canvas scales 2450 units down to 590, so a 58-unit hexagon
 * renders at about 14px and the icons inside it are gone.
 *
 * So the map opens on the trunk instead: 1100 units wide, which puts a hexagon
 * near 30px — readable — and covers the Roots row through the Intermediate tier.
 * Everything above and to the sides is one pan away, and `Fit` is still there for
 * anyone who wants the overview.
 *
 * The height is chosen so the aspect ratio (1100:1018 ≈ 1.08) matches a canvas
 * that is roughly as tall as it is wide, which is what the desktop three-column
 * layout produces. A mismatch would letterbox the drawing instead of filling it.
 *
 * `y` is 340 rather than something rounder because the Origin sits at y ≈ 1290
 * with a 58-unit radius: starting any higher crops the node every path grows
 * from, and the first thing the screen should show is the trunk.
 */
export const INITIAL_VIEWPORT = {
  x: -550,
  y: 340,
  width: 1100,
  height: 1018,
} as const;

/** Tier axis labels for the right-hand side of the map. */
export const TIER_AXIS: ReadonlyArray<{ tier: SkillTier; label: string; y: number }> = [
  { tier: "mastery", label: "Mastery", y: 240 },
  { tier: "advanced", label: "Advanced", y: 480 },
  { tier: "intermediate", label: "Intermediate", y: 830 },
  { tier: "foundation", label: "Foundation", y: 1000 },
  /* The Roots row holds the six roots (y 1160) and the Origin below them. */
  { tier: "roots", label: "Roots", y: 1230 },
];

/**
 * Pointy-top hexagon path centred on (`cx`, `cy`) — the reference's node
 * shape (DESIGN_SYSTEM §7: geometrically consistent node shapes).
 */
export function hexPath(cx: number, cy: number, radius: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 90) * Math.PI) / 180;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${points.join(" ")}Z`;
}

/**
 * Organic connector between two nodes (TASKS §2.4): a vertical S-curve that
 * reads as a growing branch, or — when both ends share a row, which only the
 * bridges do — a shallow arch. Deterministic: the same pair always draws the
 * same curve.
 */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 1) {
    const midX = (x1 + x2) / 2;
    return `M${x1} ${y1}Q${midX} ${y1 - 60} ${x2} ${y2}`;
  }
  const midY = (y1 + y2) / 2;
  return `M${x1} ${y1}C${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`;
}
