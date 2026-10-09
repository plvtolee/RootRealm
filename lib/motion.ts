"use client";

/**
 * RootRealm — shared motion helpers (Phase 3: UI Motion).
 *
 * One client-only module wrapping GSAP behind token-aware helpers. All
 * durations and easings are read from the CSS custom properties declared in
 * `styles/tokens/motion.css`, so the design system stays the single source of
 * truth — tune `--motion-unlock`, `--motion-ceremonial`, ... and every
 * animation follows.
 *
 * Every helper collapses under `prefers-reduced-motion`: the existing CSS
 * keyframes in `motion.css` already render the final state, so this module
 * must only *enhance* the animated path.
 *
 * Note on the CSS-var contract with `AvatarFrame`
 * (components/profile/avatar-frame.tsx): that component keeps publishing
 * `--avatar-frame-strength` / `--avatar-frame-duration` on its own element,
 * so DevTools live-tweaking still works; GSAP animates the same ring/glow
 * nodes the CSS keyframes targeted, and both paths agree because they read
 * the same tokens.
 */
import { gsap } from "gsap";

/* ------------------------------------------------------------------ */
/* Token readers                                                       */
/* ------------------------------------------------------------------ */

function rootStyles(): CSSStyleDeclaration {
  return getComputedStyle(document.documentElement);
}

/** Parse a millisecond token into seconds for GSAP. */
function msVar(cs: CSSStyleDeclaration, name: string): number {
  const n = parseFloat(cs.getPropertyValue(name));
  return Number.isFinite(n) ? n / 1000 : 0;
}

