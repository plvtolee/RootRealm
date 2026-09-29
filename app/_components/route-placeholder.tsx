import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";

export type RoutePlaceholderProps = {
  /** Screen name, rendered as the page's single `h1`. */
  title: string;
  /** One sentence of honest scaffolding copy. */
  note: string;
};

/**
 * The Task 1.5 navigation placeholder for a destination whose screen belongs
 * to Phase 2.
 *
 * The mobile navigation needs real routes: a dead link would make the active
 * state unverifiable and the reviewable state broken (TASKS §0: every task
 * ends in a reviewable working state). Each route therefore renders this
 * minimal header — the same pattern as the Task 1.4 home placeholder — and is
 * replaced wholesale by the Phase 2 screen for that destination
 * (TASKS §2.x). Nothing about the future screen is invented here.
 */
export function RoutePlaceholder({ title, note }: RoutePlaceholderProps) {
  return (
    <header className="flex flex-col items-start gap-3">
      <Badge variant="neutral">Phase 1</Badge>

      <Text variant="label" className="uppercase text-text-secondary">
        RootRealm
      </Text>

      <Text variant="display">{title}</Text>

      <Text variant="body" className="text-text-secondary">
        {note}
      </Text>
    </header>
  );
}