"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Text } from "@/components/ui/text";
import { QuestsScreen } from "@/components/quests/quests-screen";
import { useProfile } from "@/components/profile/profile-store";
import { useSessionLogin } from "@/components/auth/session-provider";

/** Loads quest state for the session while evidence comes from the shared profile snapshot. */
export default function QuestsGate() {
  const session = useSessionLogin();

  if (session.status !== "ready" || session.userId === null) return <Text as="p" variant="body" className="text-text-secondary">Reading your activity from GitHub…</Text>;

  return <QuestsForLogin userId={session.userId} />;
}

function QuestsForLogin({ userId }: { userId: string }) {
  const profile = useProfile();
  const router = useRouter();
  const [completedKeys, setCompletedKeys] = useState<readonly string[]>([]);
  const [stateReady, setStateReady] = useState(false);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  async function refreshCompletions(): Promise<void> {
    const response = await fetch("/api/quests", { headers: { accept: "application/json" } });
    const body = (await response.json().catch(() => null)) as { completedKeys?: string[] } | null;
    if (!response.ok) throw new Error("Your quest state could not be loaded.");
    setCompletedKeys(body?.completedKeys ?? []);
    setStateReady(true);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/quests", { headers: { accept: "application/json" } })
      .then((response) => response.json().catch(() => null).then((body) => ({ response, body })))
      .then(({ response, body }: { response: Response; body: { completedKeys?: string[] } | null }) => {
        if (cancelled) return;
        if (!response.ok) throw new Error("Your quest state could not be loaded.");
        setCompletedKeys(body?.completedKeys ?? []);
        setStateReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setClaimError(error instanceof Error ? error.message : "Your quest state could not be loaded.");
          setStateReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (profile.status !== "ready" || profile.snapshot === null || !stateReady) {
    return <Text as="p" variant="body" className="text-text-secondary">Reading your activity from GitHub…</Text>;
  }

  async function claim(questId: string): Promise<void> {
    setClaimingQuestId(questId);
    setClaimError(null);

    try {
      const response = await fetch("/api/quests/claim", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ questId }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "That quest could not be claimed.");

      await refreshCompletions();
      router.refresh();
    } catch (error: unknown) {
      setClaimError(error instanceof Error ? error.message : "That quest could not be claimed.");
    } finally {
      setClaimingQuestId(null);
    }
  }

  return (
    <QuestsScreen
      userId={userId}
      events={profile.snapshot.events}
      completedKeys={completedKeys}
      onClaim={(questId) => void claim(questId)}
      claimingQuestId={claimingQuestId}
      claimError={claimError}
    />
  );
}
