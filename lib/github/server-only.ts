/**
 * RootRealm — the server-only guard (TASKS 4.1, reused by TASKS 9.1).
 *
 * A module that reads a secret must fail loudly if it is ever bundled for the
 * browser. The GitHub client and the auth configuration both need the check, so
 * it lives in one place rather than in two copies that could drift.
 */
export function assertServerOnly(caller: string): void {
  if (typeof window !== "undefined") {
    throw new Error(
      `${caller} must not be used in the browser — it reads a server-side secret.`,
    );
  }
}