import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import { AttributeSection } from "./attribute-section";
import { CurrentQuestCard } from "./current-quest-card";
import { FeaturedProjectCard } from "./featured-project-card";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileIdentity } from "./profile-identity";
import { ProfileMenu } from "./profile-menu";
import { RecentAchievements } from "./recent-achievements";
import type { MockProfile } from "./profile-data";

export type ProfileScreenProps = {
  /** The single typed mock object from `profile-data.ts`. */
  profile: MockProfile;
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
export function ProfileScreen({ profile, className }: ProfileScreenProps) {
  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {/* Hero: identity, progression, menu and attributes. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_3fr] lg:gap-x-8">
        <ProfileAvatar
          username={profile.username}
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
      </div>

      {/* Featured Project (3) beside Current Quest (2) — the reference's
          60/40 split; a single column below `lg`. */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <FeaturedProjectCard project={profile.featuredProject} />
        <CurrentQuestCard quest={profile.currentQuest} />
      </div>

      <RecentAchievements
        achievements={profile.recentAchievements}
        moreCount={profile.additionalAchievements}
      />

      {/* The honest label the task asks for: this screen is static mock UI. */}
      <Text variant="caption" className="text-text-muted">
        Static demonstration profile — mock data only. No GitHub account,
        backend or scoring is connected.
      </Text>
    </div>
  );
}
