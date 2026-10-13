/**
 * RootRealm — the shared profile store (the coherence layer).
 *
 * ```text
 * one fetch of one developer's evidence → every screen that shows their character
 * ```
 *
 * ## The problem this exists to solve
 *
 * `/profile` rendered a static Phase 2 mock, `/skill-tree` held its unlocks in
 * local component state seeded with `["origin"]`, and `/achievements` held filter
 * and animation state as if it had no data at all. Only `/preview` talked to
 * GitHub. The screens were not *disagreeing* — nothing was ever connected to
 * anything — but the result looked exactly like three screens with three
 * different truths, which is worse: a disagreement invites the question "which one
 * is right?", while silence invites nobody to ask.
 *
 * ## Why one fetch, shared
 *
 * ARCHITECTURE §1 requires that "the same normalized evidence must be reusable
 * across the profile, skill tree, achievements and scoring systems", and that
 * "the UI must never become the source of truth for progression". Three screens
 * each fetching `/api/github/profile-preview` would satisfy neither: three
 * ingestion runs against a 60-requests/hour budget (three times the rate-limit
 * risk), three chances to get three different answers, and no single thing to
 * point at when they do disagree.
 *
 * So the fetch happens once and the result is shared. Concurrent consumers of the
 * same login join the in-flight request rather than starting their own, which is
 * what makes mounting three screens at once one network call.
 *
 * ## Why it is a store and not a React context alone
 *
 * React context re-renders every consumer when the provider's value changes, and a
 * context *cannot* deduplicate a fetch that starts during render in three
 * different trees. The request is owned by a module-level cache keyed by login, so
 * the "have we already got this?" question has one answer for the whole page
 * rather than one per provider instance.
 *
 * ## What it deliberately does not own
 *
 * Nothing here decides progression. The store fetches the evidence and hands it
 * to the same pure functions the server used (`aggregateProfile`,
 * `computeSkillTreeView`, `computeAchievementView`), so a screen cannot disagree
 * with the server by computing something of its own.
 */
"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { DeveloperEvent } from "@/lib/developer-event";
import type { AggregatedProfile } from "@/lib/profile/aggregate";

/** Where a snapshot is in its life. One of these drives TASKS 22.4's states. */
export type ProfileStatus = "idle" | "loading" | "ready" | "error";

/** One developer's evidence, exactly as the server computed it. */
export interface ProfileSnapshot {
  readonly login: string;
  readonly profile: AggregatedProfile;
  /**
   * The normalized, deduplicated events. Shared verbatim with the skill tree and
   * the achievement screen so all three score the same evidence.
   */
  readonly events: readonly DeveloperEvent[];
  /**
   * Skill ids recorded as learned for this developer.
   *
   * Empty until skill unlocks are persisted (TASKS 6.5's `skill_unlocks` rows).
   * Empty is the honest value today: nothing has been unlocked, and the skill
   * tree then shows every node as locked or eligible by evidence, which is the
   * truth for a developer who has not spent a point.
   */
  readonly learnedSkillIds: readonly string[];
}

export interface ProfileStoreValue {
  readonly status: ProfileStatus;
  readonly snapshot: ProfileSnapshot | null;
  /** User-safe wording, or null. Carries no internal detail (TASKS 4.2's rule). */
  readonly error: string | null;
  /** Refetches. Safe to call from a retry button. */
  readonly reload: () => void;
}

const EMPTY_STORE: ProfileStoreValue = {
  status: "idle",
  snapshot: null,
  error: null,
  reload: () => undefined,
};

const ProfileContext = createContext<ProfileStoreValue>(EMPTY_STORE);

/* -------------------------------------------------------------------------- */
/* The request cache                                                           */
/* -------------------------------------------------------------------------- */

/** An in-flight or completed request, keyed by login. */
interface Entry {
  readonly promise: Promise<ProfileSnapshot>;
  /** Cleared when the request settles, so a settled entry cannot go stale forever. */
  expires: number;
}

const cache = new Map<string, Entry>();

/** How long a completed snapshot is reused before a screen refetches. */
const TTL_MS = 60_000;

