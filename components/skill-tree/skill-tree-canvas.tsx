/**
 * RootRealm — skill tree canvas (TASKS §2.3 renderer, §2.4 organic geometry).
 *
 * The deep-dark SVG map: hexagon nodes on `visualX`/`visualY`, S-curve
 * connectors, the tier axis. Nodes are real `<button>` elements over the SVG;
 * the SVG paints edges, shells, glyphs and the dotted grid behind them.
 */

import { memo, useCallback, useId, useMemo, useRef, useEffect, type AnimationEvent, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import { playSkillUnlock } from "@/lib/motion";

import { cn } from "@/lib/cn";

import type { SkillNodeStatus } from "@/lib/skills/progress";
import { SKILL_DEFINITIONS } from "@/lib/skills/catalog";
import { indexSkills } from "@/lib/skills/definition";
import type { SkillNodeView } from "@/lib/skills/view";
import { STATUS_LABEL } from "@/lib/skills/view";
import { ATTRIBUTE_LABEL, type AttributeKey } from "@/lib/attributes";
import { NODE_RADIUS } from "./skill-tree-geometry";
import { INITIAL_VIEWPORT, SKILL_TREE_VIEWBOX } from "./skill-tree-geometry";
import { TIER_AXIS } from "./skill-tree-geometry";
import { edgePath } from "./skill-tree-geometry";
import { hexPath } from "./skill-tree-geometry";
import { SKILL_GLYPH_PATHS } from "./skill-tree-glyphs";
import type { SkillGlyphKey } from "./skill-tree-glyphs";
import type { SkillNodePresentation } from "./skill-node-presentation";
import type { SkillDefinition } from "@/lib/skills/definition";
import { SKILL_NODE_PRESENTATION_BY_ID } from "./skill-node-presentation";
import { BRANCH_TEXT_CLASS } from "./skill-tree-presentation";
import { branchGlowFilter } from "./skill-tree-presentation";
import type { SkillTreeState } from "@/lib/skills/view";

/** Node id → derived status, so the canvas stays purely presentational. */
export type SkillStatusById = ReadonlyMap<string, SkillNodeStatus>;

type Viewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 1.15;

function zoomViewport(viewport: Viewport, factor: number, centerX: number, centerY: number): Viewport {
  const nextWidth = Math.min(
    SKILL_TREE_VIEWBOX.width / MIN_ZOOM,
    Math.max(SKILL_TREE_VIEWBOX.width / MAX_ZOOM, viewport.width / factor),
  );
  const nextHeight = nextWidth * (viewport.height / viewport.width);
  const relativeX = (centerX - viewport.x) / viewport.width;
  const relativeY = (centerY - viewport.y) / viewport.height;

  return {
    x: centerX - nextWidth * relativeX,
    y: centerY - nextHeight * relativeY,
    width: nextWidth,
    height: nextHeight,
  };
}

function clampViewport(viewport: Viewport): Viewport {
  const maxX = SKILL_TREE_VIEWBOX.x + SKILL_TREE_VIEWBOX.width - viewport.width;
  const maxY = SKILL_TREE_VIEWBOX.y + SKILL_TREE_VIEWBOX.height - viewport.height;

  return {
    ...viewport,
    x: Math.min(Math.max(viewport.x, SKILL_TREE_VIEWBOX.x), maxX),
    y: Math.min(Math.max(viewport.y, SKILL_TREE_VIEWBOX.y), maxY),
  };
}

export type SkillTreeCanvasProps = {
  state: SkillTreeState;
  previewIds?: ReadonlySet<string>;
  selectedId: string | null;
  activeBranch?: string | null;
  unlockEvent?: UnlockEvent | null;
  onUnlockAnimationEnd?: (revision: number) => void;
  onSelect: (id: string) => void;
  /**
   * Presentation overlay for drawing coordinates and glyphs.
   *
   * `SkillDefinition` deliberately carries no `visualX` / `visualY` (TASKS 6.1),
   * so the canvas resolves them from this map rather than reading them off the
   * domain node. A node missing from the map draws at 0,0 — the honest default
   * rather than an invented position.
   */
};

/** Drawing data for one node, from the shared overlay. */
const presentationOf = (id: string): SkillNodePresentation | undefined =>
  SKILL_NODE_PRESENTATION_BY_ID.get(id);

/** Dotted-map backdrop behind the tree. */
function MapBackdrop({ gridId }: { gridId: string }) {
  const { x, y, width, height } = SKILL_TREE_VIEWBOX;
  return (
    <g aria-hidden="true">
      <defs>
        <pattern id={gridId} width="80" height="80" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="var(--color-border)" opacity="0.55" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill={`url(#${gridId})`} opacity="0.5" />
    </g>
  );
}

/** Right-hand tier axis: dotted line with named stops. */
function TierAxis() {
  const axisX = SKILL_TREE_VIEWBOX.x + SKILL_TREE_VIEWBOX.width - 60;
  return (
    <g aria-hidden="true">
      <line
        x1={axisX}
        y1={190}
        x2={axisX}
        y2={1330}
        stroke="var(--color-text-muted)"
        strokeWidth={2}
        strokeDasharray="2 10"
        strokeLinecap="round"
        opacity={0.7}
      />
      {TIER_AXIS.map(({ label, y }) => (
        <g key={label}>
          <circle
            cx={axisX}
            cy={y}
            r={7}
            fill="var(--color-bg)"
            stroke="var(--color-text-secondary)"
            strokeWidth={2}
          />
          <text
            x={axisX - 24}
            y={y + 7}
            textAnchor="end"
            fill="var(--color-text-secondary)"
            fontSize={34}
            letterSpacing="0.04em"
          >
            {label}
          </text>
        </g>
      ))}
    </g>
  );
}

type UnlockEvent = { nodeId: string; fromId: string; revision: number };
type EdgeSpec = { key: string; d: string; lit: boolean; preview: boolean; animate: boolean; branch: string | null };
/** One connector per prerequisite id (OR edges). Decorative: buttons carry names. */
function TreeEdges({
  nodes,
  statusById,
  previewIds,
  unlockEvent,
}: {
  nodes: readonly SkillDefinition[];
  statusById: SkillStatusById;
  previewIds: ReadonlySet<string>;
  unlockEvent: UnlockEvent | null;
}) {
  const edges: EdgeSpec[] = [];
  const index = indexSkills(SKILL_DEFINITIONS);
  const at = (id: string) => SKILL_NODE_PRESENTATION_BY_ID.get(id);
  for (const node of nodes) {
    const target = index.get(node.id);
    if (!target) continue;
    for (const prereqId of node.prerequisiteIds) {
      const source = index.get(prereqId);
      if (!source) continue;
      const lit =
        statusById.get(prereqId) === "learned" && statusById.get(node.id) !== "locked";
      edges.push({
        key: `${prereqId}->${node.id}`,
        d: edgePath(at(source.id)?.visualX ?? 0, at(source.id)?.visualY ?? 0, at(target.id)?.visualX ?? 0, at(target.id)?.visualY ?? 0),
        lit,
        preview: previewIds.has(node.id) && previewIds.has(prereqId),
        animate: unlockEvent?.nodeId === node.id && unlockEvent.fromId === prereqId,
        branch: target.branch,
      });
    }
  }
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round">
      {edges.map((edge) => (
        <path
          key={edge.key}
          d={edge.d}
          strokeWidth={edge.lit || edge.preview ? 4 : 2.5}
          stroke={
            edge.preview
              ? "var(--color-accent)"
              : edge.lit
                ? "var(--color-text-secondary)"
                : "var(--color-border-strong)"
          }
          opacity={edge.lit || edge.preview ? 0.95 : 0.6}
          pathLength={edge.animate ? 1 : undefined}
          className={edge.animate ? "skill-branch-unlock" : undefined}
          style={edge.animate && edge.branch ? {
            "--skill-unlock-stroke": `var(--color-branch-${edge.branch})`,
            "--skill-unlock-boost": `drop-shadow(var(--drop-shadow-glow-${edge.branch}))`,
          } as CSSProperties : undefined}
        />
      ))}
    </g>
  );
}

