/**
 * The six RootRealm character attributes (DATA_CONTRACT §14 `AttributeType`,
 * PRD §6).
 *
 * The vocabulary is shared, so it lives in one place: the profile screen
 * summarises the six attribute values (TASKS §2.1) and the skill tree uses the
 * same six keys as node categories (TASKS §2.3, DATA_CONTRACT §16
 * `SkillNode.category`). Two screens cannot drift if they spell the attributes
 * from the same union and the same display names.
 *
 * Notes:
 * - the keys are exactly the contract's lowercase enum values; the labels are
 *   the display names the approved references use
 * - `profile-data.ts` re-exports the type, so its existing imports are
 *   unchanged
 * - no colour is attached to an attribute: the approved documents define no
 *   attribute → colour mapping, and no screen may invent one
 *   (DESIGN_SYSTEM §3, §33 — see components/profile/attribute-section.tsx)
 */
export type AttributeKey =
  | "builder"
  | "debugger"
  | "scholar"
  | "collaborator"
  | "maintainer"
  | "architect";

/**
 * Display name per attribute. Key order matches the approved references and
 * the DATA_CONTRACT enum order (builder → architect), so a list built from
 * this record is already in the documented order.
 */
export const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  builder: "Builder",
  debugger: "Debugger",
  scholar: "Scholar",
  collaborator: "Collaborator",
  maintainer: "Maintainer",
  architect: "Architect",
};
