/**
 * RootRealm — the live profile screen.
 *
 * ```tsx
 * <ProfileGate />
 * ```
 *
 * The client component that reads the identity and profile snapshots supplied by
 * the protected app layout, then hands the result to `ProfileScreen`.
 *
 * ## Why the states are explicit
 *
 * This is TASKS 22.4's requirement met where it is cheapest. The four states are
 * decided once, here, from one status — rather than each screen inventing its own
 * loading text — and each is a real state of the world rather than a placeholder:
 *
 * - **loading** — a request is in flight;
 * - **signed out** — handled by the protected server layout, which sends the
 *   visitor to the login wall before this gate renders;
 * - **error** — the lookup failed, with the server's own user-safe wording;
 * - **ready** — the developer's real aggregate.
 *
 * Before this, `/profile` rendered `MOCK_PROFILE` unconditionally, which is why it
 * could disagree with the live lookup: nothing had ever connected them.
 */
"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSessionLogin } from "@/components/auth/session-provider";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { toProfileScreenProps } from "@/components/profile/profile-adapter";
import {
  useProfile,
  type ProfileStoreValue,
} from "@/components/profile/profile-store";

/** What a screen shows while a request is in flight. */
function Loading() {
  return (
    <Text as="p" variant="body" className="text-text-secondary">
      Reading your activity from GitHub…
    </Text>
  );
}

/** What a screen shows when the lookup failed. */
function Failed({ store }: { store: ProfileStoreValue }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Text as="h1" variant="heading">
        Could not load your profile
      </Text>
      <Text as="p" variant="body" className="text-text-secondary">
        {store.error ?? "GitHub did not answer."}
      </Text>
      <Button variant="primary" onClick={store.reload}>
        Try again
      </Button>
    </div>
  );
}

/**
 * What the developer is wearing, from the one wallet the shop spends from.
 *
 * Kept separate from {@link useProfile} because it is a different resource with a
 * different lifecycle: a character's evidence changes on a sync, whereas what
 * someone is wearing changes the moment they press Equip. Refetching the whole
 * profile because a frame changed would be a second GitHub read for a local
 * change.
 *
 * A failure here is deliberately silent — the profile falls back to its default
 * look rather than showing an error over a working character. A cosmetic that
 * fails to load is not a reason to hide the developer.
 */
function useEquippedCosmetics(login: string | null): {
  frameId: string | null;
  effectId: string | null;
} {
  const [equipped, setEquipped] = useState<Record<string, string>>({});

  useEffect(() => {
    // No synchronous `setState` here. The protected layout stops signed-out
    // requests before this component mounts, so the "wearing nothing" default is
    // already correct until the cosmetics request settles.
    if (login === null) return;

    let cancelled = false;

    void fetch("/api/profile/cosmetics", { headers: { accept: "application/json" } })
      .then((response) => response.json().catch(() => null))
      .then((body: { equipped?: Record<string, string> } | null) => {
        if (!cancelled) setEquipped(body?.equipped ?? {});
      })
      .catch(() => {
        if (!cancelled) setEquipped({});
      });

    return () => {
      cancelled = true;
    };
  }, [login]);

  return { frameId: equipped.frame ?? null, effectId: equipped.effect ?? null };
}

/** The profile page consumes the session and profile contexts from the app layout. */
export default function ProfileGate() {
  const session = useSessionLogin();

  if (session.status === "loading") return <Loading />;
  if (session.login === null) return <Loading />;

  return <ProfileFor login={session.login} />;
}

/**
 * The screen, reading the store the provider owns.
 *
 * Split from {@link ProfileGate} so the profile context is read below the shared
 * provider owned by the protected app layout.
 *
 * `login` is passed down rather than resolved again here so cosmetics and the
 * profile use the same server-authenticated identity.
 */
function ProfileFor({ login }: { login: string }) {
  const store = useProfile();
  const { frameId, effectId } = useEquippedCosmetics(login);

  if (store.status === "loading" || store.status === "idle") return <Loading />;
  if (store.status === "error") return <Failed store={store} />;
  if (store.snapshot === null) return <Loading />;

  return (
    <ProfileScreen
      profile={toProfileScreenProps(store.snapshot.profile, {
        // A profile reached through the session is the developer's own, which is
        // what `verified` means: ownership was established by OAuth (PRD §8).
        verified: true,
      })}
      frameId={frameId}
      effectId={effectId}
       // Only the signed-in developer is offered deletion. This screen is behind a
       // session by construction — the protected layout stops signed-out requests
       // — so the control can never appear on someone else's profile.
      showDelete
    />
  );
}
