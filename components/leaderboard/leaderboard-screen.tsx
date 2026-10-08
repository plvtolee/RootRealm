"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

import { LEADERBOARD_ROWS, LEADERBOARD_SEASON } from "./leaderboard-data";

export function LeaderboardScreen() {
  const [optedIn, setOptedIn] = useState<Record<string, boolean>>(
    Object.fromEntries(LEADERBOARD_ROWS.map(({ id, optIn }) => [id, optIn])),
  );
  const [notice, setNotice] = useState<string | null>(null);

  function toggleOptIn(id: string, player: string) {
    const next = !optedIn[id];
    setOptedIn((previous) => ({ ...previous, [id]: next }));
    setNotice(`${player} ${next ? "opted in to" : "opted out of"} ${LEADERBOARD_SEASON.label}. (mock session state)`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Text variant="label" className="uppercase text-text-secondary">Ranked season</Text>
          <Text variant="heading" as="h1" className="text-text-primary">{LEADERBOARD_SEASON.label}</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{LEADERBOARD_SEASON.points}</Badge>
          <Badge variant="accent">{LEADERBOARD_SEASON.deadline}</Badge>
        </div>
      </div>

      <Card className="overflow-hidden border-border bg-surface-secondary">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <caption className="sr-only">Mock standings and participation for {LEADERBOARD_SEASON.label}</caption>
            <thead className="border-b border-border">
              <tr className="text-label text-text-secondary">
                <th scope="col" className="px-4 py-3 font-medium">Rank</th>
                <th scope="col" className="px-4 py-3 font-medium">Player</th>
                <th scope="col" className="px-4 py-3 font-medium">Score</th>
                <th scope="col" className="px-4 py-3 font-medium">Eligibility</th>
                <th scope="col" className="px-4 py-3 font-medium">Opt-in</th>
              </tr>
            </thead>
            <tbody>
              {LEADERBOARD_ROWS.map((row) => {
                const isOptedIn = optedIn[row.id];
                return (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-body font-normal text-text-primary">#{row.rank}</th>
                    <td className="px-4 py-3 text-body text-text-primary">{row.player}</td>
                    <td className="px-4 py-3 text-body text-text-secondary">{row.score.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={row.status === "Eligible" ? "success" : "warning"} size="sm">
                          {row.status}
                        </Badge>
                        <Text variant="caption" className="text-text-muted">{row.eligibilityDetail}</Text>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Button
                          variant={isOptedIn ? "secondary" : "primary"}
                          size="sm"
                          aria-pressed={isOptedIn}
                          onClick={() => toggleOptIn(row.id, row.player)}
                        >
                          {isOptedIn ? "Opted in" : "Opt in"}
                        </Button>
                        <Text variant="caption" className="text-text-muted">
                          {isOptedIn ? "Participating" : "Not participating"}
                        </Text>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div aria-live="polite" className="min-h-(--shop-notice-min-height)">
        {notice ? <Text variant="caption" className="text-text-secondary">{notice}</Text> : null}
      </div>
      <Text variant="caption" className="text-text-muted">
        Standings, scores, eligibility, and season details are sample presentation data. Ranks are not calculated.
      </Text>
    </div>
  );
}
