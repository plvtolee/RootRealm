import { Text } from "@/components/ui/text";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/cn";

import { AttributeSection } from "./attribute-section";
import { CurrentQuestCard } from "./current-quest-card";
import { FeaturedProjectCard } from "./featured-project-card";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileIdentity } from "./profile-identity";
import { ProfileMenu } from "./profile-menu";
import { DeleteAccount } from "./delete-account";
import { LogoutButton } from "./logout-button";
import { RecentAchievements } from "./recent-achievements";
import type { MockProfile } from "./profile-data";

export type ProfileScreenProps = {
  /** The single typed mock object from `profile-data.ts`. */
  profile: MockProfile;
  /**
   * The equipped frame item's id.
   *
   * Passed rather than looked up so the screen stays presentational and the
   * *worn* cosmetics come from the same wallet the shop spends from — which is
   * what stopped the frame here from disagreeing with the one in
   * `/customization`.
   */
  frameId?: string | null;
  /** The equipped effect item's id, which decides the frame's motion. */
  effectId?: string | null;
  /**
   * Whether to offer account deletion (TASKS 22.5).
   *
   * True only for a signed-in developer: this screen is always the viewer's own
   * character, and the control deletes the account the session belongs to.
   */
  showDelete?: boolean;
  className?: string;
};

/**
 * The static RootRealm profile screen (TASKS §2.1).
 *
 * ```tsx
 * // app/profile/page.tsx
 * <ProfileScreen profile={MOCK_PROFILE} />
 * ```
 *
 * Structure follows `references/approved-ui/profile.png` and DESIGN_SYSTEM §15:
 * - desktop (`lg`+): a two-column hero — framed avatar and the profile menu on
 *   the left, identity + Level/XP + the six attributes on the right — then the
 *   full-width Featured Project / Current Quest row, then Recent Achievements
 *   (DESIGN_SYSTEM §29 explicitly allows multi-column profile layouts at
 *   desktop widths without changing the hierarchy)
 * - mobile: everything stacks in one column in the §15 order — avatar,
 *   identity/level, menu, attributes, project, quest, achievements — so the
 *   primary targets (375 / 390) read top-to-bottom with no horizontal scroll
 * - the grid uses explicit `lg:` placement so the DOM order (which is the
 *   mobile reading order) never has to be rearranged with `order` utilities
 *
 * The screen renders data only: no fetching, no scoring, no state.
 */
export function ProfileScreen({ profile, frameId, effectId, showDelete = false, className }: ProfileScreenProps) {
  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {/* Hero: identity, progression, menu and attributes. */}
      <Reveal className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_3fr] lg:gap-x-8">
        <ProfileAvatar
          username={profile.username}
          frameId={frameId}
          effectId={effectId}
          className="lg:col-start-1 lg:row-start-1"
        />
        <ProfileIdentity
          profile={profile}
          className="min-w-0 lg:col-start-2 lg:row-start-1"
        />
        <ProfileMenu className="lg:col-start-1 lg:row-start-2" />
        <AttributeSection
          attributes={profile.attributes}
          className="min-w-0 lg:col-start-2 lg:row-start-2"
        />
      </Reveal>

      {/* Featured Project (3) beside Current Quest (2) — the reference's
          60/40 split; a single column below `lg`. */}
      <Reveal className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <FeaturedProjectCard project={profile.featuredProject} />
        <CurrentQuestCard quest={profile.currentQuest} />
      </Reveal>

      <Reveal>
        <RecentAchievements
          achievements={profile.recentAchievements}
          moreCount={profile.additionalAchievements}
        />
      </Reveal>


      {/* TASKS 22.5: account deletion lives on the profile because that is the only
          screen unambiguously about one account. False for a guest, who has nothing
          to delete. */}
      {showDelete ? (
        <Reveal>
          <DeleteAccount login={profile.username} />
        </Reveal>
      ) : null}

      {showDelete ? (
        <Reveal>
          <section aria-labelledby="account-actions" className="flex flex-col gap-3">
            <Text as="h2" variant="subheading" id="account-actions" className="text-text-primary">
              Account
            </Text>
            <LogoutButton />
          </section>
        </Reveal>
      ) : null}

      <Text variant="caption" className="text-text-muted">
        Character built from your public GitHub activity. XP is recomputed from that
        activity on each visit, and has not been stored yet.
      </Text>
    </div>
  );
}
