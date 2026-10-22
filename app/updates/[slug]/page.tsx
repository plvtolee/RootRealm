import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { formatUpdateDate, getPublishedUpdate, PUBLISHED_UPDATES } from "@/lib/updates/content";

export const dynamic = "force-dynamic";

const UPDATE_REVEAL = "opacity-0 animate-page-enter";

function revealStyle(step: number): CSSProperties {
  return {
    animationDelay: `calc(var(--motion-fast) * ${step})`,
    animationFillMode: "both",
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const update = getPublishedUpdate(slug);

  return update === null
    ? { title: "Update not found" }
    : { title: update.title, description: update.summary };
}

export function generateStaticParams() {
  return PUBLISHED_UPDATES.map((update) => ({ slug: update.slug }));
}

export default async function UpdatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const update = getPublishedUpdate(slug);

  if (update === null) notFound();

  return (
    <article key={update.slug} className="flex flex-col gap-6">
      <Link
        href="/"
        className={`group inline-flex min-h-(--control-height-md) w-fit items-center text-label text-accent underline underline-offset-4 transition-opacity duration-(--motion-fast) ease-standard hover:opacity-80 motion-reduce:transition-none ${UPDATE_REVEAL}`}
        style={revealStyle(0)}
      >
        <span
          aria-hidden="true"
          className="mr-1 inline-block transition-transform duration-(--motion-fast) ease-standard group-hover:-translate-x-1 group-focus-visible:-translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
        >
          ←
        </span>
        Back to Home
      </Link>

      <header
        className={`flex flex-col gap-4 ${UPDATE_REVEAL}`}
        style={revealStyle(1)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{update.label}</Badge>
          <Text variant="caption" className="text-text-muted">
            {formatUpdateDate(update.publishedAt)}
          </Text>
        </div>
        <Text as="h1" variant="display" className="max-w-prose text-text-primary">
          {update.title}
        </Text>
        <Text variant="body" className="max-w-prose text-text-secondary">
          {update.summary}
        </Text>
      </header>

      <Card
        padding="lg"
        className={`flex max-w-prose flex-col gap-5 ${UPDATE_REVEAL}`}
        style={revealStyle(2)}
      >
        {update.paragraphs.map((paragraph) => (
          <Text key={paragraph} variant="body" className="text-text-secondary">
            {paragraph}
          </Text>
        ))}
      </Card>

      {update.actionHref && update.actionLabel ? (
        <Link
          href={update.actionHref}
          className={`group inline-flex min-h-(--control-height-md) w-fit items-center justify-center rounded-md border border-text-primary bg-text-primary px-4 text-label text-bg transition-colors duration-(--motion-fast) ease-standard hover:border-text-secondary hover:bg-text-secondary motion-reduce:transition-none ${UPDATE_REVEAL}`}
          style={revealStyle(3)}
        >
          {update.actionLabel}
          <span
            aria-hidden="true"
            className="ml-2 inline-block transition-transform duration-(--motion-fast) ease-standard group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
          >
            →
          </span>
        </Link>
      ) : null}
    </article>
  );
}
