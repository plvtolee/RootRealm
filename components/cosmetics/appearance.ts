/**
 * RootRealm — how a cosmetic appearance is painted (TASKS 13.1).
 *
 * ```text
 * a cosmetic's appearance key → the ring, wash and accent it renders as
 * ```
 *
 * ## Why this module exists
 *
 * `/profile` and `/customization` both render the equipped frame, and before this
 * they each carried their own copy of the mapping. They drifted immediately and
 * visibly: the profile hardcoded `border-emphasis` at `p-2` with
 * `text-text-secondary` and a `pulse` mode, while customization used `border-2`
 * at `p-1` with the equipped item's colour. Equipping a frame changed nothing on
 * the profile, because the profile never asked what was equipped.
 *
 * The drift was not cosmetic — it made the product's central promise ("you bought
 * this, and it shows on your profile") false. So the mapping moves here, once, and
 * both screens read it.
 *
 * ## Why the geometry is a constant and not a class on each call site
 *
 * `RING_WIDTH` and `RING_GAP` are the two properties that made the two frames
 * visibly different sizes. Exposing them as named constants means a future change
 * moves both frames together, and means a screen cannot pick its own.
 */

/** Every colour key a frame, banner or theme may publish. */
export type CosmeticAppearance = "neutral" | "amber" | "cyan" | "violet";

/** The appearance a frame may be read as, falling back to `neutral`. */
export function appearanceOf(key: string | null | undefined): CosmeticAppearance {
  return key === "amber" || key === "cyan" || key === "violet" ? key : "neutral";
}

/**
 * The ring's border width.
 *
 * One width for both screens. It was `border-emphasis` on the profile and
 * `border-2` in customization, which is why the two rings did not line up.
 */
export const RING_WIDTH = "border-2";

/**
 * The gap between the ring and the portrait.
 *
 * `p-1` (4px). `p-2` on the profile made the same avatar sit inside a visibly
 * larger frame than the one the developer had just chosen.
 */
export const RING_GAP = "p-1";

/**
 * The classes an equipped frame paints on the ring.
 *
 * Keyed by appearance, never by item id: the colour is the cosmetic's claim about
 * itself, and the ring should follow the claim wherever the item is worn.
 */
export const FRAME_RING: Record<CosmeticAppearance, string> = {
  neutral: "border-border bg-surface-secondary text-text-secondary",
  amber: "border-warning bg-warning/10 text-warning",
  cyan: "border-info bg-info/10 text-info",
  violet: "border-accent bg-accent/10 text-accent",
};

/** The banner wash, for the same reasons as {@link FRAME_RING}. */
export const BANNER_WASH: Record<CosmeticAppearance, string> = {
  neutral: "bg-surface-secondary",
  amber: "bg-warning/10",
  cyan: "bg-info/10",
  violet: "bg-accent/10",
};

/** The accent a theme paints its own text in. */
export const THEME_ACCENT: Record<CosmeticAppearance, string> = {
  neutral: "text-text-primary",
  amber: "text-warning",
  cyan: "text-info",
  violet: "text-accent",
};

/** The frame motions the motion layer actually implements (`avatar-frame.tsx`). */
export type FrameMotion = "none" | "pulse" | "haze" | "trail";

/**
 * An effect's appearance key, resolved to a frame motion.
 *
 * ## The two vocabularies are not interchangeable
 *
 * A **frame** publishes a colour (`neutral`/`amber`/`cyan`/`violet`) and a
 * **effect** publishes a *motion* (`none`/`pulse`/`haze`/`trail`) — see
 * `lib/cosmetics/catalog.ts`, where `effect-pulse` carries `appearance: "pulse"`.
 * Treating one as the other is a silent no-op: an effect named "pulse" read as a
 * colour falls back to `neutral`, which resolves to motion `none`, and a
 * purchased effect animates nothing with no error anywhere.
 *
 * So this map is keyed by the *effect's own* vocabulary, and the four keys are
 * exactly the four modes `avatar-frame.tsx` implements — a cosmetic may only
 * choose among modes that already exist, or the effect would be an item that
 * nothing animates.
 */
export const EFFECT_MODE: Record<string, FrameMotion> = {
  none: "none",
  pulse: "pulse",
  haze: "haze",
  trail: "trail",
};

/**
 * The frame motion for an effect item.
 *
 * An unknown appearance is `none` rather than a guess: a motion that does not
 * exist would leave the ring un-animated, which is the same visible result as
 * `none` but without saying why.
 */
export function frameMotionFor(effectAppearance: string | null | undefined): FrameMotion {
  if (effectAppearance === undefined || effectAppearance === null) return "none";
  return EFFECT_MODE[effectAppearance] ?? "none";
}

/**
 * The intensity an equipped effect is shown at.
 *
 * The customization screen exposes a live control so the effect can be previewed
 * at any strength; the profile shows the default, which is the catalog's own
 * strength rather than whatever the control was last left at. A view control is a
 * preview, not a setting that should follow a developer around the app.
 */
export const PROFILE_FRAME_INTENSITY = 50;