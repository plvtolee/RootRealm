<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# RootRealm — Design Tokens (Task 1.1)

All visual values live in `styles/tokens/` and are loaded once by
`app/globals.css` through `styles/tokens/index.css`.

Layers:

- `color.css` — base palette (`--rr-*` primitives) plus semantic roles
  (`--color-bg`, `--color-surface`, `--color-surface-secondary`,
  `--color-text-primary|secondary|muted|disabled`, `--color-border`,
  `--color-border-strong`, `--color-accent`, optional accents,
  `--color-success|warning|danger|info`, state layers, scrim).
- `typography.css` — families, weights, tracking, leading, type scale
  (`text-display`, `text-heading`, `text-subheading`, `text-body`,
  `text-caption`, `text-label`).
- `space.css` — the only spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- `shape.css` — radius (4–14px) and hairline border widths.
- `elevation.css` — subtle shadows plus one semantic glow token.
- `motion.css` — durations 150–900ms, easing, reduced-motion behaviour.

Rules:

1. Components use semantic tokens only — never `--rr-*` primitives, never raw
   hex values, durations or spacing numbers.
2. The Tailwind default palette, spacing scale and radius scale are cleared, so
   off-brand utilities (`bg-zinc-800`, `p-5`, `rounded-3xl`) cannot be
   generated. If a value is missing, add a token instead of an arbitrary value.
3. Motion uses `--motion-fast|base|medium|slow|reveal|ceremonial` (for example
   `duration-(--motion-base)`) with `ease-standard`, `ease-entrance` or
   `ease-exit`. Numeric `duration-*` utilities are dynamic in Tailwind v4 and
   cannot be blocked by tokens, so the token names are mandatory by convention.
4. Purple (`--color-accent`) is an accent, not a theme. The interface stays
   monochrome by default.
5. `docs/DESIGN_SYSTEM.md` remains the source of truth for the visual language.

