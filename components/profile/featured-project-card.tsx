import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import type { ProfileFeaturedProject } from "./profile-data";
import { FolderGlyph, StarGlyph } from "./profile-glyphs";

export type FeaturedProjectCardProps = {
  project: ProfileFeaturedProject;
  className?: string;
};

/** The stack mark beside a technology name: a chip for most, a ring for Next.js. */
function StackMark({ label }: { label: string }) {
  return label === "Next.js" ? (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-pill border border-text-muted"
    />
  ) : (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-xs border border-text-muted"
    />
  );
}

/**
 * Featured Project card from the approved reference (TASKS §2.1; PRD §5
 * "featured project").
 *
 * Notes:
 * - the reference shows rendered project artwork as the thumbnail. Generated or
 *   borrowed imagery is forbidden (PRD §14), so the thumbnail is a neutral
 *   surface tile with a geometric glyph — decorative, and therefore
 *   `aria-hidden` with the real information carried by the text beside it
 * - stack chips and the star count are mock display copy from the data object;
 *   no repository is fetched
 * - stacks above the text on mobile, sits beside it from `sm`
 */
export function FeaturedProjectCard({ project, className }: FeaturedProjectCardProps) {
  return (
    <Card
      as="section"
      aria-labelledby="featured-project-heading"
      className={cn("flex flex-col gap-4", className)}
    >
      <Text variant="heading" as="h2" id="featured-project-heading">
        Featured Project
      </Text>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
        <span
          aria-hidden="true"
          className="grid size-24 shrink-0 place-items-center rounded-md border border-border bg-surface-secondary lg:size-32"
        >
          <FolderGlyph className="size-8 text-text-muted lg:size-12" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Text variant="subheading" as="h3">
            {project.name}
          </Text>

          <Text variant="body" className="text-text-secondary">
            {project.description}
          </Text>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {project.stack.map((tech) => (
              <span
                key={tech}
                className="flex items-center gap-1 text-caption text-text-secondary"
              >
                <StackMark label={tech} />
                {tech}
              </span>
            ))}

            <span className="flex items-center gap-1 text-caption text-text-secondary">
              <StarGlyph className="size-3 shrink-0" />
              {project.starsLabel}
              <span className="sr-only">stars</span>
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
