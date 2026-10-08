import type { ReactNode } from "react";

export { ATTRIBUTE_GLYPH } from "@/components/attributes/attribute-glyphs";

/**
 * Inline SVG glyph set for the profile screen (TASKS §2.1).
 *
 * The project has no icon package (package.json) and DESIGN_SYSTEM §26 asks for
 * simple geometric, Lucide-style glyphs that share stroke weight and optical
 * size — the same convention `components/layout/nav-items.tsx` already follows
 * (24-unit grid, `currentColor` stroke, round joins, no fills).
 *
 * Every glyph is decorative (`aria-hidden`): the text next to a glyph is always
 * the glyph's meaning, so a screen reader never needs to read the picture
 * (DESIGN_SYSTEM §31). Nothing here carries product logic or colour.
 */

type GlyphProps = {
  className?: string;
};

function Glyph({ className, children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/* --- Identity ----------------------------------------------------------- */

/** Verified marker next to the developer name (mock `verified` flag). */
export function VerifiedGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5.5" />
    </Glyph>
  );
}

/** Location pin. */
export function PinGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M12 21c4.5-4.4 7-7.9 7-11a7 7 0 1 0-14 0c0 3.1 2.5 6.6 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Glyph>
  );
}

/** Tag mark for the equipped-title pill. */
export function TagGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M20.59 13.41 12 4.82H4.82V12l8.59 8.59a1.83 1.83 0 0 0 2.59 0l4.59-4.59a1.83 1.83 0 0 0 0-2.59z" />
      <circle cx="8.6" cy="8.6" r="1.2" />
    </Glyph>
  );
}

/** Right chevron — the active profile-menu row indicator. */
export function ChevronGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="m9 6 6 6-6 6" />
    </Glyph>
  );
}

/* --- Profile menu (the rail from the approved reference) ---------------- */

export function GridGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Glyph>
  );
}

export function TerminalGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3" />
      <path d="M13 15h4" />
    </Glyph>
  );
}

export function AwardGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="9" r="5.5" />
      <path d="m8.5 13.7-1.5 6.3 5-2.6 5 2.6-1.5-6.3" />
    </Glyph>
  );
}

export function ActivityGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </Glyph>
  );
}

export function BarsGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M4 20v-7" />
      <path d="M10 20V6" />
      <path d="M16 20v-5" />
      <path d="M3 20h18" />
    </Glyph>
  );
}

/* --- Content glyphs ----------------------------------------------------- */

/** Star — quest mark, star counts, achievements. */
export function StarGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </Glyph>
  );
}

/** CodeCoin mark (PRD §11). The colour choice stays at the call site. */
export function CoinGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5A4 4 0 0 0 12 8.5c-2 0-3.5 1.5-3.5 3.5s1.5 3.5 3.5 3.5a4 4 0 0 0 2.5-.9" />
    </Glyph>
  );
}

/** Empty checkbox — the quest's not-yet-done state. */
export function BoxGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </Glyph>
  );
}

/** Folder mark standing in for the featured project's thumbnail artwork —
    no generated illustration is invented (PRD §14). */
export function FolderGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Glyph>
  );
}

/** Shield — one of the rarity marks in the achievement row. */
export function ShieldGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M12 3l7 2.8v5.7c0 4.4-2.9 7.4-7 9.5-4.1-2.1-7-5.1-7-9.5V5.8z" />
    </Glyph>
  );
}

/** Sparkle — one of the rarity marks in the achievement row. */
export function SparkleGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="m12 4 1.7 4.8 4.8 1.7-4.8 1.7L12 17l-1.7-4.8L5.5 10.5l4.8-1.7z" />
      <path d="m18.5 16 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </Glyph>
  );
}

