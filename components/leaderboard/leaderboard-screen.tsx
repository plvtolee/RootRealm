"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import {
  
  type LeaderboardViewState,
} from "@/lib/seasons/view";

export type LeaderboardScreenProps = {
  /** The season's published state, read on the server (TASKS 16.6). */
  readonly view: LeaderboardViewState;
  /** Whether the viewer may change their own opt-in from here. */
  readonly canOptIn?: boolean;
  readonly className?: string;
};

/**
 * The leaderboard screen (TASKS 16.6).
 *
 * ## What changed from the prototype
 *
 * The prototype listed six invented developers with invented scores and an
 * "opt-in" button that toggled a local map — including buttons that changed *other
 * players'* participation, which is not a thing a developer may do to anyone else.
 * Now:
 *
 * - the season is a real window with real published rules (16.1, 16.4);
 * - the ladder holds real standings, and can be legitimately empty;
 * - the one opt-in control is the viewer's own, and it posts to the server.
 *
 * ## Why the rules sit above the ladder
 *
 * SCORING.md §30 requires a transparent ladder. A score with no visible rule is
 * not transparent, so the points table, the evidence minimum, opt-in and the
 * anti-farming safeguards are rendered first — to everyone, including developers
 * who are not on the board.
 */
export function LeaderboardScreen({ view, canOptIn = false, className }: LeaderboardScreenProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const { season, ladder, viewer } = view;
  const participating = viewer?.participation.participating ?? false;

  /** Posts the viewer's own consent, then lets the server re-read the season. */
  function setOptIn(next: boolean): void {
    setNotice(null);
    void (async () => {
      const response = await fetch("/api/seasons/opt-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participating: next }),
      });

      startTransition(() => {
        router.refresh();
        setNotice(
          response.ok
            ? next
              ? `You are ranked in ${season.name}.`
              : `You have left ${season.name}'s ladder.`
            : "Only a signed-in developer can change their own participation.",
        );
      });
    })();
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Text variant="label" className="uppercase text-text-secondary">
            Ranked season
          </Text>
          <Text variant="heading" as="h1" className="text-text-primary">
            {season.name}
          </Text>
        </div>
        {/* TASKS 22.1: the season's point breakdown used to be a Badge here as
            well. Two problems, one fix. A Badge is a status chip and it does not
            wrap, so a five-clause "10 per merge · 5 per release · …" string ran
            414px wide and pushed off a 375px screen; and the "How this season is
            scored" card directly below already lists every kind as its own line,
            so the header was saying it twice, once badly.

            Only the window label stays: "Ends in 46 days" is short, is genuinely a
            status, and is not repeated elsewhere. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{view.windowLabel}</Badge>
        </div>
      </header>

      <Card className="border-border bg-surface-secondary p-4">
        <Text variant="subheading" as="h2" className="text-text-primary">
          How this season is scored
        </Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          To be ranked you need {view.rules.minimumEvidence}, and{" "}
          {view.rules.requiresOptIn ? "you must opt in" : "opt-in is not required"}.
          Rank points are separate from XP: they exist only inside this season.
        </Text>

        <Divider className="my-4" />

        <Text variant="label" className="text-text-secondary">
          Points
        </Text>
        <ul className="mt-2 space-y-1">
          {view.rules.points.map((row) => (
            <li key={row.kind} className="text-body text-text-secondary">
              {row.points} · {KIND_LABEL[row.kind] ?? row.kind}
            </li>
          ))}
        </ul>

        <Text variant="label" className="mt-4 text-text-secondary">
          Anti-farming safeguards
        </Text>
        <ul className="mt-2 space-y-1">
          {view.safeguards.statements.map((statement) => (
            <li key={statement} className="text-caption text-text-muted">
              {statement}
            </li>
          ))}
        </ul>
      </Card>

      {viewer === null ? (
        <Card className="border-border bg-surface-secondary p-4">
          <Text variant="body" className="text-text-secondary">
            Your standing will appear here once your account has enough eligible
            evidence for this season. Participation remains opt-in.
          </Text>
        </Card>
      ) : (
        <Card className="border-border bg-surface-secondary p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text variant="subheading" as="h2" className="text-text-primary">
              Your standing
            </Text>
            {canOptIn ? (
              <Button
                variant={participating ? "secondary" : "primary"}
                size="sm"
                loading={pending}
                aria-pressed={participating}
                onClick={() => setOptIn(!participating)}
              >
                {participating ? "Leave this season" : "Join this season"}
              </Button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {viewer.eligibility.eligible ? (
              <>
                <Badge variant="success" size="sm">
                  Eligible
                </Badge>
                <Text variant="caption" className="text-text-secondary">
                  {viewer.standing?.rankPoints.toLocaleString()} rank points from{" "}
                  {viewer.eventsInSeason} events in this season.
                </Text>
              </>
            ) : (
              <>
                <Badge variant="warning" size="sm">
                  Not ranked
                </Badge>
                <Text variant="caption" className="text-text-secondary">
                  {viewer.eligibility.ineligibility.detail}
                </Text>
              </>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-border bg-surface-secondary">
        {ladder.length === 0 ? (
          <div className="p-6">
            <Text variant="subheading" as="h2" className="text-text-primary">
              No standings published yet
            </Text>
            <Text variant="body" className="mt-2 text-text-secondary">
              {participating
                ? "Your standing is not on this ladder yet. It appears once a standing is computed for the season."
                : "Nobody has opted in to this season's ladder. Opt in above to be ranked."}
            </Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <caption className="sr-only">
                Published standings for {season.name}, best first
              </caption>
              <thead className="border-b border-border">
                <tr className="text-label text-text-secondary">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Developer
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Rank points
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Counted activity
                  </th>
                </tr>
              </thead>
              <tbody>
                {ladder.map((row) => (
                  <tr key={row.developerLogin} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-body font-normal text-text-primary">
                      #{row.rank}
                    </th>
                    <td className="px-4 py-3 text-body text-text-primary">{row.developerLogin}</td>
                    <td className="px-4 py-3 text-body text-text-secondary">
                      {row.rankPoints.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-caption text-text-muted">
                      {Object.entries(row.breakdown)
                        .map(([kind, count]) => `${count} ${KIND_LABEL[kind] ?? kind}`)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div aria-live="polite" className="min-h-(--shop-notice-min-height)">
        {notice ? (
          <Text variant="caption" className="text-text-secondary">
            {notice}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

const KIND_LABEL: Readonly<Record<string, string>> = {
  merged_pull_requests: "merges",
  published_releases: "releases",
  completed_reviews: "reviews",
  qualifying_documentation: "docs",
};
