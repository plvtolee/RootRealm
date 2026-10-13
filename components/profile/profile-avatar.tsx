import { Avatar } from "@/components/ui/avatar";
import {
  FRAME_RING,
  PROFILE_FRAME_INTENSITY,
  RING_GAP,
  RING_WIDTH,
  appearanceOf,
  frameMotionFor,
} from "@/components/cosmetics/appearance";
import { COSMETIC_INDEX } from "@/lib/cosmetics/catalog";
import { cn } from "@/lib/cn";
import { AvatarFrame } from "./avatar-frame";

export type ProfileAvatarProps = {
  /** Handle shown as the avatar's accessible name (initials fallback). */
  username: string;
  /** The equipped frame item's id, or null when nothing is worn. */
  frameId?: string | null;
  /** The equipped effect item's id, or null when nothing is worn. */
  effectId?: string | null;
  className?: string;
};

/**
 * The profile portrait (TASKS 2.1 presentation, 13.4 worn cosmetics).
 *
 * ## The frame is the developer's, not the screen's
 *
 * This used to hardcode `mode="pulse"`, `intensity={30}` and
 * `text-text-secondary` with a `p-2` gap, while `/customization` rendered the
 * item actually equipped at `p-1` and `border-2`. Equipping a cosmetic in the
 * shop therefore changed nothing here — the profile could not be wrong about the
 * developer's character because it was never looking at it.
 *
 * Now both screens read `components/cosmetics/appearance.ts`, so the ring's
 * width, gap, colour and motion are the same function of the same item id.
 *
 * ## The ornaments belong to the default look only
 *
 * The two diamonds come from `references/approved-ui/profile.png`, where they sit
 * on the plain reference ring. Over an equipped frame they would be a second,
 * unrelated decoration drawn on top of a cosmetic the developer chose, so they
 * render only when nothing is worn — which is also exactly the state the
 * reference depicts.
 *
 * There is still no image: the Avatar renders its honest initials fallback rather
 * than an invented portrait (PRD §14 forbids generated avatar artwork).
 */
export function ProfileAvatar({ username, frameId, effectId, className }: ProfileAvatarProps) {
  const frame = frameId === null || frameId === undefined ? undefined : COSMETIC_INDEX.byId.get(frameId);
  const effect = effectId === null || effectId === undefined ? undefined : COSMETIC_INDEX.byId.get(effectId);

  const wearingFrame = frame !== undefined;
  // The effect decides the *motion* and the frame decides the *colour*: the
  // catalog publishes two different vocabularies for the two slots.
  const mode = effect === undefined ? "none" : frameMotionFor(effect.appearance);
  const ring = wearingFrame ? FRAME_RING[appearanceOf(frame.appearance)] : FRAME_RING.neutral;

  return (
    <div
      className={cn(
        "flex items-center justify-center lg:items-start lg:justify-start",
        className,
      )}
    >
      <div className="relative">
        <AvatarFrame
          mode={mode}
          intensity={PROFILE_FRAME_INTENSITY}
          glow={wearingFrame}
          className={cn(RING_WIDTH, RING_GAP, ring)}
        >
          <Avatar size="xl" name={username} />
        </AvatarFrame>

        {/* The reference's ornaments, on the reference's plain ring only. */}
        {!wearingFrame && (
          <>
            <span
              aria-hidden="true"
              className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-emphasis border-text-secondary bg-bg"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-emphasis border-text-secondary bg-bg"
            />
          </>
        )}
      </div>
    </div>
  );
}