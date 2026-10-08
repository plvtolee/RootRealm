import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type AvatarFrameMode = "none" | "pulse" | "haze" | "trail";

export type AvatarFrameProps = {
  children: ReactNode;
  mode: AvatarFrameMode;
  intensity: number;
  glow?: boolean;
  className?: string;
};

/** Cosmetic frame motion stays on the ring; the avatar itself never moves. */
export function AvatarFrame({
  children,
  mode,
  intensity,
  glow = false,
  className,
}: AvatarFrameProps) {
  const strength = Number.isFinite(intensity)
    ? Math.min(Math.max(intensity, 0), 100)
    : 0;
  const activeMode = strength === 0 ? "none" : mode;
  const style = { "--avatar-frame-strength": String(strength / 100) } as CSSProperties;

  return (
    <span
      className={cn("avatar-frame relative isolate inline-flex rounded-pill", className)}
      data-avatar-frame-mode={activeMode}
      data-avatar-frame-glow={glow && strength > 0 ? "true" : undefined}
      style={style}
    >
      {children}
      <span aria-hidden="true" className="avatar-frame-energy pointer-events-none absolute inset-0 rounded-pill border-emphasis border-current" />
      {glow ? (
        <span aria-hidden="true" className="avatar-frame-glow pointer-events-none absolute inset-0 rounded-pill shadow-glow-accent" />
      ) : null}
    </span>
  );
}
