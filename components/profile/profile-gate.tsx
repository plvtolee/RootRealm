/**
 * RootRealm — the live profile screen.
 *
 * ```tsx
 * <ProfileGate />
 * ```
 *
 * The client component that resolves *whose* character to show, loads it through
 * the shared store, and hands it to the presentational `ProfileScreen`. It exists
 * because the resolution is client work: the session cookie is HttpOnly, so only a
 * request can ask who it belongs to, and the answer decides what to fetch.
 *
 * ## Why the states are explicit
 *
 * This is TASKS 22.4's requirement met where it is cheapest. The four states are
 * decided once, here, from one status — rather than each screen inventing its own
 * loading text — and each is a real state of the world rather than a placeholder:
 *
 * - **loading** — a request is in flight;
 * - **signed out** — no session, so there is no character to show. This says so
 *   and points at the preview, which works without an account;
 * - **error** — the lookup failed, with the server's own user-safe wording;
 * - **ready** — the developer's real aggregate.
 *
 * Before this, `/profile` rendered `MOCK_PROFILE` unconditionally, which is why it
 * could disagree with `/preview`: nothing had ever connected them.
 */
"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { toProfileScreenProps } from "@/components/profile/profile-adapter";
import {
  ProfileProvider,
  useProfile,
  useSessionLogin,
  type ProfileStoreValue,
} from "@/components/profile/profile-store";

/**
 * A navigation link.
 *
 * Deliberately an `<a>`, not a `<Button>`: these navigate, and `Button` is always
 * a real `<button>` (AGENTS.md's accessibility invariants). Nesting an anchor
 * inside a button is invalid HTML and makes the control's name its entire content
 * to a screen reader.
 */
function NavLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-(--control-height-md) items-center text-accent underline underline-offset-4 hover:opacity-80"
    >
      {children}
    </a>
  );
}

/** What a screen shows while a request is in flight. */
function Loading() {
  return (
    <Text as="p" variant="body" className="text-text-secondary">
      Reading your activity from GitHub…
    </Text>
  );
}

/** What a screen shows when there is no session. */
function SignedOut() {
  return (
    <div className="flex flex-col items-start gap-4">
      <Text as="h1" variant="heading">
        No character yet
      </Text>
      <Text as="p" variant="body" className="text-text-secondary">
        Sign in with GitHub to claim a profile. Anyone can still look up a public
        profile without an account.
      </Text>
      <div className="flex gap-6">
        <NavLink href="/api/auth/github">Sign in with GitHub</NavLink>
        <NavLink href="/preview">Look up a profile</NavLink>
      </div>
    </div>
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
    // No synchronous `setState` here. The gate only ever mounts this hook with a
    // real login — the signed-out case returns before reaching it — so the
    // "wearing nothing" default is already the correct state for a null login and
    // does not need to be written. Setting it would cascade a render before the
    // paint the effect was meant to follow.
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

/** The profile page: resolve the session, then provide the store for that login. */
export default function ProfileGate() {
  const session = useSessionLogin();

  if (session.status === "loading") return <Loading />;
  if (session.login === null) return <SignedOut />;

  return (
    <ProfileProvider login={session.login}>
      <ProfileFor login={session.login} />
    </ProfileProvider>
  );
}

/**
 * The screen, reading the store the provider owns.
 *
 * Split from {@link ProfileGate} so the `useProfile` call is always inside a
 * provider. A hook that read the context without one would return the idle store
 * forever, and the page would sit on "loading" with no way to fail.
 *
 * `login` is passed down rather than resolved again here: `useSessionLogin` issues
 * a request, and calling it twice would ask the server twice for an answer that
 * cannot have changed.
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
      // session by construction — the gate renders `SignedOut` otherwise — so the
      // control can never appear on someone else's profile.
      showDelete
    />
  );
}