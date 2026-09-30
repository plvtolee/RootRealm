import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import { PinGlyph, TagGlyph, VerifiedGlyph } from "./profile-glyphs";
import type { MockProfile } from "./profile-data";

export type ProfileIdentityProps = {
  profile: Pick<
    MockProfile,
    | "username"
    | "verified"
    | "headline"
    | "location"
    | "title"
    | "level"
    | "xpCurrent"
    | "xpToNextLevel"
  >;
  className?: string;
};

/**
 * Identity and progression block (TASKS §2.1, DESIGN_SYSTEM §15: name → title →
 * Level/XP; `references/approved-ui/profile.png`).
 *
 * Notes:
 * - the page's single `h1` is the developer name; the level row and the XP bar
 *   sit under it as one labelled `progressbar` — the visible "Lv. 42" and
 *   "3,240 / 5,000 XP" texts are its accessible name (composing the label row is
 *   the pattern `ProgressBar` documents for richer value text)
 * - XP numbers are display data from the mock object: they are formatted, never
 *   calculated (DATA_CONTRACT §13: presentation does not compute XP)
 * - "Edit Profile" is the approved reference's action. It is a real `<button>`
 *   but deliberately has no handler: editing does not exist until a later task,
 *   and inventing an edit flow here is out of scope
 */
export function ProfileIdentity({ profile, className }: ProfileIdentityProps) {
  const levelId = "profile-level";
  const xpId = "profile-xp";

  return (
    <section
      aria-labelledby="profile-name"
      className={cn("flex flex-col gap-4", className)}
    >
      {/* Name block with the action on the right; the button settles onto the
          bottom of the row (next to the title pill), as in the reference. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="display" as="h1" id="profile-name">
              {profile.username}
            </Text>

            {profile.verified ? (
              <span className="flex items-center text-accent">
                <VerifiedGlyph className="size-6" />
                <span className="sr-only">Verified account</span>
              </span>
            ) : null}
          </div>

          <Text variant="body" className="text-text-secondary">
            {profile.headline}
          </Text>

          <Text
            variant="caption"
            as="p"
            className="flex items-center gap-2 text-text-secondary"
          >
            <PinGlyph className="size-4 shrink-0" />
            {profile.location}
          </Text>

          <div>
            <Badge variant="default" shape="pill">
              <TagGlyph />
              {profile.title}
            </Badge>
          </div>
        </div>

        <Button variant="secondary">Edit Profile</Button>
      </div>

      {/* Level / XP: visible row plus the accessible progress indicator. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Text variant="heading" as="p" id={levelId}>
            Lv. {profile.level}
          </Text>
          <Text variant="body" className="text-text-secondary" id={xpId}>
            {profile.xpCurrent.toLocaleString("en-US")} /{" "}
            {profile.xpToNextLevel.toLocaleString("en-US")} XP
          </Text>
        </div>

        <ProgressBar
          value={profile.xpCurrent}
          max={profile.xpToNextLevel}
          aria-labelledby={`${levelId} ${xpId}`}
        />
      </div>
    </section>
  );
}
