import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { issueSession } from "../auth/session";
import { accountStore, resetStores } from "../db/stores";

import { githubLoginFromCookieHeader } from "./service";

const SESSION_SECRET = "leaderboard-service-test-secret";
const ORIGINAL_SESSION_SECRET = process.env.SESSION_SECRET;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

describe("leaderboard session identity mapping", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    // Keep this focused test on the in-memory account store even when a local
    // developer has a database configured in their shell.
    delete process.env.DATABASE_URL;
    resetStores();
  });

  afterEach(() => {
    resetStores();
    if (ORIGINAL_SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = ORIGINAL_SESSION_SECRET;
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  });

  it("resolves the session's internal user id to the GitHub login used by leaderboard records", async () => {
    await accountStore().save({
      id: "root-user-1",
      login: "octocat",
      githubId: 583231,
      displayName: "The Octocat",
      avatarUrl: null,
      createdAt: "2026-10-12T00:00:00.000Z",
      verified: true,
    });

    const session = issueSession("root-user-1", { secret: SESSION_SECRET });

    expect(await githubLoginFromCookieHeader(`rr_session=${session.value}`)).toBe("octocat");
  });

  it("does not authorize a cookie whose value only resembles a GitHub login", async () => {
    await accountStore().save({
      id: "root-user-1",
      login: "octocat",
      githubId: 583231,
      displayName: "The Octocat",
      avatarUrl: null,
      createdAt: "2026-10-12T00:00:00.000Z",
      verified: true,
    });

    const session = issueSession("octocat", { secret: SESSION_SECRET });

    expect(await githubLoginFromCookieHeader(`rr_session=${session.value}`)).toBeNull();
  });
});