const GLYPH_TONE: Record<SkillNodeStatus, string> = {
  locked: "text-text-disabled",
  "in-progress": "text-text-secondary",
  eligible: "text-text-primary",
  learned: "text-text-primary",
};
/**
 * Hexagon shell + glyph painted behind each HTML button.
 *
 * Memoised (TASKS 18.1). A node's paint depends on its own status, its own
 * selection and the branch filter — nothing else. Without the memo a single
 * selection change re-rendered all 36 shells, each re-creating its paths, glyph
 * and progress text, for a change that could have touched exactly one.
 */
function NodeShellImpl({
  node,
  status,
  dimmed,
  preview,
  selected,
  animating,
  onUnlockAnimationEnd,
  presentation,
  view,
}: {
  node: SkillDefinition;
  status: SkillNodeStatus;
  dimmed: boolean;
  preview: boolean;
  selected: boolean;
  animating: boolean;
  onUnlockAnimationEnd: (event: AnimationEvent<SVGGElement>) => void;
  presentation?: SkillNodePresentation;
  view?: SkillNodeView;
}) {  const radius = NODE_RADIUS[node.type];
  const learned = status === "learned";
  const visualX = presentation?.visualX ?? 0;
  const visualY = presentation?.visualY ?? 0;
  const icon = presentation?.icon ?? node.id;
  const progressCurrent = view?.progress.current ?? 0;
  const progressRequired = view?.progress.required ?? 0;
  const stroke =
    learned && node.branch
      ? `var(--color-branch-${node.branch})`
      : status === "eligible" || preview
        ? "var(--color-accent)"
        : selected
          ? "var(--color-text-primary)"
          : "var(--color-border-strong)";
  const glow = branchGlowFilter(node.branch);
  return (
    <g
      aria-hidden="true"
      opacity={dimmed ? 0.35 : 1}
      className={animating ? "skill-node-unlock" : undefined}
      // Lets `e2e/skill-tree.e2e.ts` compare each hit target against the hexagon
      // actually drawn beneath it. That comparison is what proves the overlay
      // and the `<svg>` agree; without a hook the two could drift apart again
      // and only be caught by eye.
      data-node-shell={node.id}
      onAnimationEnd={animating ? onUnlockAnimationEnd : undefined}
      style={{
        ...(learned ? { filter: glow, "--skill-node-glow": glow } : {}),
        ...(animating && node.branch
          ? {
              "--skill-unlock-boost": `drop-shadow(var(--drop-shadow-glow-${node.branch}))`,
            }
          : {}),
      } as CSSProperties}
    >
      {animating && node.branch ? (
        <circle
          cx={visualX}
          cy={visualY}
          r={radius}
          fill="none"
          stroke={`var(--color-branch-${node.branch})`}
          className="skill-ripple-unlock"
        />
      ) : null}
      <path
        d={hexPath(visualX, visualY, radius)}
        fill={learned ? "var(--color-surface-secondary)" : "var(--color-bg)"}
        fillOpacity={learned ? 0.95 : status === "locked" ? 0.6 : 0.85}
        stroke={stroke}
        strokeWidth={learned || status === "eligible" || preview || selected ? 3.5 : 2.5}
      />
      {selected ? (
        <path
          d={hexPath(visualX, visualY, radius + 10)}
          fill="none"
          stroke="var(--color-focus)"
          strokeWidth={2.5}
          strokeDasharray="10 8"
        />
      ) : null}
      <g
        transform={`translate(${visualX - radius * 0.32} ${visualY - radius * 0.32}) scale(${(radius * 0.64) / 24})`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(node.branch && learned ? BRANCH_TEXT_CLASS[node.branch] : GLYPH_TONE[status])}
      >
        {/* Paths paint directly: the shared `h-full w-full` svg resolves
            against the whole map inside an SVG viewport, so it cannot nest. */}
        {SKILL_GLYPH_PATHS[icon as SkillGlyphKey] ?? null}
      </g>
      {status === "locked" ? (
        <g
          transform={`translate(${visualX + radius * 0.42} ${visualY + radius * 0.42})`}
          className="text-text-disabled"
        >
          <rect
            x={-13}
            y={-13}
            width={26}
            height={26}
            rx={7}
            fill="var(--color-bg)"
            stroke="var(--color-border)"
            strokeWidth={2}
          />
          <path
            d="M-5 0v-1.5a5 5 0 0 1 10 0V0M-7 0h14v8a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : null}
      {status === "in-progress" ? (
        <text
          x={visualX}
          y={visualY + radius + 26}
          textAnchor="middle"
          fill="var(--color-text-muted)"
          fontSize={26}
        >
          {progressCurrent}/{progressRequired}
        </text>
      ) : null}
    </g>
  );
}

/** The memoised node shell the canvas renders. */
const NodeShell = memo(NodeShellImpl);

/**
 * One focusable node position in the map.
 *
 * Memoised, and deliberately rendered without the canvas's viewport in its props:
 * a drag rewrites the `viewBox` attribute imperatively (see `applyViewport`), so
 * panning never re-renders these at all. The positions are percentages of the
 * *un-zoomed* tree, which is why they can stay constant while the viewBox moves.
 */
function NodeButtonImpl({
  node,
  status,
  branch,
  selected,
  dimmed,
  onPointerDown,
  onClick,
}: {
  node: SkillDefinition;
  status: SkillNodeStatus;
  branch: AttributeKey | null;
  selected: boolean;
  /** Filtered out by the branch rail: stays in place, stays focusable, recedes. */
  dimmed: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-skill-node={node.id}
      onPointerDown={onPointerDown}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        // Positioned by `positionOverlays`, not by React: these are HTML siblings
        // of the `<svg>`, so nothing moves them when the viewBox changes. The
        // percentages are set imperatively from the same transform the SVG uses
        // — see the note on `overlayTransform`.
        "absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full",
        "h-(--control-height-md) w-(--control-height-md) cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-accent",
        dimmed && "opacity-40",
      )}
    >
      <span className="sr-only">
        {node.title} — {STATUS_LABEL[status]}
        {branch ? `, ${ATTRIBUTE_LABEL[branch as AttributeKey]}` : ""}
      </span>
    </button>
  );
}

