import { Card } from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

import type { ProfileAttribute } from "./profile-data";
import { ATTRIBUTE_GLYPH } from "./profile-glyphs";

export type AttributeSectionProps = {
  attributes: readonly ProfileAttribute[];
  className?: string;
};

/**
 * The six attribute summaries (TASKS §2.1, DESIGN_SYSTEM §15, DATA_CONTRACT
 * §14) — the 3-column block of the approved reference, reorganised for small
 * screens: two columns on mobile, three from `lg` (DESIGN_SYSTEM §29).
 *
 * Notes:
 * - tiles are monochrome: the approved documents define no attribute → colour
 *   mapping, and this task must not invent one — the reference's tinted icons
 *   are therefore rendered as neutral glyph tiles (DESIGN_SYSTEM §3, §33)
 * - values are static mock numbers; nothing here derives or scores anything
 * - the section heading is visually hidden because the reference shows no
 *   visible label above the grid, but the region still needs a name (§31)
 */
export function AttributeSection({ attributes, className }: AttributeSectionProps) {
  return (
    <section
      aria-labelledby="attributes-heading"
      className={cn("flex flex-col", className)}
    >
      <Divider className="mb-6" />

      <Text variant="heading" as="h2" id="attributes-heading" className="sr-only">
        Attributes
      </Text>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {attributes.map((attribute) => {
          const AttributeGlyph = ATTRIBUTE_GLYPH[attribute.attribute];

          return (
            <Card key={attribute.attribute} padding="none" className="h-full">
              <div className="flex h-full items-center gap-3 p-3 lg:p-4">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-secondary lg:size-12"
                >
                  <AttributeGlyph className="size-4 text-text-secondary lg:size-6" />
                </span>

                <div className="flex min-w-0 flex-col">
                  <Text
                    variant="caption"
                    as="p"
                    className="text-text-secondary"
                  >
                    {attribute.label}
                  </Text>
                  <Text variant="heading" as="p">
                    {attribute.value}
                  </Text>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
