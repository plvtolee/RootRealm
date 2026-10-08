import type { ReactNode } from "react";

export type GlyphProps = {
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

export function AwardGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="8" r="5.5" />
      <path d="m8.5 12.7-1.5 7.3 5-2.6 5 2.6-1.5-7.3" />
    </Glyph>
  );
}

export function ShieldGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M12 3l7 2.8v5.7c0 4.4-2.9 7.4-7 9.5-4.1-2.1-7-5.1-7-9.5V5.8z" />
    </Glyph>
  );
}

export function SparkleGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="m18.5 16 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </Glyph>
  );
}

export function StarGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </Glyph>
  );
}

export function CoinGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5A4 4 0 0 0 12 8.5c-2 0-3.5 1.5-3.5 3.5s1.5 3.5 3.5 3.5a4 4 0 0 0 2.5-.9" />
    </Glyph>
  );
}

export function CalendarGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M5 3v3M19 3v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z" />
    </Glyph>
  );
}

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

export function TagGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M20.59 13.41 12 4.82H4.82V12l8.59 8.59a1.83 1.83 0 0 0 2.59 0l4.59-4.59a1.83 1.83 0 0 0 0-2.59z" />
      <circle cx="8.6" cy="8.6" r="1.2" />
    </Glyph>
  );
}
