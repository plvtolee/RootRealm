import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  formatUpdateDate,
  isUpdateCategory,
  UPDATE_CATEGORIES,
  updatesForCategory,
  type PublishedUpdate,
  type UpdateCategory,
} from "@/lib/updates/content";

export const metadata: Metadata = {
  title: "Home",
  description: "The latest seasons, cosmetics, patch notes and announcements from RootRealm.",
};

/**
 * Home is the in-product updates hub, not a marketing landing page.
 *
 * Content is repo-managed in `lib/updates/content.ts` until RootRealm has an
 * editorial workflow. Authentication is enforced by the protected app layout,
 * so this screen never performs a session or GitHub lookup.
 */
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<UpdateCategory, string> = {
  all: "All",
  seasons: "Seasons",
  cosmetics: "Cosmetics",
  "patch-notes": "Patch notes",
  announcements: "Announcements",
};

const HOME_REVEAL = "opacity-0 animate-page-enter";

function revealStyle(step: number): CSSProperties {
  return {
    animationDelay: `calc(var(--motion-fast) * ${step})`,
    animationFillMode: "both",
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const query = await searchParams;
  const category = isUpdateCategory(query.category) ? query.category : "all";
  const updates = updatesForCategory(category);
  const feedUpdates = category === "all" ? updates.slice(1) : updates;
  return (
    <div className="flex flex-col gap-8">
      <header className={`flex flex-col gap-3 ${HOME_REVEAL}`} style={revealStyle(0)}>
        <Text as="h1" variant="heading" className="text-text-primary">
          Home
        </Text>
        <Text variant="body" className="max-w-prose text-text-secondary">
          The latest from RootRealm.
        </Text>
      </header>

      {category === "all" && updates.length > 0 ? (
        <FeaturedUpdate update={updates[0]} />
      ) : null}

      <section aria-labelledby="latest-updates" className="flex flex-col gap-4">
        <div className={`flex flex-col gap-1 ${HOME_REVEAL}`} style={revealStyle(2)}>
          <Text as="h2" variant="heading" id="latest-updates" className="text-text-primary">
            Latest updates
          </Text>
          <Text variant="body" className="text-text-secondary">
            Published notes, releases and announcements, newest first.
          </Text>
        </div>

        <nav
          aria-label="Filter updates"
          className={`flex flex-wrap gap-2 ${HOME_REVEAL}`}
          style={revealStyle(3)}
        >
          {UPDATE_CATEGORIES.map((option) => (
            <Link
              key={option}
              href={option === "all" ? "/home" : `/home?category=${option}`}
              aria-current={category === option ? "page" : undefined}
              className={
                category === option
                  ? "inline-flex min-h-(--control-height-md) items-center rounded-md border border-text-primary bg-text-primary px-3 text-label text-bg transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none lg:min-h-(--control-height-sm)"
                  : "inline-flex min-h-(--control-height-md) items-center rounded-md border border-border bg-surface px-3 text-label text-text-secondary transition-colors duration-(--motion-fast) ease-standard hover:border-border-strong hover:text-text-primary motion-reduce:transition-none lg:min-h-(--control-height-sm)"
              }
            >
              {CATEGORY_LABELS[option]}
            </Link>
          ))}
        </nav>

        {feedUpdates.length === 0 ? (
          <Card variant="secondary" padding="lg">
            <Text as="h3" variant="subheading" className="text-text-primary">
              Nothing published here yet
            </Text>
            <Text variant="body" className="mt-2 text-text-secondary">
              New {CATEGORY_LABELS[category].toLowerCase()} will appear here when they are ready.
            </Text>
          </Card>
        ) : (
          <div key={category} className="flex flex-col gap-3">
            {feedUpdates.map((update, index) => (
              <UpdateCard key={update.slug} update={update} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FeaturedUpdate({ update }: { update: PublishedUpdate }) {
  return (
    <section
      aria-labelledby="featured-update"
      className={`flex flex-col gap-3 ${HOME_REVEAL}`}
      style={revealStyle(1)}
    >
      <Text variant="label" className="uppercase text-text-muted">
        Featured update
      </Text>
      <Link href={`/updates/${update.slug}`} className="group block">
        <Card variant="secondary" padding="lg" className="flex flex-col gap-4 transition-colors duration-(--motion-fast) ease-standard hover:border-border-strong motion-reduce:transition-none">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">{update.label}</Badge>
            <Text variant="caption" className="text-text-muted">
              {formatUpdateDate(update.publishedAt)}
            </Text>
          </div>
          <div className="flex flex-col gap-2">
            <Text as="h2" variant="heading" id="featured-update" className="text-text-primary">
              {update.title}
            </Text>
            <Text variant="body" className="max-w-prose text-text-secondary">
              {update.summary}
            </Text>
          </div>
          <Text variant="label" className="text-accent">
            Read update{" "}
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-(--motion-fast) ease-standard group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
            >
              →
            </span>
          </Text>
        </Card>
      </Link>
    </section>
  );
}

function UpdateCard({ update, index }: { update: PublishedUpdate; index: number }) {
  return (
    <Link
      href={`/updates/${update.slug}`}
      className={`group block ${HOME_REVEAL}`}
      style={revealStyle(Math.min(index + 4, 7))}
    >
      <Card padding="md" className="flex flex-col gap-3 transition-colors duration-(--motion-fast) ease-standard hover:border-border-strong hover:bg-surface-secondary motion-reduce:transition-none">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{update.label}</Badge>
          <Text variant="caption" className="text-text-muted">
            {formatUpdateDate(update.publishedAt)}
          </Text>
        </div>
        <Text as="h3" variant="subheading" className="text-text-primary">
          {update.title}
        </Text>
        <Text variant="body" className="text-text-secondary">
          {update.summary}
        </Text>
        <Text variant="label" className="text-accent">
          Read more{" "}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-(--motion-fast) ease-standard group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
          >
            →
          </span>
        </Text>
      </Card>
    </Link>
  );
}
