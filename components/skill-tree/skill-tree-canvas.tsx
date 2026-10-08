/**
 * RootRealm — skill tree canvas (TASKS §2.3 renderer, §2.4 organic geometry).
 *
 * The deep-dark SVG map: hexagon nodes on `visualX`/`visualY`, S-curve
 * connectors, the tier axis. Nodes are real `<button>` elements over the SVG;
 * the SVG paints edges, shells, glyphs and the dotted grid behind them.
 */

import { useId, useRef, useState, type PointerEvent, type WheelEvent } from "react";

import { cn } from "@/lib/cn";

import { SKILL_NODE_BY_ID } from "./skill-tree-data";
import type { SkillNode, SkillNodeStatus } from "./skill-tree-data";
import { NODE_RADIUS } from "./skill-tree-geometry";
import { SKILL_TREE_VIEWBOX } from "./skill-tree-geometry";
import { TIER_AXIS } from "./skill-tree-geometry";
import { edgePath } from "./skill-tree-geometry";
import { hexPath } from "./skill-tree-geometry";
import { SKILL_GLYPH_PATHS } from "./skill-tree-glyphs";
import type { SkillGlyphKey } from "./skill-tree-glyphs";
import { BRANCH_TEXT_CLASS } from "./skill-tree-presentation";
import { branchGlowFilter } from "./skill-tree-presentation";
import type { SkillTreeState } from "./skill-tree-logic";

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
  onSelect: (id: string) => void;
};

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
  const axisX = SKILL_TREE_VIEWBOX.x + SKILL_TREE_VIEWBOX.width - 170;
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

