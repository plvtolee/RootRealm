import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Card } from "@/components/ui/card";
import { LeaderboardScreen } from "@/components/leaderboard/leaderboard-screen";
import { Text } from "@/components/ui/text";
import { currentSeason, leaderboardStateFor, userIdFromCookieHeader } from "@/lib/seasons/service";

export const metadata: Metadata = {
  title: "Leaderboard",
};

/**
 * The leaderboard reads the season on the server (TASKS 16.6).
 *
 * A server page because the published rules and the viewer's own eligibility are
 * the server's answer. The client posts one consent change and re-renders; it
 * never decides what the season is or whether the viewer qualifies.
 */
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const at = new Date();

  // No season means no ladder, and the screen says so rather than showing the
  // previous season's results as if they were current.
  if (currentSeason(at) === null) {
    return (
      <div className="flex flex-col gap-6">
        <Text variant="heading" as="h1">
          Leaderboard
        </Text>
        <Card className="border-border bg-surface-secondary p-6">
          <Text variant="subheading" as="h2" className="text-text-primary">
            No season is running
          </Text>
          <Text variant="body" className="mt-2 text-text-secondary">
            There is a gap between seasons right now. Nobody is ranked, and the
            next season&apos;s rules are published when it opens.
          </Text>
        </Card>
      </div>
    );
  }

  const cookieStore = await cookies();
  const viewerLogin = userIdFromCookieHeader(cookieStore.toString());

  return (
    <LeaderboardScreen
      view={(await leaderboardStateFor({ at, viewerLogin }))!}
      canOptIn={viewerLogin !== null}
    />
  );
}