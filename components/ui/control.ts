/**
 * Shared presentation constants for RootRealm's UI primitives.
 *
 * `Button` and `IconButton` are one control family: the same heights, radii and
 * variant treatment, differing only in padding and content. Those class strings
 * live here so the primitives cannot drift apart or duplicate a decision, and
 * every size resolves from `styles/tokens/component.css`
 * (docs/DESIGN_SYSTEM.md §24, §30).
 *
 * Internal to `components/ui/`. Renders nothing, imports no product code, and
 * must stay free of domain concepts (XP, quests, achievements, CodeCoins,
 * GitHub).
 */

/** Named control sizes. `md` is the touch target; `sm` and `lg` are opt-in. */
export type ControlSize = "sm" | "md" | "lg";

/** Named control treatments (docs/DESIGN_SYSTEM.md §24). */
export type ControlVariant = "primary" | "secondary" | "ghost" | "danger";

/** Box height per size. `md` (44px) is the default everywhere. */
export const CONTROL_HEIGHT: Record<ControlSize, string> = {
  sm: "h-(--control-height-sm)",
  md: "h-(--control-height-md)",
  lg: "h-(--control-height-lg)",
};

/** Square box per size, for icon-only controls. */
export const CONTROL_SQUARE: Record<ControlSize, string> = {
  sm: "size-(--control-height-sm)",
  md: "size-(--control-height-md)",
  lg: "size-(--control-height-lg)",
};

/**
 * Horizontal padding for the labelled control, keyed by size. Every value is
 * a spacing-scale step (space.css) and mirrors the Card padding steps
 * (3 / 4 / 6), so a button's inset grows with its box instead of its label
 * touching the border.
 *
 * Only `Button` consumes this: `IconButton` is a fixed square whose icon is
 * centred, so it has no inset of its own. The vertical axis needs none —
 * `CONTROL_HEIGHT` fixes the height and the content is centred.
 *
 * Added in Task 2.2 after the browser audit showed the labelled Button
 * rendering at `padding: 0` (Task 1.3 shipped height, radius, variant and
 * transition but no padding, so "Edit Profile" sat flush against its border).
 */
export const CONTROL_PADDING: Record<ControlSize, string> = {
  sm: "px-3", /* 12px */
  md: "px-4", /* 16px */
  lg: "px-6", /* 24px */
};

/**
 * Radius per size. Compact controls tighten to 8px; buttons and inputs use the
 * 10px button radius (docs/DESIGN_SYSTEM.md §7).
 */
export const CONTROL_RADIUS: Record<ControlSize, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-md",
};

/**
 * Icon optical size per control size (docs/DESIGN_SYSTEM.md §26). Icons inside
 * a control scale with the control instead of being chosen ad hoc.
 */
export const CONTROL_ICON: Record<ControlSize, string> = {
  sm: "size-(--icon-size-sm)",
  md: "size-(--icon-size-md)",
  lg: "size-(--icon-size-lg)",
};

/**
 * One entry per variant. Every variant sets each property that any other
 * variant sets — background, border width, border colour, text colour and
 * hover — so two variants can never collide. `cn` does no conflict resolution
 * (see lib/cn.ts) and Tailwind emits conflicting utilities in stylesheet order
 * rather than class order, so a variant must be the single source of truth for
 * the properties it owns. `ghost` deliberately sets no border width at all.
 *
 * `primary` is the light-on-dark monochrome treatment of the approved
 * references (`references/approved-ui/`). The accent colour is intentionally
 * not a button fill: it stays reserved for focus rings, selection and
 * progression (DESIGN_SYSTEM §24 "restrained accent", §33 "mostly monochrome
 * at rest").
 */
export const CONTROL_VARIANT: Record<ControlVariant, string> = {
  primary:
    "border border-text-primary bg-text-primary text-bg hover:border-text-secondary hover:bg-text-secondary",
  secondary:
    "border border-border bg-surface text-text-primary hover:border-border-strong hover:bg-state-hover",
  ghost: "text-text-secondary hover:bg-state-hover hover:text-text-primary",
  danger: "border border-danger text-danger hover:bg-state-hover",
};

/**
 * Interaction transition, shared by every primitive that responds to pointer or
 * keyboard state (button-like controls, fields and interactive cards). Token
 * durations only (AGENTS.md rule 3); reduced motion is handled both by the token
 * layer and by `motion-reduce`.
 */
export const INTERACTION_TRANSITION =
  "transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none";

/** Pointer at rest, blocked while disabled. */
export const CONTROL_CURSOR = "cursor-pointer disabled:cursor-not-allowed";

/** Disabled emphasis: reduced contrast, no animation (DESIGN_SYSTEM §24). */
export const CONTROL_DISABLED = "disabled:opacity-(--control-opacity-disabled)";

/**
 * Extra hit area for small icon-only controls: an invisible 4px halo that lifts
 * a 36px box to the 44px floor of DESIGN_SYSTEM §30 without changing the box
 * the designer sees. It paints nothing — Tailwind's `after:` variant already
 * emits `content: var(--tw-content)` and the framework resets that to "".
 *
 * Requires an unclipped ancestor and `gap-2` (8px) between neighbours, which is
 * exactly the halo of two adjacent buttons — no overlap, no dead zone.
 */
export const CONTROL_HIT_AREA = "relative after:absolute after:inset-0 after:-m-1";
