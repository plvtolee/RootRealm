import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type AvatarFrameMode = "none" | "pulse" | "haze" | "trail";

export type AvatarFrameProps = {
  children: ReactNode;
  mode: AvatarFrameMode;
  /** 0–100. Scales every frame effect's visibility; 0 disables the mode. */
  intensity: number;
  /** Adds the accent glow halo on top of the frame animation. */
  glow?: boolean;
  /**
   * Animation duration as a CSS value. Defaults to the ceremonial token
   * (`var(--motion-ceremonial)`), the rare-progression duration the frame
   * belongs to (DESIGN_SYSTEM §11). Callers may pass any motion token to
   * preview a different pace; the value is a token reference, never a number.
   */
  duration?: string;
  className?: string;
};

/**
 * Cosmetic frame motion stays on the ring; the avatar itself never moves.
 *
 * The component only publishes two CSS custom properties —
 * `--avatar-frame-strength` (0–1, from `intensity`) and
 * `--avatar-frame-duration` — and the keyframes in
 * `styles/tokens/motion.css` do all the animating. That keeps the strength
 * ramp live (tween a slider and the frame responds without a re-render) and
 * keeps every duration/easing decision in the token layer.
 */
export function AvatarFrame({
  children,
  mode,
  intensity,
  glow = false,
  duration,
  className,
}: AvatarFrameProps) {
  const strength = Number.isFinite(intensity)
    ? Math.min(Math.max(intensity, 0), 100)
    : 0;
  const activeMode = strength === 0 ? "none" : mode;
  const style = {
    "--avatar-frame-strength": String(strength / 100),
    ...(duration ? { "--avatar-frame-duration": duration } : null),
  } as CSSProperties;

  return (
    <span
      className={cn("avatar-frame relative isolate inline-flex rounded-pill", className)}
      data-avatar-frame-mode={activeMode}
      data-avatar-frame-glow={glow && strength > 0 ? "true" : undefined}
      style={style}
    >
      {children}
      <span
        aria-hidden="true"
        className="avatar-frame-energy pointer-events-none absolute inset-0 rounded-pill border-emphasis border-current"
      />
      {glow ? (
        <span
          aria-hidden="true"
          className="avatar-frame-glow pointer-events-none absolute inset-0 rounded-pill shadow-glow-accent"
        />
      ) : null}
    </span>
  );
}
