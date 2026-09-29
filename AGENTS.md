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

---

# RootRealm — Base UI Primitives (Task 1.3)

The reusable low-level primitives live in `components/ui/`. They are not
screens: nothing here may know about XP, quests, achievements, CodeCoins,
GitHub, rarity or attributes — a primitive takes typed props and paints
semantic tokens.

| primitive     | file                            | use                                    |
| ------------- | ------------------------------- | -------------------------------------- |
| `Button`      | `button.tsx`                    | labelled action, four variants         |
| `IconButton`  | `icon-button.tsx`               | icon-only action, `label` required     |
| `Card`        | `card.tsx`                      | restrained surface container           |
| `Badge`       | `badge.tsx`                     | status chip, semantic tones            |
| `Divider`     | `divider.tsx`                   | hairline separator                     |
| `Input`       | `input.tsx`                     | labelled text field with error state   |
| `ProgressBar` | `progress-bar.tsx`              | progress with `progressbar` semantics  |
| `Avatar`      | `avatar.tsx`                    | image with initials fallback           |
| `Text`        | `text.tsx`                      | the six typography roles (Task 1.2)    |

Shared constants (internal, renders nothing): `components/ui/control.ts` — the
control heights, radii, icon sizes and variant treatment used by `Button` and
`IconButton`, so the two cannot drift apart.

Sizes:

- named component sizes live in `styles/tokens/component.css`
  (`--control-height-sm|md|lg`, `--icon-size-sm|md|lg`,
  `--avatar-size-sm|md|lg|xl`, `--badge-height-sm|md`,
  `--control-opacity-disabled`). A primitive never writes a height, icon size or
  avatar size as a number.
- the spacing scale in `space.css` remains the source for padding, gaps,
  progress heights and the hit-area halo. No new spacing values were added.
- `md` is the default size everywhere, and it is the 44px touch target
  (DESIGN_SYSTEM §30). `sm` (36px) is a dense desktop size; only `IconButton`
  earns its touch area back with `CONTROL_HIT_AREA` (an invisible 4px halo).

Rules:

1. One utility per CSS property per element. `cn` has no conflict resolution
   (no `clsx`, no `tailwind-merge`) and Tailwind emits conflicting utilities in
   stylesheet order, not class order — so a variant must be the single source of
   truth for the properties it owns, and a `className` passed by a caller must
   not restate a variant's colour, border or hover.
2. Variants paint semantic tokens only. The accent is deliberately not a button
   fill: the primary button is the light-on-dark monochrome treatment from
   `references/approved-ui/`, and accent stays reserved for focus, selection and
   progression (DESIGN_SYSTEM §24, §33).
3. Accessibility invariants — keep them when extending a primitive:
   - `Button` and `IconButton` are always real `<button>` elements and default
     to `type="button"`, so no primitive ever submits a form by accident.
   - `IconButton` requires `label` and removes `aria-label` from its props, so
     an icon-only control always has exactly one source for its name.
   - `Input` requires `label`, binds it with `for`/`id` (generated with `useId`
     when none is passed) and wires `hint`/`error` through `aria-describedby`
     plus `aria-invalid`.
   - `Card interactive` renders a `<button>` by default (or the caller's `a`),
     so a clickable card is never an unreachable `<div>`.
   - `Avatar` requires `alt` whenever `src` is given, and exposes `name` through
     `role="img"` in the fallback; without either it is `aria-hidden`.
   - `ProgressBar` exposes `role="progressbar"` with `aria-valuemin`,
     `aria-valuemax` and `aria-valuenow`, and clamps its value; it needs a name
     (`label` or `aria-labelledby`).
   - focus is visible through the global `:focus-visible` outline in
     `app/globals.css`, plus the input's own accent hairline. Don't remove it.
4. Loading is a `Button` state, not a `disabled` button: it sets `aria-busy` and
   `aria-disabled` and swallows the click, so the control keeps focus while the
   action settles. That click interception is why `button.tsx` is a client
   component; the other primitives are not.
5. `Badge` accepts semantic tones (`default`, `neutral`, `accent`, `success`,
   `warning`, `danger`) and nothing else. Rarity, attribute and rank vocabularies
   belong to the screens that own them, which then map onto a tone — do not add
   product words to the primitive.
6. Avatar frames, glows and decorative effects are out of scope
   (DESIGN_SYSTEM §13, §14). No primitive uses `--shadow-glow-accent`, and none
   adds animation beyond interaction state changes.
7. No new dependencies. Primitives use `lib/cn.ts`; the only graphic in the
   primitives (the button spinner) is an inline SVG in `currentColor`.
8. A new primitive is added to the table above in the same change.


