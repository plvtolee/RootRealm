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

---

# RootRealm — Typography (Task 1.2)

The hierarchy is exactly six roles (`docs/DESIGN_SYSTEM.md` §5). There are no
other text styles:

| role         | use                                              | token           |
| ------------ | ------------------------------------------------ | --------------- |
| `display`    | large section titles and identity moments        | `text-display`  |
| `heading`    | screen and section titles                        | `text-heading`  |
| `subheading` | supporting section hierarchy                     | `text-subheading` |
| `body`       | descriptions and normal content                  | `text-body`     |
| `caption`    | metadata, timestamps and supporting information   | `text-caption`  |
| `label`      | buttons, filters, tabs and status indicators      | `text-label`    |

Files:

- `styles/tokens/typography.css` — families, weights, tracking, leading and the
  six roles, including the responsive steps. The only place a size exists.
- `components/ui/text.tsx` — typed `Text` primitive
  (`variant`, `as`, `className` + native props).
- `app/globals.css` — base defaults mapping `h1`/`h2`/`h3`–`h6`/`small` onto
  roles so plain semantic HTML is already correct.
- `lib/cn.ts` — dependency-free class joiner used by UI primitives.

Rules:

1. Use `<Text variant="…">` or the matching `text-*` utility. Never write a
   font size, weight, tracking or leading value in a component.
2. Exactly one typography role per element. Do not override a role with another
   `text-*` size utility, and do not reach for responsive font-size overrides —
   the roles scale themselves (see below). Change the `variant` instead.
3. Colours are a separate axis: `Text` sets no colour. Pick `text-text-primary`,
   `text-text-secondary`, `text-text-muted` or an accent explicitly. Use weight
   and spacing for hierarchy before colour (DESIGN_SYSTEM §5).
4. Choose elements semantically (`docs/DESIGN_SYSTEM.md` §31). `Text` defaults to
   `display` → `h1`, `heading` → `h2`, `subheading` → `h3`, `body` → `p`,
   `caption`/`label` → `span`; pass `as` to match the document outline, and keep
   one `h1` per screen.
5. `label` is not uppercased by the token layer. Add `uppercase` where the
   eyebrow style is wanted; the wide tracking is already in the token.
6. `--font-mono` exists but is not one of the six roles. Use it only for code,
   identifiers and tabular values.

Responsive scaling (DESIGN_SYSTEM §29, mobile-first):

- base = the 375 × 812 / 390 × 844 target, stepped at 768 (`md`), 1024 (`lg`)
  and 1280 (`xl`, the maximum; holds at 1440+).
- `display` 28 → 32 → 36 → 40px, `heading` 20 → 24px, `subheading` 16 → 18px.
- `body` (15px), `caption` (13px) and `label` (12px) are fixed at every width:
  reading text and metadata must not inflate with the viewport, and all sizes
  are rem-based so user font-size preferences are respected.