const NodeButton = memo(NodeButtonImpl);

export function SkillTreeCanvas({
  state,
  previewIds,
  selectedId,
  activeBranch,
  unlockEvent = null,
  onUnlockAnimationEnd,
  onSelect,
}: SkillTreeCanvasProps) {
  const gridId = useId().replace(/[^a-zA-Z0-9]/g, "grid");
  const svgRef = useRef<SVGSVGElement | null>(null);
  /**
   * The pan/zoom viewport, held in a ref rather than in state (TASKS 18.1).
   *
   * This was the canvas's largest cost. A drag fired `setViewport` on every
   * pointer move, which re-rendered the whole tree — all 36 shells, 36 focus
   * buttons, every edge — 60 times a second, to move a viewBox attribute. The
   * nodes' data never changes during a pan, so none of it needed re-rendering.
   *
   * The viewBox is now written straight to the `<svg>` element. Nothing in the
   * tree reads the viewport for paint — node positions are percentages of the
   * un-zoomed tree — so writing the attribute is genuinely all the browser needs.
   * React state is used only where it earns its keep: the branch filter and the
   * unlock animation.
   */
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);
  /**
   * Drawing coordinates by node id, read imperatively when positioning targets.
   *
   * A ref rather than a prop: the targets are moved on pan and zoom without a
   * re-render, so their positions have to be readable outside render.
   */
  const overlayPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; viewport: Viewport } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preview = previewIds ?? new Set<string>();

  /**
   * Maps a drawing coordinate to a percentage of the canvas, the same way the
   * `<svg>` maps it.
   *
   * ## Why this exists
   *
   * The node buttons are HTML siblings of the `<svg>`, not children of it, so
   * nothing moves them when the viewBox changes. They used to be positioned as a
   * plain percentage of `SKILL_TREE_VIEWBOX` — the *whole* map frame — which was
   * only ever approximately right, and became plainly wrong in TASKS 22.3 when
   * the map started opening on a zoomed viewport instead of the full frame. The
   * hexagons moved; the hit targets did not.
   *
   * That is not cosmetic. 15 of 36 targets overlapped their neighbours and 13
   * sat under 24px apart, so some nodes could not be tapped at all — found by
   * Lighthouse's `target-size` rule and confirmed by measuring the live DOM.
   *
   * ## The transform being mirrored
   *
   * An `<svg>` with a `viewBox` scales its contents to *fit* the element and
   * centres what is left over — `preserveAspectRatio="xMidYMid meet"`, the
   * default. So the scale is whichever of the two ratios is smaller, and there
   * is a letterbox offset on the axis that has slack. Both matter: the canvas is
   * taller relative to its width than the viewport is, so the vertical offset is
   * roughly 95px, and ignoring it shifted every target upward by that much.
   */
  function overlayTransform(viewport: Viewport): {
    scale: number;
    offsetX: number;
    offsetY: number;
  } | null {
    const container = containerRef.current;
    if (container === null) return null;

    const bounds = container.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;

    const scale = Math.min(
      bounds.width / viewport.width,
      bounds.height / viewport.height,
    );

    return {
      scale,
      offsetX: (bounds.width - viewport.width * scale) / 2,
      offsetY: (bounds.height - viewport.height * scale) / 2,
    };
  }

  /**
   * Moves every node button onto its hexagon.
   *
   * Called from {@link applyViewport} and on resize, which is every situation in
   * which the mapping can change — the viewport lives in a ref rather than state
   * precisely so panning does not re-render 36 components, so this has to be
   * imperative too.
   */
  const positionOverlays = useCallback((viewport: Viewport) => {
    const transform = overlayTransform(viewport);
    const container = containerRef.current;
    if (transform === null || container === null) return;

    const { scale, offsetX, offsetY } = transform;
    const bounds = container.getBoundingClientRect();
    const overlays = container.querySelectorAll<HTMLElement>("[data-skill-node]");

    for (const overlay of overlays) {
      const point = overlayPositionsRef.current.get(overlay.dataset.skillNode ?? "");
      // A node filtered out of the tree is not rendered at all; a node missing
      // from the overlay map would have no position, and guessing one would put
      // a target where nothing is drawn.
      if (point === undefined) continue;

      const left = offsetX + (point.x - viewport.x) * scale;
      const top = offsetY + (point.y - viewport.y) * scale;

      overlay.style.left = `${(left / bounds.width) * 100}%`;
      overlay.style.top = `${(top / bounds.height) * 100}%`;
      // Outside the visible viewport, so a target cannot sit over the canvas
      // chrome or over the detail panel and still be clickable.
      overlay.style.visibility =
        left < -44 || top < -44 || left > bounds.width + 44 || top > bounds.height + 44
          ? "hidden"
          : "visible";
    }
  }, []);

  /** Writes the viewport to the `<svg>` and moves the targets with it. */
  const applyViewport = useCallback(
    (next: Viewport) => {
      viewportRef.current = next;
      const svg = svgRef.current;
      if (svg === null) return;
      svg.setAttribute("viewBox", `${next.x} ${next.y} ${next.width} ${next.height}`);
      positionOverlays(next);
    },
    [positionOverlays],
  );

  /**
   * The status of every node, memoised on the nodes themselves.
   *
   * Rebuilt on every render before this — a fresh Map over 36 entries, thrown
   * away if nothing else changed. It depends only on what a node's status is.
   */
  const statusById = useMemo(
    () =>
      new Map([...state.nodes.entries()].map(([id, view]) => [id, view.status])),
    [state.nodes],
  );

  /**
   * Drawing coordinates resolved from the presentation overlay, never read from
   * the domain node. `SkillDefinition` deliberately carries no `visualX` /
   * `visualY` (TASKS 6.1), so a position has to come from here — and a missing
   * entry falls back to 0 rather than inventing one.
   */
  const nodes = useMemo(
    () => [...state.nodes.values()].map((view) => view.node),
    [state.nodes],
  );

  /**
   * Drawing coordinates by node id, for `positionOverlays` to read.
   *
   * Computed with `useMemo` rather than written during render: assigning to a ref
   * inside the render body is not safe under concurrent rendering, and this
   * component deliberately holds 36 node buttons that must not re-render on a
   * pan. The effect that publishes it runs before any interaction can happen.
   */
  const overlayPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      const shown = presentationOf(node.id);
      map.set(node.id, { x: shown?.visualX ?? 0, y: shown?.visualY ?? 0 });
    }
    return map;
    // `presentationOf` reads a module-level overlay, which is constant; `nodes` is
    // the identity of what is being placed.
  }, [nodes]);

  useEffect(() => {
    overlayPositionsRef.current = overlayPositions;
    // Position once on mount and on every resize, so the targets are correct
    // before the first interaction and stay correct when the canvas changes
    // shape — a window resize changes the letterbox offset.
    positionOverlays(viewportRef.current);

    const container = containerRef.current;
    if (container === null) return;

    const observer = new ResizeObserver(() => positionOverlays(viewportRef.current));
    observer.observe(container);

    return () => observer.disconnect();
  }, [overlayPositions, positionOverlays]);

  /* Phase 3 (Task 3.3): when the screen reports an unlock, hand the three
     animated elements to GSAP. The `revision` in the event makes this fire
     again on every learn, and killing the previous timeline first means a
     rapid second learn interrupts cleanly instead of fighting the first. */
  useEffect(() => {
    if (!unlockEvent || !containerRef.current) return;

    const root = containerRef.current;
    const branchEl = root.querySelector<SVGPathElement>(".skill-branch-unlock");
    const nodeEl = root.querySelector<SVGGElement>(".skill-node-unlock");
    const rippleEl = root.querySelector<SVGCircleElement>(".skill-ripple-unlock");
    const branchLength = branchEl ? branchEl.getTotalLength() : 0;

    const tl = playSkillUnlock({ branchEl, nodeEl, rippleEl, branchLength });

    return () => {
      tl?.kill();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockEvent?.nodeId, unlockEvent?.revision]);

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const centerX = viewportRef.current.x + ((event.clientX - bounds.left) / bounds.width) * viewportRef.current.width;
    const centerY = viewportRef.current.y + ((event.clientY - bounds.top) / bounds.height) * viewportRef.current.height;
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

    // `passive` is not declared on the wheel handler, so the browser only waits
    // for us if it has to; the attribute write happens in the same frame as the
    // scroll, which is what keeps a zoom-trackpad gesture responsive.
    applyViewport(
      clampViewport(zoomViewport(viewportRef.current, factor, centerX, centerY)),
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewport: viewportRef.current,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.startX) / bounds.width) * drag.viewport.width;
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * drag.viewport.height;

    applyViewport(
      clampViewport({ ...drag.viewport, x: drag.viewport.x - deltaX, y: drag.viewport.y - deltaY }),
    );
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resetViewport() {
    applyViewport(SKILL_TREE_VIEWBOX);
  }

  function zoomAtCenter(factor: number) {
    const next = clampViewport(
      zoomViewport(viewportRef.current, factor, viewportRef.current.x + viewportRef.current.width / 2, viewportRef.current.y + viewportRef.current.height / 2),
    );
    applyViewport(next);
  }

  return (
    <div
      ref={containerRef}
      // `data-pan-surface` marks this as a deliberate clipping viewport rather than a
    // card that happens to clip its corners. The node targets are positioned
    // partly outside it — they track hexagons that are off-screen — and
    // `overflow-hidden` crops them, which is the point.
    // `e2e/responsive.e2e.ts` exempts descendants of this attribute specifically,
    // because exempting all of `overflow: hidden` would also exempt every `Card`
    // in the product and stop that test being able to fail.
    data-pan-surface=""
    className="relative touch-none overflow-hidden rounded-lg border border-border bg-bg"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div
        className="absolute top-3 right-3 z-10 flex gap-2"
        role="group"
        aria-label="Skill tree map controls"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomAtCenter(ZOOM_STEP)}
          // TASKS 22.1: 44px below `lg`, 36px above. The zoom cluster is the most
