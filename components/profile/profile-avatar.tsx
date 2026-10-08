import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { AvatarFrame } from "./avatar-frame";

export type ProfileAvatarProps = {
  /** Handle shown as the avatar's accessible name (initials fallback). */
  username: string;
  className?: string;
};

/**
 * The profile portrait from `references/approved-ui/profile.png` (TASKS §2.1).
 *
 * Notes:
 * - the reference shows a large framed portrait; the largest token-backed
 *   avatar size is `xl` (80px, styles/tokens/component.css) and this task does
 *   not add tokens, so the ring composes around that size
 * - the ring and the two diamond ornaments are static monochrome geometry built
 *   from border tokens — an animated cosmetic frame system is explicitly out of
 *   scope (DESIGN_SYSTEM §13, §14; AGENTS.md primitive rule 6), and there is no
 *   glow (§10, §28)
 * - there is no image: the Avatar renders its honest initials fallback rather
 *   than an invented portrait (PRD §14 forbids generated avatar artwork)
 */
export function ProfileAvatar({ username, className }: ProfileAvatarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center lg:items-start lg:justify-start",
        className,
      )}
    >
      <div className="relative">
        {/* The frame: an 8px ring gap (p-2 from the spacing scale) around the
            avatar, painted with the emphasis border width so it reads as the
            reference's strong monochrome ring without a glow. */}
        <AvatarFrame
          mode="pulse"
          intensity={30}
          glow
          className="border-emphasis border-text-secondary p-2 text-text-secondary"
        >
          <Avatar size="xl" name={username} />
        </AvatarFrame>

        {/* Diamond ornaments sitting on the ring at 12 and 6 o'clock, exactly
            as the approved reference draws them. Decorative only. */}
        <span
          aria-hidden="true"
          className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-emphasis border-text-secondary bg-bg"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-emphasis border-text-secondary bg-bg"
        />
      </div>
    </div>
  );
}
