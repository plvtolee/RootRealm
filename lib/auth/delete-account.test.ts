import { describe, expect, it } from "vitest";

import { createInMemoryAccountStore, type Account } from "../auth/account";
import {
  DELETE_CONFIRMATION,
  deleteAccount,
  type DeletableAccountStore,
} from "./delete-account";

/**
 * TASKS 22.5. Deletion is irreversible, so these tests hold the two properties that
 * make it safe to ship: it cannot be triggered without a deliberate confirmation,
 * and it refuses everything else rather than half-performing.
 */

const ACCOUNT: Account = {
  id: "acc-1",
  login: "octocat",
  githubId: 4242,
  displayName: "The Octocat",
  avatarUrl: null,
  createdAt: "2026-10-14T00:00:00.000Z",
  verified: true,
};

/** An in-memory store that also deletes, mirroring the real one. */
function deletableStore(seed: readonly Account[] = [ACCOUNT]): DeletableAccountStore {
  const inner = createInMemoryAccountStore(seed);
  const gone = new Set<string>();

  return {
    findById: (id) => (gone.has(id) ? Promise.resolve(null) : inner.findById(id)),
    findByGithubId: (githubId) => inner.findByGithubId(githubId),
    save: inner.save,
    async remove(id) {
      if (gone.has(id)) return false;
      gone.add(id);
      return (await inner.findById(id)) !== null;
    },
  };
}

describe("deleteAccount — refuses without a deliberate confirmation", () => {
  it("refuses a null confirmation", async () => {
    const outcome = await deleteAccount({
      userId: "acc-1",
      confirmation: null,
      store: deletableStore(),
    });

    expect(outcome).toEqual({ ok: false, refusal: "not_confirmed" });
  });

  it("refuses a phrase that is merely close", async () => {
    // "Delete my account" capitalised, "yes", and a prefix must all fail. A fuzzy
    // or case-insensitive match would let a mis-typed confirmation delete a
    // developer's account permanently. Surrounding whitespace is the one
    // concession, because a trailing space is a paste artefact rather than a
    // different intent — that case is asserted in the next test.
    for (const confirmation of [
      "Delete my account",
      "yes",
      "delete my",
      "DELETE MY ACCOUNT",
      "delete my accounts",
    ]) {
      const outcome = await deleteAccount({
        userId: "acc-1",
        confirmation,
        store: deletableStore(),
      });

      expect(outcome, confirmation).toEqual({ ok: false, refusal: "not_confirmed" });
    }
  });

  it("accepts the exact phrase, ignoring surrounding whitespace", async () => {
    const outcome = await deleteAccount({
      userId: "acc-1",
      confirmation: `  ${DELETE_CONFIRMATION}  `,
      store: deletableStore(),
    });

    expect(outcome.ok).toBe(true);
  });

  it("does not delete when it refuses", async () => {
    const store = deletableStore();
    await deleteAccount({ userId: "acc-1", confirmation: "nope", store });

    // The account must still be there. A refusal that deleted anyway would be the
    // worst possible bug in this module.
    expect(await store.findById("acc-1")).not.toBeNull();
  });
});

describe("deleteAccount — refuses without a session", () => {
  it("refuses a null user id", async () => {
    const outcome = await deleteAccount({
      userId: null,
      confirmation: DELETE_CONFIRMATION,
      store: deletableStore(),
    });

    expect(outcome).toEqual({ ok: false, refusal: "unauthenticated" });
  });
});

describe("deleteAccount — a missing account is not a success", () => {
  it("reports not_found rather than claiming it deleted something", async () => {
    const outcome = await deleteAccount({
      userId: "never-existed",
      confirmation: DELETE_CONFIRMATION,
      store: deletableStore(),
    });

    expect(outcome).toEqual({ ok: false, refusal: "not_found" });
  });
});

describe("deleteAccount — the happy path", () => {
  it("removes the account and reports who it was", async () => {
    const store = deletableStore();

    const outcome = await deleteAccount({
      userId: "acc-1",
      confirmation: DELETE_CONFIRMATION,
      store,
    });

    expect(outcome).toEqual({ ok: true, userId: "acc-1", login: "octocat" });
    // The whole point: the account stops resolving.
    expect(await store.findById("acc-1")).toBeNull();
  });

  it("leaves another developer's account alone", async () => {
    const other: Account = { ...ACCOUNT, id: "acc-2", login: "hubot", githubId: 1 };
    const store = deletableStore([ACCOUNT, other]);

    await deleteAccount({
      userId: "acc-1",
      confirmation: DELETE_CONFIRMATION,
      store,
    });

    expect(await store.findById("acc-2")).not.toBeNull();
  });

  it("is not idempotent in the way a double-click needs it to be", async () => {
    // The first request succeeds. A second finds nothing, which is reported as
    // not_found — the honest answer, and the one that lets the route clear the
    // cookie rather than re-running a cascade.
    const store = deletableStore();

    const first = await deleteAccount({
      userId: "acc-1",
      confirmation: DELETE_CONFIRMATION,
      store,
    });
    const second = await deleteAccount({
      userId: "acc-1",
      confirmation: DELETE_CONFIRMATION,
      store,
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, refusal: "not_found" });
  });
});

describe("DELETE_CONFIRMATION", () => {
  it("is awkward enough that a mis-click will not produce it", () => {
    // Not a test of behaviour so much as a statement of intent: this string is the
    // only thing standing between a stray click and an irreversible delete.
    expect(DELETE_CONFIRMATION).toBe("delete my account");
    expect(DELETE_CONFIRMATION.length).toBeGreaterThan(10);
  });
});