function strVar(cs: CSSStyleDeclaration, name: string): string {
  return cs.getPropertyValue(name).trim();
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Snapshot of the motion tokens, in GSAP units (seconds / easing strings). */
export function readMotionTokens() {
  const cs = rootStyles();
  return {
    unlock: msVar(cs, "--motion-unlock"),
    base: msVar(cs, "--motion-base"),
    medium: msVar(cs, "--motion-medium"),
    slow: msVar(cs, "--motion-slow"),
    ceremonial: msVar(cs, "--motion-ceremonial"),
    easeStandard: strVar(cs, "--ease-standard"),
    easeEntrance: strVar(cs, "--ease-entrance"),
    easeExit: strVar(cs, "--ease-exit"),
    reduced: reducedMotion(),
  };
}

/* ------------------------------------------------------------------ */
/* Task 3.1 — page entrance                                           */
/* ------------------------------------------------------------------ */

/**
 * The route-change entrance. `app/template.tsx` remounts on every
 * navigation, so calling this from that component plays the entrance once
 * per route. Mirrors the `page-enter` keyframe: the content appears from
 * slightly below — a small rise, never a fly-in.
 */
export function playPageEnter(container: HTMLElement | null) {
  if (!container || reducedMotion()) return;

  const t = readMotionTokens();
  const rise = parseFloat(strVar(rootStyles(), "--spacing-1")) || 4;

  gsap.fromTo(
    container,
    { opacity: 0, y: rise },
    { opacity: 1, y: 0, duration: t.medium, ease: t.easeEntrance, clearProps: "all" },
  );
}

/* ------------------------------------------------------------------ */
/* Task 3.2 — avatar frame motion                                      */
/* ------------------------------------------------------------------ */

export type FrameMode = "none" | "pulse" | "haze" | "trail";

/**
 * Loops the cosmetic frame animation on the ring (never the portrait). The
 * component stays the source of truth for `--avatar-frame-strength`, so the
 * intensity still tweens without a re-render; GSAP only takes over the loop
 * itself. Call `stopAvatarFrame` on unmount or before re-running.
 */
export function playAvatarFrame(
  frameEl: HTMLElement | null,
  opts: { mode: FrameMode; intensity: number; glow?: boolean },
) {
  if (!frameEl) return;

  const ring = frameEl.querySelector<HTMLElement>(".avatar-frame-energy");
  const glowEl = frameEl.querySelector<HTMLElement>(".avatar-frame-glow");
  gsap.killTweensOf([ring, glowEl].filter(Boolean) as HTMLElement[]);

  if (opts.mode === "none" || opts.intensity <= 0 || reducedMotion()) {
    // The CSS reduced-motion block (motion.css) renders the resting state;
    // nothing to animate here.
    return;
  }

  const t = readMotionTokens();
  const strength = opts.intensity / 100;
  const half = t.ceremonial / 2;

  if (opts.mode === "pulse" && ring) {
    gsap.fromTo(
      ring,
      { opacity: strength * 0.95, scale: 1 },
      {
        opacity: strength * 0.35,
        scale: 1,
        duration: half,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      },
    );
  } else if (opts.mode === "haze") {
    if (ring) {
      gsap.fromTo(
        ring,
        { opacity: strength * 0.25 },
        {
          opacity: strength * 0.65,
          duration: half,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
      );
    }
    if (glowEl) {
      gsap.fromTo(
        glowEl,
        { opacity: strength * 0.2 },
        {
          opacity: strength * 0.6,
          duration: t.ceremonial,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
      );
    }
  } else if (opts.mode === "trail" && ring) {
    gsap.fromTo(
      ring,
      { opacity: strength * 0.3, rotate: -15, scale: 1 },
      {
        opacity: strength * 0.85,
        rotate: 15,
        scale: 1.02,
        duration: t.ceremonial,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      },
    );
  }
}

/** Stops any frame loop started by `playAvatarFrame`. */
export function stopAvatarFrame(frameEl: HTMLElement | null) {
  if (!frameEl) return;
  const ring = frameEl.querySelector<HTMLElement>(".avatar-frame-energy");
  const glowEl = frameEl.querySelector<HTMLElement>(".avatar-frame-glow");
  gsap.killTweensOf([ring, glowEl].filter(Boolean) as HTMLElement[]);
}

/* ------------------------------------------------------------------ */
/* Task 3.3 — skill unlock animation                                   */
/* ------------------------------------------------------------------ */

export interface SkillUnlockTargets {
  /** The edge `<path>` between the prerequisite and the learned node. */
  branchEl?: SVGPathElement | null;
  /** The learned node's `<g>` shell. */
  nodeEl?: SVGGElement | null;
  /** The ripple `<circle>` emitted from the node centre. */
  rippleEl?: SVGCircleElement | null;
  /** Total length of the edge path (for stroke-dash drawing). */
  branchLength?: number;
}

/**
 * The three-part progression reveal:
 *
 * 1. branch streak — the connector draws itself from the prerequisite
 *    (stroke-dashoffset), 8px wide with the branch stroke, settling at 4px;
 * 2. node burst — the hexagon pops 0.6 → 1.35 → 0.95 → 1, visible throughout;
 * 3. ripple — a ring expands from the node centre and fades.
 *
 * Only the changed branch participates; the canvas decides which elements
 * those are from the existing `unlockEvent` prop.
 */
export function playSkillUnlock(targets: SkillUnlockTargets) {
  const { branchEl, nodeEl, rippleEl, branchLength = 0 } = targets;

  if (reducedMotion()) {
    // Same final state the CSS reduced-motion block applies.
    if (branchEl) {
      branchEl.style.strokeDashoffset = "0";
      branchEl.style.strokeWidth = "4";
    }
    if (nodeEl) nodeEl.style.transform = "scale(1)";
    if (rippleEl) {
      rippleEl.setAttribute("r", "70");
      rippleEl.setAttribute("stroke-width", "0");
      rippleEl.setAttribute("opacity", "0");
    }
    return;
  }

  const t = readMotionTokens();
  const tl = gsap.timeline();

  if (branchEl && branchLength > 0) {
    tl.fromTo(
      branchEl,
      {
        strokeDasharray: branchLength,
        strokeDashoffset: branchLength,
        strokeWidth: 8,
      },
      {
        strokeDashoffset: 0,
        duration: t.unlock,
        ease: t.easeEntrance,
      },
      0,
    );
    // Settle to the resting lit width at the end of the draw.
    tl.to(branchEl, { strokeWidth: 4, duration: t.unlock * 0.3, ease: t.easeStandard }, 0);
  }

  if (nodeEl) {
    tl.fromTo(
      nodeEl,
      { scale: 0.6 },
      {
        keyframes: [{ scale: 1.35 }, { scale: 0.95 }, { scale: 1 }],
        duration: t.unlock,
        ease: t.easeEntrance,
        transformOrigin: "center",
      },
      branchLength > 0 ? 0 : 0,
    );
  }

  if (rippleEl) {
    tl.fromTo(
      rippleEl,
      { attr: { r: 0, "stroke-width": 5 }, opacity: 1 },
      {
        attr: { r: 70, "stroke-width": 0 },
        opacity: 0,
        duration: t.unlock,
        ease: t.easeExit,
      },
      0,
    );
  }

  return tl;
}

/* ------------------------------------------------------------------ */
/* Task 3.4 — achievement reveal                                       */
/* ------------------------------------------------------------------ */

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

/**
 * Restrained, rarity-appropriate reveal (DESIGN_SYSTEM §11: common
 * achievements never look like major unlocks):
 *   common   — fade only, `--motion-base`, `--ease-standard`
 *   rare     — fade + subtle scale (0.97), `--motion-base`
 *   epic/legendary — fade + scale (0.95), `--motion-slow`, `--ease-entrance`
 * No glow, no particles.
 */
export function playAchievementReveal(
  cardEl: HTMLElement | null,
  rarity: AchievementRarity,
) {
  if (!cardEl) return;

  if (reducedMotion()) {
    cardEl.style.opacity = "1";
    cardEl.style.transform = "";
    return;
  }

  const t = readMotionTokens();
  const dramatic = rarity === "epic" || rarity === "legendary";
  const duration = dramatic ? t.slow : t.base;
  const ease = dramatic ? t.easeEntrance : t.easeStandard;
  const fromScale = rarity === "common" ? 1 : dramatic ? 0.95 : 0.97;

  gsap.fromTo(
    cardEl,
    { opacity: 0, scale: fromScale },
    { opacity: 1, scale: 1, duration, ease, clearProps: "transform" },
  );
}

/** Cancels every tween the helpers above may have started on `el`. */
export function stopMotion(el: Element | null | undefined) {
  if (!el) return;
  gsap.killTweensOf(el);
}
