/**
 * RootRealm — adapting the server's aggregate to the profile screen (TASKS 8.1).
 *
 * ```text
 * AggregatedProfile → the shape ProfileScreen renders
 * ```
 *
 * ## Why an adapter rather than a prop-type change
 *
 * `ProfileScreen` was built in Phase 2 against `MockProfile`, a *presentation*
 * shape: a headline string, a location with a fallback, "xpToNextLevel", and
 * achievements trimmed to four. `AggregatedProfile` is the *domain* shape the
 * server computed: character totals, attribute units, a full achievement view,
 * a repository that may be null.
 *
 * Changing the screen's props to take the domain shape would push three
 * presentation decisions into it — what to show when `featuredRepository` is null,
 * how to phrase a headline, which four achievements to list — and those decisions
 * belong in one place. This is that place, and it means the screen itself does
 * not change at all.
 *
 * ## Why the fallbacks are honest
 *
 * Every absent field becomes a stated absence rather than an invented value. A
 * profile with no location shows "Location not provided", not a placeholder city,
 * and no featured repository renders as no project rather than a card with an
 * empty name. A number the domain does not have is zero, which is what a sum
 * over no rows is — not a mock.
 */
import type { AttributeKey } from "@/lib/attributes";
import { ATTRIBUTE_LABEL } from "@/lib/attributes";
import type { AggregatedProfile } from "@/lib/profile/aggregate";

import type {
  MockProfile,
  ProfileAchievement,
  ProfileAttribute,
  ProfileFeaturedProject,
  ProfileQuest,
} from "@/components/profile/profile-data";

/** The screen lists four achievements and counts the rest (TASKS 2.1's design). */
const RECENT_ACHIEVEMENT_LIMIT = 4;

/** What to show when GitHub reported no location. */
const NO_LOCATION = "Location not provided";

/** What to show when a developer has earned no character title. */
const NO_TITLE = "Unawakened";

/** The six attributes, in the contract order the screen lays out. */
const ATTRIBUTE_ORDER: readonly AttributeKey[] = [
  "builder",
  "debugger",
  "scholar",
  "collaborator",
  "maintainer",
  "architect",
];

/** A star count as the screen displays it, e.g. `1.2k`. */
function starsLabel(stars: number | null): string {
  if (stars === null || stars <= 0) return "No stars yet";
  if (stars < 1000) return `${stars} stars`;
  return `${(stars / 1000).toFixed(1)}k stars`;
}

/** The attribute list, in contract order, from the units the engine awarded. */
function toAttributes(units: AggregatedProfile["attributes"]): ProfileAttribute[] {
  return ATTRIBUTE_ORDER.map((key) => ({
    attribute: key,
    label: ATTRIBUTE_LABEL[key],
    value: units[key] ?? 0,
  }));
}

/**
 * The featured project.
 *
 * `featuredRepository` is null until ingestion actually observed one, so this
 * keeps a stable shape the screen can render as an empty block, rather than
 * inventing a repository to fill a card.
 */
function toFeaturedProject(profile: AggregatedProfile): ProfileFeaturedProject {
  const repository = profile.featuredRepository;

  return {
    name: repository?.fullName ?? "No featured project",
    description: repository?.description ?? "Nothing has been observed yet.",
    // Only a repository's actual primary language is a technology chip. Listing
    // anything else would be the app claiming a stack it never observed.
    stack: repository?.primaryLanguage === null || repository?.primaryLanguage === undefined
      ? []
      : [repository.primaryLanguage],
    starsLabel: starsLabel(repository?.stars ?? null),
  };
}

/** The current quest. Quest progression is not persisted yet, so nothing is claimed. */
function toCurrentQuest(): ProfileQuest {
  return {
    title: "No active quest",
    description: "Quests begin once progression is recorded.",
    progress: 0,
    target: 0,
    rewardCoins: 0,
  };
}

/**
 * Turns the server's aggregate into the screen's presentation shape.
 *
 * `github` supplies the identity fields the aggregate deliberately does not keep
 * (a login is on the aggregate, but a display name, location and avatar are not),
 * and `featuredRepository` is already carried by the aggregate.
 */
export function toProfileScreenProps(
  profile: AggregatedProfile,
  identity: { readonly verified: boolean },
): MockProfile {
  const character = profile.character;
  const earned = profile.achievements.achievements.filter(
    (achievement: { earned: boolean }) => achievement.earned,
  );

  const recent: ProfileAchievement[] = earned
    .slice(0, RECENT_ACHIEVEMENT_LIMIT)
    .map((achievement) => ({
      // The catalog's own title, not the id: this is display copy the screen
      // renders verbatim, and an id would read as a bug to anyone looking at it.
      name: achievement.definition.title,
      rarity: achievement.definition.rarity,
    }));

  return {
    username: character.login,
    verified: identity.verified,
    // The developer's own GitHub bio is the one line they chose to write about
    // themselves, which makes it a better headline than one composed for them.
    headline: character.bio?.trim() || "Developer",
    location: character.location?.trim() || NO_LOCATION,
    title: NO_TITLE,
    level: profile.progression.level.level,
    xpCurrent: profile.progression.totalXp,
    // The level's own curve is what "next level" means; the screen needs an
    // absolute target, so the remaining units are added to what is already held.
    // Null when the developer has reached the curve's top, which the screen
    // renders as a full bar rather than as an impossible target.
    xpToNextLevel:
      profile.progression.level.xpForNext === null
        ? profile.progression.totalXp
        : profile.progression.level.xpIntoLevel + profile.progression.level.xpForNext,
    attributes: toAttributes(profile.attributes),
    featuredProject: toFeaturedProject(profile),
    currentQuest: toCurrentQuest(),
    recentAchievements: recent,
    additionalAchievements: Math.max(0, earned.length - RECENT_ACHIEVEMENT_LIMIT),
  };
}