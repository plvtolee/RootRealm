/**
 * RootRealm — skill tree glyphs (TASKS §2.3 node icons).
 *
 * One inline-SVG renderer keyed by `SkillNode.icon` from `skill-tree-data.ts`.
 * Every glyph is stroked in `currentColor` on the shared 24-grid, so a node's
 * glyph inherits whatever colour its state already carries and the icon set
 * costs no extra tokens or dependencies (AGENTS.md rule 7).
 *
 * Glyphs are decorative: the surrounding control carries the accessible name,
 * so each svg is `aria-hidden`.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Every icon key used by `skill-tree-data.ts` (27 keys, `star` shared by keystones). */
export type SkillGlyphKey =
  | "origin"
  | "hammer"
  | "anvil"
  | "flask"
  | "rocket"
  | "star"
  | "bug"
  | "magnifier"
  | "lines"
  | "git"
  | "book"
  | "scroll"
  | "quill"
  | "shapes"
  | "ear"
  | "pair"
  | "inbox"
  | "handshake"
  | "broom"
  | "tag"
  | "shield"
  | "compass"
  | "blueprint"
  | "layers"
  | "flow"
  | "grid"
  | "link";

const GLYPHS: Record<SkillGlyphKey, ReactNode> = {
  origin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  hammer: (
    <>
      <path d="M13.5 4.5 19.5 10.5 16.5 13.5 10.5 7.5Z" />
      <path d="M10 9 4.5 14.5 4.5 18 8 18 13.5 12.5" />
    </>
  ),
  anvil: (
    <>
      <path d="M6 9h9l4 3-2 4H8l-3-4Z" />
      <path d="M8 20h10" />
      <path d="M12 16v4" />
    </>
  ),
  flask: (
    <>
      <path d="M10 3v6l-4.6 8A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.8-3L14 9V3" />
      <path d="M8.5 3h7" />
      <path d="M7.6 15h8.8" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3c2.8 2.1 4.2 5 4.2 8.6L12 16l-4.2-4.4C7.8 8 9.2 5.1 12 3Z" />
      <circle cx="12" cy="9.5" r="1.75" />
      <path d="M7.8 11.6 5 14l1 4" />
      <path d="M16.2 11.6 19 14l-1 4" />
    </>
  ),
  star: <path d="m12 3.5 2.7 5.45 6 .88-4.35 4.23 1.03 5.99L12 17.19l-5.38 2.86 1.03-5.99L3.3 9.83l6-.88Z" />,
  bug: (
    <>
      <ellipse cx="12" cy="13.5" rx="5" ry="5.5" />
      <circle cx="12" cy="6.5" r="2.5" />
      <path d="M10.3 4.5 9 2.5M13.7 4.5 15 2.5" />
      <path d="M7 11H4M7 15.5H4M7 18.5 4.8 20.5M17 11h3M17 15.5h3M17 18.5l2.2 2" />
      <path d="M12 10v11" />
    </>
  ),
  magnifier: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  lines: <path d="M4 7h16M4 12h10M4 17h13" />,
  git: (
    <>
      <path d="M6 3.5v11" />
      <circle cx="6" cy="17.5" r="2.5" />
      <circle cx="18" cy="6.5" r="2.5" />
      <path d="M18 9v1a5 5 0 0 1-5 5H8.5" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2Z" />
      <path d="M12 6.5v13" />
    </>
  ),
  scroll: (
    <>
      <rect x="6.5" y="4" width="11" height="16" rx="2" />
      <path d="M9.5 8h5M9.5 12h5M9.5 16h3.5" />
    </>
  ),
  quill: (
    <>
      <path d="M20.5 3.5C12.5 4 6.5 8.5 5.5 16l-1 4.5 4.5-1C17 18.5 21 12.5 20.5 3.5Z" />
      <path d="M5 19 14.5 9.5" />
      <path d="M9.5 14.5c2.5-.5 5-2.5 6-5" />
    </>
  ),
  shapes: (
    <>
      <path d="M6 3.5 9.5 9.5H2.5Z" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <circle cx="7.5" cy="17" r="4" />
      <path d="M16.5 13.5 20.5 17.5 16.5 21.5 12.5 17.5Z" />
    </>
  ),
  ear: (
    <>
      <path d="M7 10a5 5 0 0 1 10 0c0 3-3 4-3 6.5a3 3 0 0 1-6 0" />
      <path d="M10.5 10a1.5 1.5 0 0 1 3 0c0 1.5-1.5 2.5-1.5 3.5" />
    </>
  ),
  pair: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <path d="M16 14.5c2.5 0 4.5 2 4.5 5" />
    </>
  ),
  inbox: (
    <>
      <path d="M4.5 13H9l1.6 2.5h2.8L15 13h4.5" />
      <path d="M6.5 5h11l3 8v5.5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18.5V13z" />
    </>
  ),
  handshake: (
    <>
      <path d="M2.5 8.5H13" />
      <path d="m10.5 6 2.5 2.5L10.5 11" />
      <path d="M21.5 15.5H11" />
      <path d="M13.5 13 11 15.5l2.5 2.5" />
    </>
  ),
  broom: (
    <>
      <path d="M18.5 4.5 11 12" />
      <path d="M10.5 11.5 14 15 7.5 21H3.5L3 16.5Z" />
      <path d="M6.5 15 9 20" />
    </>
  ),
  tag: (
    <>
      <path d="M12.5 3.5H20V11l-8.5 8.5-7.5-7.5L12.5 3.5Z" />
      <circle cx="16.25" cy="7.25" r="1.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 19 5.5V11c0 4.5-2.8 7.7-7 9.5-4.2-1.8-7-5-7-9.5V5.5z" />
      <path d="m9 11.5 2 2 4-4.5" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" />
    </>
  ),
  blueprint: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M6 20.5V9l6-4.5 6 4.5v11.5" />
      <path d="M10 20.5v-5h4v5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
    </>
  ),
  flow: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      <path d="M10.5 7h5a3 3 0 0 1 3 3v3" />
      <path d="M16 11l2.5 2.5L21 11" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  link: (
    <>
      <path d="M10.5 13.5a4.5 4.5 0 0 0 6.7.4l2.3-2.3a4.5 4.5 0 0 0-6.4-6.4l-1.3 1.3" />
      <path d="M13.5 10.5a4.5 4.5 0 0 0-6.7-.4l-2.3 2.3a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3" />
    </>
  ),
};

export const SKILL_GLYPH_PATHS: Record<SkillGlyphKey, ReactNode> = GLYPHS;

/** Decorative node glyph — the parent button or label carries the accessible name. */
export function SkillGlyph({ name, className }: { name: string; className?: string }) {
  const glyph = GLYPHS[name as SkillGlyphKey];
  if (!glyph) return null;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-full w-full", className)}
    >
      {glyph}
    </svg>
  );
}

