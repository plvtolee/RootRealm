import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

import { LEADERBOARD_ROWS, LEADERBOARD_SEASON } from "./leaderboard-data";

export function LeaderboardScreen() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Text variant="label" className="uppercase text-text-secondary">
            Ranked season
          </Text>
          <Text variant="heading" as="h1" className="text-text-primary">
            {LEADERBOARD_SEASON.label}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{LEADERBOARD_SEASON.points}</Badge>
          <Badge variant="accent">{LEADERBOARD_SEASON.deadline}</Badge>
        </div>
      </div>

      <Card className="border-border bg-surface-secondary overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-border">
              <tr className="text-label text-text-secondary">
                <th className="px-4 py-3 font-medium">Rank</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Eligibility</th>
                <th className="px-4 py-3 font-medium">Opt-in</th>
              </tr>
            </thead>
            <tbody>
              {LEADERBOARD_ROWS.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-body text-text-primary">#{row.rank}</td>
                  <td className="px-4 py-3 text-body text-text-primary">{row.player}</td>
                  <td className="px-4 py-3 text-body text-text-secondary">{row.score.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        row.status === "Eligible"
                          ? "success"
                          : row.status === "Pending"
                            ? "warning"
                            : "neutral"
                      }
                      size="sm"
                    >
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant={row.optIn ? "secondary" : "primary"} size="sm">
                      {row.optIn ? "Opted in" : "Opt in"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
