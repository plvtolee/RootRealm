import type { ComponentType, ReactNode } from "react";

import type { AttributeKey } from "@/lib/attributes";

export type AttributeGlyphProps = {
  className?: string;
};

function Glyph({ className, children }: AttributeGlyphProps & { children: ReactNode }) {
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

export function BuilderGlyph({ className }: AttributeGlyphProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="13" width="8" height="6" rx="1" />
      <rect x="13" y="13" width="8" height="6" rx="1" />
      <rect x="8" y="4" width="8" height="6" rx="1" />
    </Glyph>
  );
}

export function DebuggerGlyph({ className }: AttributeGlyphProps) {
  return (
    <Glyph className={className}>
      <rect x="8" y="7" width="8" height="12" rx="4" />
      <path d="M12 4v3M8 11H4M8 15H5M16 11h4M16 15h3m-7-8-1.5-2m7.5 2L17.5 5" />
    </Glyph>
  );
}

export function ScholarGlyph({ className }: AttributeGlyphProps) {
  return (
    <Glyph className={className}>
      <path d="m12 4 9 4.5-9 4.5-9-4.5z" />
      <path d="M6.5 11v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4" />
    </Glyph>
  );
}

export function CollaboratorGlyph({ className }: AttributeGlyphProps) {
  return (
    <Glyph className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <circle cx="17.5" cy="9.5" r="2.5" />
      <path d="M16.5 14.2A4 4 0 0 1 21 18v2" />
    </Glyph>
  );
}

export function MaintainerGlyph({ className }: AttributeGlyphProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5V6M12 18v2.5M3.5 12H6M18 12h2.5m-14.5-6 1.8 1.8m8.4 8.4 1.8 1.8m0-12-1.8 1.8m-8.4 8.4L6 18" />
    </Glyph>
  );
}

export function ArchitectGlyph({ className }: AttributeGlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
      <path d="M12 7.5 16 9.8v4.4L12 16.5l-4-2.3V9.8z" />
    </Glyph>
  );
}

export const ATTRIBUTE_GLYPH: Record<AttributeKey, ComponentType<AttributeGlyphProps>> = {
  builder: BuilderGlyph,
  debugger: DebuggerGlyph,
  scholar: ScholarGlyph,
  collaborator: CollaboratorGlyph,
  maintainer: MaintainerGlyph,
  architect: ArchitectGlyph,
};