// finger-operated control in the product — it is the only way to inspect a node
// on a phone — so `sm` (a dense desktop size) was exactly the wrong default.
className="h-(--control-height-md) w-(--control-height-md) rounded-md border border-border bg-surface text-heading text-text-primary lg:h-(--control-height-sm) lg:w-(--control-height-sm)"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomAtCenter(1 / ZOOM_STEP)}
          // TASKS 22.1: 44px below `lg`, 36px above. The zoom cluster is the most
// finger-operated control in the product — it is the only way to inspect a node
// on a phone — so `sm` (a dense desktop size) was exactly the wrong default.
className="h-(--control-height-md) w-(--control-height-md) rounded-md border border-border bg-surface text-heading text-text-primary lg:h-(--control-height-sm) lg:w-(--control-height-sm)"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetViewport}
          // TASKS 22.1: as above - 44px below `lg` for the same reason.
className="h-(--control-height-md) rounded-md border border-border bg-surface px-3 text-label text-text-primary lg:h-(--control-height-sm)"
        >
          Fit
        </button>
      </div>
      {/*
        The initial viewBox is INITIAL_VIEWPORT, not the ref. Reading a ref during
        render is exactly what React forbids, and the constant is what the ref is
        initialised to: nothing can move the viewport before the first paint,
        because every writer is an event handler or an effect that runs after it.

        It is INITIAL_VIEWPORT rather than SKILL_TREE_VIEWBOX because fitting the
        whole 2450-unit tree into the canvas shrinks a hexagon to about 14px -
        see the comment on the constant for the full comparison against the
        approved reference.
      */}
      <svg
        ref={svgRef}
        viewBox={`${INITIAL_VIEWPORT.x} ${INITIAL_VIEWPORT.y} ${INITIAL_VIEWPORT.width} ${INITIAL_VIEWPORT.height}`}
        className="block h-(--skill-canvas-height) w-full"
        style={{ aspectRatio: `${INITIAL_VIEWPORT.width} / ${INITIAL_VIEWPORT.height}` }}
        role="img"
        aria-label={`Skill tree map: six branches growing from the Origin, ${nodes.length} nodes. Each node is a focusable button; for the same nodes as a readable list, choose the List view.`}
      >
        <MapBackdrop gridId={gridId} />
        <TreeEdges nodes={nodes} statusById={statusById} previewIds={preview} unlockEvent={unlockEvent} />
        <TierAxis />
        {nodes.map((node) => (
          <NodeShell
            key={unlockEvent?.nodeId === node.id ? `${node.id}-${unlockEvent.revision}` : node.id}
            node={node}
            presentation={presentationOf(node.id)}
            view={state.nodes.get(node.id)}
            status={statusById.get(node.id) ?? "locked"}
            dimmed={activeBranch != null && node.branch !== activeBranch && node.branch !== null}
            preview={preview.has(node.id)}
            selected={selectedId === node.id}
            animating={unlockEvent?.nodeId === node.id}
            onUnlockAnimationEnd={(event) => {
              if (event.target === event.currentTarget && unlockEvent) {
                onUnlockAnimationEnd?.(unlockEvent.revision);
              }
            }}
          />
        ))}
      </svg>
      {/*
        (TASKS 18.1) The node positions are percentages of the *un-zoomed* tree,
        so they do not need the viewport to be correct — which is what lets them
        be memoised and stay mounted across a pan. A dimmed node used to come
        from the same filter that draws the shells; it is derived here.
      */}
      {nodes.map((node) => {
        const view = state.nodes.get(node.id);
        if (!view) return null;
        const dimmed =
          activeBranch != null && node.branch !== activeBranch && node.branch !== null;

        return (
          <NodeButton
            key={node.id}
            node={node}
            status={view.status}
            branch={node.branch}
            selected={selectedId === node.id}
            dimmed={dimmed}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect(node.id)}
          />
        );
      })}
    </div>
  );
}
