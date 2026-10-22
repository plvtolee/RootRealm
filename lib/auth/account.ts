/**
 * RootRealm — account creation and claiming (TASKS 9.2 and 9.3).
 *
 * ```text
 * verified GitHub identity → RootRealm user → a persistent character
 * ```
 *
 * TASKS 9.2 creates a RootRealm user once a GitHub identity is verified. TASKS
 * 9.3 turns that verified identity into a persistent account. Both are here because
 * they are the same decision seen from two sides: which RootRealm user, if any,
 * does this verified GitHub identity belong to?
 *
 * ## Storage is an interface, because Phase 10 owns it
 *
 * There is no database yet — that is TASKS 10.1. Rather than block on it, the
 * store is an interface with an in-memory implementation. The route depends on
 * the interface, Phase 10 provides the real one, and the logic under test does
 * not change. This is the same discipline the GitHub client uses for `fetch`.
 *
 * ## Why claiming keys on the GitHub numeric id, not the login
 *
 * A login can be renamed; the numeric id cannot. Keying a claimed account on the
 * login would let a rename orphan an account or, worse, let whoever takes the
 * freed login claim another developer's account. The id is the stable fact, and
 * the login is only display.
 *
 * ## Why the verified identity and the claimed account are the same object here
 *
 * The only way into the product is GitHub OAuth, so the identity GitHub returns
 * is the account. Modelling the claim as "attach this verified identity to this
 * RootRealm user" keeps identity and progress one shape: nothing about the
 * character has to be rebuilt when the account is created.
 */

import type { GitHubIdentity } from "./oauth";

/** A RootRealm user. */
export interface Account {
  /** RootRealm's own id. Stable for the life of the account. */
  readonly id: string;
  /** The verified GitHub login, for display. */
  readonly login: string;
  /**
   * The verified GitHub numeric id. The claim key — surviving renames is the
   * whole reason it, not the login, is what identity is matched on.
   */
  readonly githubId: number;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  /** When the account was created, ISO-8601. */
  readonly createdAt: string;
  /**
   * Whether ownership of the GitHub identity has been verified by OAuth.
   *
   * Always true for a stored account: an account is only ever created through
   * the verified path. It is a field rather than an invariant so a future
   * unverified state has somewhere to live and readers do not have to assume.
   */
  readonly verified: boolean;
}

/** How accounts are read and written. Phase 10 supplies the real one. */
export interface AccountStore {
  findById(id: string): Promise<Account | null>;
  findByGithubId(githubId: number): Promise<Account | null>;
  /** Inserts or replaces. Returns the stored account. */
  save(account: Account): Promise<Account>;
}

/**
 * Resolves the GitHub login owned by a signed session's RootRealm user id.
 *
 * Session ids are the authorization key; season consents and standings use the
 * GitHub login as their domain key. Keeping this lookup explicit prevents those
 * two identities from being passed interchangeably at a server boundary.
 */
export async function githubLoginForUserId(
  userId: string | null,
  store: Pick<AccountStore, "findById">,
): Promise<string | null> {
  if (userId === null) return null;

  return (await store.findById(userId))?.login ?? null;
}

/**
 * An in-memory account store.
 *
 * Not durable and not for production — it exists so the claim logic is testable
 * now and the route has something to depend on that is not a database. Phase 10
 * replaces it without touching this module's logic.
 */
export function createInMemoryAccountStore(seed: readonly Account[] = []): AccountStore {
  const byId = new Map<string, Account>();
  const byGithubId = new Map<number, Account>();

  for (const account of seed) {
    byId.set(account.id, account);
    byGithubId.set(account.githubId, account);
  }

  return {
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async findByGithubId(githubId) {
      return byGithubId.get(githubId) ?? null;
    },
    async save(account) {
      byId.set(account.id, account);
      byGithubId.set(account.githubId, account);
      return account;
    },
  };
}

/** Everything `claimAccount` needs. */
export interface ClaimInput {
  readonly identity: GitHubIdentity;
  readonly store: AccountStore;
  /** When the account is created, ISO-8601. Supplied for determinism. */
  readonly now: string;
  /** Generates the RootRealm id. Injected so tests are deterministic. */
  readonly createId?: () => string;
}

/** The result of a claim. */
export interface ClaimResult {
  readonly account: Account;
  /** True when an existing account was reused, false when one was created. */
  readonly existing: boolean;
}

/** Default id generation: a random 128-bit hex string. */
function defaultId(): string {
  // Web Crypto is present in the Node runtime Next uses; `globalThis.crypto` is
  // preferred over importing `node:crypto` here so this module stays usable in
  // any edge runtime the route may later run in.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates or reuses the RootRealm account for a verified identity.
 *
 * Idempotent by GitHub id: signing in twice returns the same account rather
 * than a second one. That is the same structural-uniqueness choice the skill and
 * achievement unlocks make — the key is a first-class lookup, not a
 * deduplication step that can be forgotten.
 */
export async function claimAccount(input: ClaimInput): Promise<ClaimResult> {
  const existing = await input.store.findByGithubId(input.identity.githubId);
  if (existing !== null) {
    return { account: existing, existing: true };
  }

  const account: Account = {
    id: (input.createId ?? defaultId)(),
    login: input.identity.login,
    githubId: input.identity.githubId,
    displayName: input.identity.name,
    avatarUrl: input.identity.avatarUrl,
    createdAt: input.now,
    verified: true,
  };

  return { account: await input.store.save(account), existing: false };
}
