import { describe, expect, it } from "vitest";

import {
  parseEvent,
  parseEventList,
  parseRepository,
  parseRepositoryList,
  parseUser,
} from "./types";

describe("parseUser", () => {
  it("reads the snake_case fields RootRealm uses and defaults site_admin", () => {
    const user = parseUser(
      {
        login: "octocat",
        id: 583231,
        name: "The Octocat",
        avatar_url: "https://avatars.githubusercontent.com/u/583231",
        html_url: "https://github.com/octocat",
        public_repos: 8,
        created_at: "2011-01-25T18:44:36Z",
        updated_at: "2026-01-02T09:00:00Z",
      },
      "body",
    );

    expect(user.login).toBe("octocat");
    expect(user.avatarUrl).toBe("https://avatars.githubusercontent.com/u/583231");
    expect(user.publicRepos).toBe(8);
    expect(user.siteAdmin).toBe(false);
    expect(user.bio).toBeNull();
  });

  it("rejects a payload without the stable identity fields", () => {
    expect(() => parseUser({ login: "octocat" }, "body")).toThrow(/Expected a number/);
    expect(() => parseUser({ id: 1 }, "body")).toThrow(/Expected a string/);
  });

  it("rejects a non-string where a string is documented", () => {
    expect(() => parseUser({ login: 42, id: 1 }, "body")).toThrow(
      /Expected a string at "body.login"/,
    );
  });

  it("rejects a malformed timestamp", () => {
    expect(() => parseUser({ login: "a", id: 1, created_at: "yesterday" }, "body")).toThrow(
      /ISO-8601/,
    );
  });

  it("rejects a payload that is not an object", () => {
    expect(() => parseUser("octocat", "body")).toThrow(/Expected an object/);
  });
});

describe("parseRepository", () => {
  const base = {
    id: 1296269,
    full_name: "octocat/Hello-World",
    name: "Hello-World",
    owner: { login: "octocat" },
  };

  it("preserves the archived state rather than filtering it", () => {
    const repo = parseRepository({ ...base, archived: true, fork: false }, "body");
    expect(repo.archived).toBe(true);
    expect(repo.id).toBe(1296269);
    expect(repo.ownerLogin).toBe("octocat");
  });

  it("defaults the boolean flags when GitHub omits them", () => {
    const repo = parseRepository(base, "body");
    expect(repo).toMatchObject({
      archived: false,
      fork: false,
      disabled: false,
      isTemplate: false,
      topics: [],
      license: null,
    });
  });

  it("reads the nested license identifier", () => {
    const repo = parseRepository({ ...base, license: { spdx_id: "MIT" } }, "body");
    expect(repo.license).toBe("MIT");
  });

  it("keeps a null license rather than failing", () => {
    expect(parseRepository({ ...base, license: null }, "body").license).toBeNull();
  });

  it("requires the numeric id that survives a rename", () => {
    expect(() => parseRepository({ ...base, id: "1296269" }, "body")).toThrow(
      /Expected a number/,
    );
  });
});

describe("parseEvent", () => {
  const base = {
    id: "22249084947",
    type: "PullRequestEvent",
    public: true,
    created_at: "2026-02-01T10:00:00Z",
    actor: { login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/583231" },
    repo: { id: 1296269, name: "octocat/Hello-World" },
    payload: { action: "closed", number: 42 },
  };

  it("keeps visibility, repository identity and the raw payload", () => {
    const event = parseEvent(base, "body");
    expect(event.public).toBe(true);
    expect(event.repoId).toBe(1296269);
    expect(event.repoFullName).toBe("octocat/Hello-World");
    expect(event.payload).toEqual({ action: "closed", number: 42 });
  });

  it("defaults visibility to private-safe false when absent", () => {
    const event = parseEvent({ ...base, public: undefined }, "body");
    expect(event.public).toBe(false);
  });

  it("tolerates a missing actor and repository", () => {
    const event = parseEvent({ ...base, actor: null, repo: null }, "body");
    expect(event.actorLogin).toBeNull();
    expect(event.repoId).toBeNull();
  });

  it("rejects a payload whose id is not a string", () => {
    expect(() => parseEvent({ ...base, id: 22249084947 }, "body")).toThrow(
      /Expected a string/,
    );
  });
});

describe("list parsers", () => {
  it("reports the offending index when an entry is malformed", () => {
    expect(() =>
      parseRepositoryList(
        [
          { id: 1, full_name: "a/b", name: "b", owner: { login: "a" } },
          { id: "x", full_name: "a/c", name: "c", owner: { login: "a" } },
        ],
        "body",
      ),
    ).toThrow(/body\[1\]/);
  });

  it("rejects a non-array body", () => {
    expect(() => parseEventList({ message: "Not Found" }, "body")).toThrow(
      /Expected an array/,
    );
  });
});