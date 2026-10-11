import { describe, expect, it } from "vitest";

import { claimAccount, createInMemoryAccountStore } from "./account";
import type { GitHubIdentity } from "./oauth";

const identity: GitHubIdentity = {
  login: "octocat",
  githubId: 583231,
  name: "The Octocat",
  avatarUrl: "https://x",
};

describe("claimAccount (9.2 and 9.3)", () => {
  it("creates a verified account from a verified identity", async () => {
    const store = createInMemoryAccountStore();
    const result = await claimAccount({ identity, store, now: "2026-10-12T00:00:00.000Z", createId: () => "user-1" });

    expect(result.existing).toBe(false);
    expect(result.account).toMatchObject({
      id: "user-1",
      login: "octocat",
      githubId: 583231,
      verified: true,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
  });

  it("is idempotent by GitHub id: a second sign-in reuses the account", async () => {
    const store = createInMemoryAccountStore();
    const first = await claimAccount({ identity, store, now: "2026-10-12T00:00:00.000Z", createId: () => "user-1" });
    const second = await claimAccount({ identity, store, now: "2026-10-13T00:00:00.000Z", createId: () => "user-2" });

    expect(second.existing).toBe(true);
    expect(second.account.id).toBe(first.account.id);
    expect(second.account.id).toBe("user-1");
  });

  it("keys on the GitHub id, so a renamed login still finds the account", async () => {
    const store = createInMemoryAccountStore();
    await claimAccount({ identity, store, now: "2026-10-12T00:00:00.000Z", createId: () => "user-1" });

    const renamed = await claimAccount({
      identity: { ...identity, login: "octocat-renamed" },
      store,
      now: "2026-10-13T00:00:00.000Z",
      createId: () => "user-2",
    });

    expect(renamed.existing).toBe(true);
    expect(renamed.account.id).toBe("user-1");
  });

  it("gives different identities different accounts", async () => {
    const store = createInMemoryAccountStore();
    const a = await claimAccount({ identity, store, now: "2026-10-12T00:00:00.000Z", createId: () => "user-1" });
    const b = await claimAccount({
      identity: { ...identity, githubId: 2, login: "someone-else" },
      store,
      now: "2026-10-12T00:00:00.000Z",
      createId: () => "user-2",
    });

    expect(a.account.id).not.toBe(b.account.id);
  });
});