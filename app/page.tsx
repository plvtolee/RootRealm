import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

/**
 * Home — the Task 1.4 shell placeholder.
 *
 * It is not product UI. It exists so the shell can be inspected at the
 * supported viewports (375 × 812, 390 × 844, tablet, desktop) and so the
 * container, the background and the page entrance are visible in a real route.
 * Phase 2 replaces this with the profile screen; no XP, no quests, no GitHub
 * data may be invented here.
 */
export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-start gap-3">
        <Badge variant="neutral">Phase 1</Badge>

        <Text variant="label" className="uppercase text-text-secondary">
          RootRealm
        </Text>

        <Text variant="display">Application shell</Text>

        <Text variant="body" className="text-text-secondary">
          An RPG-inspired developer identity and progression platform. The shell
          is in place; the screens that fill it arrive with Phase 2.
        </Text>
      </header>

      <Card className="flex flex-col gap-3">
        <Text variant="label" className="uppercase text-text-muted">
          What the shell provides
        </Text>

        <ul className="flex flex-col gap-2">
          <Text as="li" variant="body" className="text-text-secondary">
            Global background — near-black with one extremely subtle neutral
            wash; no accent, no glow.
          </Text>

          <Text as="li" variant="body" className="text-text-secondary">
            Content container — full width on the primary mobile targets, capped
            and centred from 768px up.
          </Text>

          <Text as="li" variant="body" className="text-text-secondary">
            Page entrance — a short fade, and a fade without movement when
            reduced motion is requested.
          </Text>

          <Text as="li" variant="body" className="text-text-secondary">
            Skip link — the first tab stop, so keyboard users reach content
            straight away (DESIGN_SYSTEM §31).
          </Text>

          <Text as="li" variant="body" className="text-text-secondary">
            Bottom navigation — Home, Skill Tree, Achievements, Shop and
            Profile, fixed below the content with the selected destination in
            accent; from 1024px up the same destinations move into the desktop
            header.
          </Text>
        </ul>
      </Card>

      {/*
        Development surfaces. These are review harnesses for code that is
        server-only and therefore invisible from the screens, so they are
        linked from here rather than from the primary navigation: `NAV_ITEMS`
        is the product information architecture (TASKS §1.5) and a dev route
        must never become one of its five destinations.
      */}
      <Card className="flex flex-col gap-3">
        <Text variant="label" className="uppercase text-text-muted">
          Development
        </Text>

        <ul className="flex flex-col gap-2">
          <Text as="li" variant="body">
            <DevLink href="/dev/github">
              GitHub ingestion preview — look up a public GitHub profile through
              the TASKS 4.1–4.2 server route.
            </DevLink>
          </Text>
        </ul>
      </Card>
    </div>
  );
}

/**
 * A development link, styled like any other body link. `Text` owns the type
 * role, so only the interaction treatment is applied here.
 */
function DevLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-accent underline underline-offset-4 transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}