/** Fetches one developer's evidence from the single shared endpoint. */
async function fetchSnapshot(login: string): Promise<ProfileSnapshot> {
  const response = await fetch(
    `/api/github/profile-preview?username=${encodeURIComponent(login)}`,
    { headers: { accept: "application/json" } },
  );

  const body = (await response.json().catch(() => null)) as {
    preview?: {
      profile?: AggregatedProfile;
      events?: readonly DeveloperEvent[];
    } | null;
    failure?: { message?: string } | null;
  } | null;

  // The endpoint answers with `failure` rather than a non-2xx status for every
  // expected ingestion outcome (TASKS 8.2), so the status code alone does not tell
  // us whether there is a profile.
  const preview = body?.preview ?? null;

  if (preview?.profile == null) {
    throw new Error(body?.failure?.message ?? "That profile could not be loaded.");
  }

  return {
    login,
    profile: preview.profile,
    events: preview.events ?? [],
    learnedSkillIds: [],
  };
}

/**
 * The snapshot for a login, joining an in-flight request when there is one.
 *
 * Exported so a non-React caller (and a test) can await the same single request
 * the screens use, rather than a second copy of it.
 */
export function loadProfile(login: string): Promise<ProfileSnapshot> {
  const existing = cache.get(login);

  if (existing !== undefined && existing.expires > Date.now()) {
    return existing.promise;
  }

  const promise = fetchSnapshot(login).catch((error: unknown) => {
    // A failed request must not be cached, or one transient outage would blank
    // every screen for the whole TTL.
    cache.delete(login);
    throw error instanceof Error ? error : new Error(String(error));
  });

  cache.set(login, { promise, expires: Date.now() + TTL_MS });

  return promise;
}

/** Drops the cache. For a reload and for tests. */
export function clearProfileCache(login?: string): void {
  if (login === undefined) cache.clear();
  else cache.delete(login);
}

/* -------------------------------------------------------------------------- */
/* The provider                                                               */
/* -------------------------------------------------------------------------- */

/** A settled request: either a snapshot or the reason there is none. */
type Settled =
  | { readonly login: string; readonly snapshot: ProfileSnapshot }
  | { readonly login: string; readonly error: string };

export function ProfileProvider({
  login,
  children,
}: {
  /** Whose character to load, or null when nobody is signed in. */
  readonly login: string | null;
  readonly children: ReactNode;
}) {
  // Only the *result* is state. "Loading" is derived from its absence rather than
  // stored, which is what keeps the effect free of a synchronous `setState` — the
  // one thing a `useEffect` must not do, because it cascades a render before the
  // paint it was meant to follow.
  const [settled, setSettled] = useState<Settled | null>(null);

  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (login === null) return;

    let cancelled = false;

    void loadProfile(login).then(
      (snapshot) => {
        if (!cancelled) setSettled({ login, snapshot });
      },
      (error: Error) => {
        if (!cancelled) setSettled({ login, error: error.message });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [login, nonce]);

  const reload = useCallback(() => {
    if (login === null) return;

    // Drop the cached snapshot *and* the settled record, so the derived status
    // returns to loading and the effect re-runs against a fresh request.
    clearProfileCache(login);
    setSettled(null);
    setNonce((value) => value + 1);
  }, [login]);

  const value = useMemo<ProfileStoreValue>(() => {
    if (login === null) return { ...EMPTY_STORE, reload };

    // A settled record for a *different* login is stale: it belongs to whoever was
    // being looked at before, and reading it would show one developer's character
    // under another's name.
    if (settled === null || settled.login !== login) {
      return { ...EMPTY_STORE, status: "loading", reload };
    }

    return "error" in settled
      ? { status: "error", snapshot: null, error: settled.error, reload }
      : { status: "ready", snapshot: settled.snapshot, error: null, reload };
  }, [login, settled, reload]);

  return createElement(ProfileContext.Provider, { value }, children);
}

/**
 * The shared profile. Every screen that shows a character reads this.
 *
 * Returns the idle store rather than throwing when there is no provider, so a
 * screen can be rendered in isolation (a test, a Storybook-style preview) without
 * having to construct one.
 */
export function useProfile(): ProfileStoreValue {
  return useContext(ProfileContext);
}

/** The login the current session belongs to, or null when signed out. */
export function useSessionLogin(): { login: string | null; status: "loading" | "ready" } {
  const [state, setState] = useState<{ login: string | null; status: "loading" | "ready" }>({
    login: null,
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/profile/me", { headers: { accept: "application/json" } })
      .then((response) => response.json().catch(() => null))
      .then((body: { login?: string | null } | null) => {
        if (!cancelled) setState({ login: body?.login ?? null, status: "ready" });
      })
      .catch(() => {
        // A failed identity lookup is "signed out", not an error: the visitor can
        // still use the preview, and treating this as a failure would blank the
        // page for something that is a normal state.
        if (!cancelled) setState({ login: null, status: "ready" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}