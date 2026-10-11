import { describe, expect, it } from "vitest";

import {
  parseEvent,
  parseEventList,
  parsePullRequestFile,
  parsePullRequestFileList,
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

/* ------------------------------------------------------------------ */
/* TASK 5.8 — pull request files                                       */
/* ------------------------------------------------------------------ */

describe("parsePullRequestFile", () => {
  it("reads the fields §13 needs and ignores the rest", () => {
    const file = parsePullRequestFile(
      {
        sha: "bbcd538c8e72b8c175046e27cc8f907076331401",
        filename: "internal/auth_test.go",
        status: "modified",
        additions: 42,
        deletions: 7,
        changes: 49,
        blob_url: "https://github.com/o/r/blob/main/internal/auth_test.go",
        raw_url: "https://github.com/o/r/raw/main/internal/auth_test.go",
        contents_url: "https://api.github.com/repos/o/r/contents/internal/auth_test.go",
        patch: "@@ -1 +1 @@\n-a\n+b",
      },
      "file",
    );

    expect(file).toEqual({
      filename: "internal/auth_test.go",
      status: "modified",
      previousFilename: null,
      additions: 42,
      deletions: 7,
    });
  });

  it("requires a filename, because without one the entry says nothing", () => {
    expect(() => parsePullRequestFile({ status: "added" }, "file")).toThrow(
      /filename/,
    );
  });

  it("keeps an unknown status rather than guessing a default", () => {
    // GitHub documents four values; a fifth would be a change we should see in
    // the record rather than have silently mapped onto one of the four.
    const file = parsePullRequestFile(
      { filename: "a.go", status: "copied" },
      "file",
    );

    expect(file.status).toBe("copied");
  });

  it("nulls an absent status rather than reporting it as added", () => {
    const file = parsePullRequestFile({ filename: "a.go" }, "file");

    expect(file.status).toBeNull();
  });

  it("rejects a malformed additions count rather than nulling it", () => {
    // An absent field and a wrongly-typed one are different facts. GitHub
    // withholding `additions` is an absence the caller can see; a string where a
    // number is documented means the contract is broken, and coercing it would
    // hide that behind a plausible-looking null.
    expect(() =>
      parsePullRequestFile({ filename: "a.go", additions: "many" }, "file"),
    ).toThrow(/Expected a number/);
  });

  it("treats an absent count as absent, not as zero", () => {
    // Zero would assert the file changed nothing, which is a claim rather than a
    // missing value.
    const file = parsePullRequestFile({ filename: "a.go" }, "file");

    expect(file.additions).toBeNull();
    expect(file.deletions).toBeNull();
  });

  it("rejects a body that is not an object", () => {
    expect(() => parsePullRequestFile("nope", "file")).toThrow();
    expect(() => parsePullRequestFile([], "file")).toThrow();
  });
});

describe("parsePullRequestFileList", () => {
  it("parses every entry", () => {
    const files = parsePullRequestFileList(
      [{ filename: "a_test.go" }, { filename: "b.go" }],
      "body",
    );

    expect(files.map((f) => f.filename)).toEqual(["a_test.go", "b.go"]);
  });

  it("rejects a non-array body", () => {
    // A 404 from the files endpoint returns an object, and treating that as an
    // empty file list would read as "this pull request changed no files".
    expect(() =>
      parsePullRequestFileList({ message: "Not Found" }, "body"),
    ).toThrow(/Expected an array/);
  });
});