type EdgeSpec = { key: string; d: string; lit: boolean; preview: boolean };
/** One connector per prerequisite id (OR edges). Decorative: buttons carry names. */
function TreeEdges({
  nodes,
  statusById,
  previewIds,
}: {
  nodes: readonly SkillNode[];
  statusById: SkillStatusById;
  previewIds: ReadonlySet<string>;
}) {
  const edges: EdgeSpec[] = [];
  for (const node of nodes) {
    const target = SKILL_NODE_BY_ID.get(node.id);
    if (!target) continue;
    for (const prereqId of node.prerequisiteIds) {
      const source = SKILL_NODE_BY_ID.get(prereqId);
      if (!source) continue;
      const lit =
        statusById.get(prereqId) === "learned" && statusById.get(node.id) !== "locked";
      edges.push({
        key: `${prereqId}->${node.id}`,
        d: edgePath(source.visualX, source.visualY, target.visualX, target.visualY),
        lit,
        preview: previewIds.has(node.id) && previewIds.has(prereqId),
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
/** Hexagon shell + glyph painted behind each HTML button. */
function NodeShell({
  node,
  status,
  dimmed,
  preview,
  selected,
}: {
  node: SkillNode;
  status: SkillNodeStatus;
  dimmed: boolean;
  preview: boolean;
  selected: boolean;
}) {
  const radius = NODE_RADIUS[node.type];
  const learned = status === "learned";
  const stroke =
    learned && node.branch
      ? `var(--color-branch-${node.branch})`
      : status === "eligible" || preview
        ? "var(--color-accent)"
        : selected
          ? "var(--color-text-primary)"
          : "var(--color-border-strong)";
  return (
    <g
      aria-hidden="true"
      opacity={dimmed ? 0.35 : 1}
      style={learned ? { filter: branchGlowFilter(node.branch) } : undefined}
    >
      <path
        d={hexPath(node.visualX, node.visualY, radius)}
        fill={learned ? "var(--color-surface-secondary)" : "var(--color-bg)"}
        fillOpacity={learned ? 0.95 : status === "locked" ? 0.6 : 0.85}
        stroke={stroke}
        strokeWidth={learned || status === "eligible" || preview || selected ? 3.5 : 2.5}
      />
      {selected ? (
        <path
          d={hexPath(node.visualX, node.visualY, radius + 10)}
          fill="none"
          stroke="var(--color-focus)"
          strokeWidth={2.5}
          strokeDasharray="10 8"
        />
      ) : null}
      <g
        transform={`translate(${node.visualX - radius * 0.32} ${node.visualY - radius * 0.32}) scale(${(radius * 0.64) / 24})`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(node.branch && learned ? BRANCH_TEXT_CLASS[node.branch] : GLYPH_TONE[status])}
      >
        {/* Paths paint directly: the shared `h-full w-full` svg resolves
            against the whole map inside an SVG viewport, so it cannot nest. */}
        {SKILL_GLYPH_PATHS[node.icon as SkillGlyphKey] ?? null}
      </g>
      {status === "locked" ? (
        <g
          transform={`translate(${node.visualX + radius * 0.42} ${node.visualY + radius * 0.42})`}
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
          x={node.visualX}
          y={node.visualY + radius + 26}
          textAnchor="middle"
          fill="var(--color-text-muted)"
          fontSize={26}
        >
          {node.progress}/{node.requiredProgress}
        </text>
      ) : null}
    </g>
  );
}
export function SkillTreeCanvas({
  state,
  previewIds,
  selectedId,
  activeBranch,
  onSelect,
}: SkillTreeCanvasProps) {
  const gridId = useId().replace(/[^a-zA-Z0-9]/g, "grid");
  const [viewport, setViewport] = useState<Viewport>(SKILL_TREE_VIEWBOX);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; viewport: Viewport } | null>(null);
  const preview = previewIds ?? new Set<string>();
  const statusById: SkillStatusById = new Map(
    [...state.nodes.entries()].map(([id, view]) => [id, view.status]),
  );
  const nodes = [...state.nodes.values()].map((view) => view.node);
  const { x, y, width, height } = viewport;

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const centerX = x + ((event.clientX - bounds.left) / bounds.width) * width;
    const centerY = y + ((event.clientY - bounds.top) / bounds.height) * height;
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setViewport((current) => clampViewport(zoomViewport(current, factor, centerX, centerY)));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewport,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.startX) / bounds.width) * drag.viewport.width;
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * drag.viewport.height;
    setViewport(clampViewport({ ...drag.viewport, x: drag.viewport.x - deltaX, y: drag.viewport.y - deltaY }));
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resetViewport() {
    setViewport(SKILL_TREE_VIEWBOX);
  }

  function zoomAtCenter(factor: number) {
    setViewport((current) => {
      const centerX = current.x + current.width / 2;
      const centerY = current.y + current.height / 2;
      return clampViewport(zoomViewport(current, factor, centerX, centerY));
    });
  }

  return (
    <div
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
          className="h-(--control-height-sm) w-(--control-height-sm) rounded-md border border-border bg-surface text-heading text-text-primary"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomAtCenter(1 / ZOOM_STEP)}
          className="h-(--control-height-sm) w-(--control-height-sm) rounded-md border border-border bg-surface text-heading text-text-primary"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetViewport}
          className="h-(--control-height-sm) rounded-md border border-border bg-surface px-3 text-label text-text-primary"
        >
          Fit
        </button>
      </div>
      <svg
        viewBox={`${x} ${y} ${width} ${height}`}
        className="block h-(--skill-canvas-height) w-full"
        style={{ aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label="Skill tree map: six branches growing from the Origin. Use the list below for keyboard navigation."
      >
        <MapBackdrop gridId={gridId} />
        <TreeEdges nodes={nodes} statusById={statusById} previewIds={preview} />
        <TierAxis />
        {nodes.map((node) => (
          <NodeShell
            key={node.id}
            node={node}
            status={statusById.get(node.id) ?? "locked"}
            dimmed={activeBranch != null && node.branch !== activeBranch && node.branch !== null}
            preview={preview.has(node.id)}
            selected={selectedId === node.id}
          />
        ))}
      </svg>
      {nodes.map((node) => {
        const view = state.nodes.get(node.id);
        if (!view) return null;
        const left = ((node.visualX - x) / width) * 100;
        const top = ((node.visualY - y) / height) * 100;
        const dimmed =
          activeBranch != null && node.branch !== activeBranch && node.branch !== null;
        return (
          <button
            key={node.id}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect(node.id)}
            aria-label={`${node.title} — ${view.status}`}
            aria-pressed={selectedId === node.id}
            style={{ left: `${left}%`, top: `${top}%` }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
              "h-(--control-height-md) w-(--control-height-md) cursor-pointer",
              "focus-visible:outline-2 focus-visible:outline-accent",
              dimmed && "opacity-40",
            )}
          >
            <span className="sr-only">
              {node.title} ({view.status}
              {node.branch ? `, ${node.branch}` : ""})
            </span>
          </button>
        );
      })}
    </div>
  );
}