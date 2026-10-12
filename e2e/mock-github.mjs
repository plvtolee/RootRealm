/**
 * RootRealm — a mock GitHub, for the Playwright journeys (TASKS 20.3–20.6).
 *
 * ```text
 * a local stand-in for api.github.com and github.com, serving the documented shapes
 * ```
 *
 * ## Why a mock and not the live API
 *
 * The GitHub-backed journeys need *deterministic* data. The live API gives a
 * developer's real feed that changes hourly, is capped at 300 events, and costs
 * a rate-limit budget each run — so a test against it would fail for reasons
 * that are not bugs and could not assert a specific score. This server answers
 * the same endpoints `lib/github/*` and `lib/auth/oauth.ts` call, with the
 * payload shapes those modules were written against (TASKS 4.4's observed
 * shapes), so the whole ingestion → scoring → aggregation path runs unchanged
 * and the assertions are about behaviour rather than about GitHub's mood.
 *
 * ## How it is wired
 *
 * The app resolves its GitHub hosts from `GITHUB_API_BASE` / `GITHUB_OAUTH_BASE`
 * (`lib/github/endpoints.ts`), honored only outside production. The Playwright
 * config starts this server and sets both, so the app under test talks here.
 *
 * ## Scope: the endpoints the journeys actually reach
 *
 * - `GET  /users/:login` — the profile read
 * - `GET  /users/:login/repos` — the repository walk
 * - `GET  /users/:login/events` — the activity feed
 * - `GET  /login/oauth/authorize` — the consent step, redirected straight through
 * - `POST /login/oauth/access_token` — the code exchange
 * - `GET  /user` — the identity read
 *
 * `GET /repos/:owner/:repo/pulls/:number/files` is deliberately absent: TASKS 5.8
 * is deferred, so no journey reaches it, and serving it would imply a coverage
 * the product does not have.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_GITHUB_PORT ?? 4599);

/** The single account the mock knows, so a journey's assertions are stable. */
const LOGIN = "e2e-dev";
const GITHUB_ID = 424242;
const TOKEN = "mock-access-token";

/** Fixed timestamps, so a scored total is reproducible. */
const NOW = Date.parse("2026-10-12T12:00:00Z");
const day = (n) => new Date(NOW - n * 86_400_000).toISOString();

const OWNED = { id: 700_701, name: `${LOGIN}/rootrealm-fixture` };

function push(id, at) {
  return {
    id,
    type: "PushEvent",
    public: true,
    created_at: at,
    actor: { login: LOGIN, avatar_url: null },
    repo: OWNED,
    payload: {
      repository_id: OWNED.id,
      push_id: 900_001,
      size: 2,
      distinct_size: 2,
      ref: "refs/heads/main",
      head: "abcdef1234567890abcdef1234567890abcdef12",
      before: "1234567890abcdef1234567890abcdef12345678",
      // No `commits`: the observed shape (TASKS 4.4). The client must record
      // `commit_count_unavailable` rather than invent a count.
    },
  };
}

function pullRequest(id, at, merged) {
  return {
    id,
    type: "PullRequestEvent",
    public: true,
    created_at: at,
    actor: { login: LOGIN, avatar_url: null },
    repo: OWNED,
    payload: {
      action: merged ? "closed" : "opened",
      number: 42,
      // The five-field stub the live feed actually returns.
      pull_request: {
        id: 800_001,
        number: 42,
        merged,
        merged_at: merged ? at : null,
        title: "A fixture pull request",
      },
    },
  };
}

function review(id, at) {
  return {
    id,
    type: "PullRequestReviewEvent",
    public: true,
    created_at: at,
    actor: { login: LOGIN, avatar_url: null },
    repo: OWNED,
    payload: {
      action: "created",
      review: { id: 810_001, state: "approved", submitted_at: at },
      pull_request: {
        id: 800_001,
        number: 42,
        merged: false,
        merged_at: null,
        title: "A fixture pull request",
      },
    },
  };
}

function issue(id, at, closed) {
  return {
    id,
    type: "IssuesEvent",
    public: true,
    created_at: at,
    actor: { login: LOGIN, avatar_url: null },
    repo: OWNED,
    payload: {
      action: closed ? "closed" : "opened",
      issue: {
        id: 820_001,
        number: 7,
        title: "A fixture issue",
        state: closed ? "closed" : "open",
      },
    },
  };
}

function release(id, at) {
  return {
    id,
    type: "ReleaseEvent",
    public: true,
    created_at: at,
    actor: { login: LOGIN, avatar_url: null },
    repo: OWNED,
    payload: {
      action: "published",
      release: {
        id: 830_001,
        tag_name: "v1.0.0",
        name: "One",
        draft: false,
        prerelease: false,
        published_at: at,
      },
    },
  };
}

/** Every scoreable kind, newest first, in the observed shapes. */
const EVENTS = [
  push("e2e-1", day(0)),
  pullRequest("e2e-2", day(1), true),
  pullRequest("e2e-3", day(2), false),
  review("e2e-4", day(3)),
  issue("e2e-5", day(4), true),
  issue("e2e-6", day(5), false),
  release("e2e-7", day(6)),
];

const REPOS = [
  {
    id: OWNED.id,
    name: "rootrealm-fixture",
    full_name: OWNED.name,
    private: false,
    fork: false,
    archived: false,
    disabled: false,
    created_at: "2021-03-04T00:00:00Z",
    updated_at: "2026-10-11T00:00:00Z",
    pushed_at: day(0),
    stargazers_count: 12,
    forks_count: 3,
    language: "TypeScript",
    description: "A fixture repository.",
    html_url: `https://github.com/${OWNED.name}`,
    owner: { login: LOGIN },
  },
];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4999",
      "x-ratelimit-reset": "1790000000",
    },
  });
}

function notFound() {
  return json({ message: "Not Found" }, 404);
}

async function route(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // --- OAuth (TASKS 20.4) -----------------------------------------------------
  if (path === "/login/oauth/authorize") {
    // Stands in for the developer clicking "Authorize" on GitHub: GitHub
    // redirects back to the registered callback with a one-time code and the
    // state it was given, which is what the callback compares against its cookie.
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state") ?? "";
    if (!redirectUri) return json({ message: "missing redirect_uri" }, 400);

    const back = new URL(redirectUri);
    back.searchParams.set("code", "mock-authorization-code");
    back.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: { location: back.toString() },
    });
  }

  if (path === "/login/oauth/access_token" && request.method === "POST") {
    return json({ access_token: TOKEN, token_type: "bearer", scope: "read:user" });
  }

  if (path === "/user") {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${TOKEN}`) return json({ message: "Bad credentials" }, 401);
    return json({ login: LOGIN, id: GITHUB_ID, name: "E2E Developer", avatar_url: null });
  }

  // --- REST: profile, repositories, events ------------------------------------
  const userMatch = /^\/users\/([^/]+)$/.exec(path);
  if (userMatch) {
    if (decodeURIComponent(userMatch[1]) !== LOGIN) return notFound();
    return json({
      login: LOGIN,
      id: GITHUB_ID,
      name: "E2E Developer",
      avatar_url: null,
      html_url: `https://github.com/${LOGIN}`,
      bio: "A fixture developer.",
      company: null,
      location: "Fixtureville",
      blog: null,
      public_repos: REPOS.length,
      followers: 1,
      following: 2,
      created_at: "2019-01-01T00:00:00Z",
    });
  }

  const reposMatch = /^\/users\/([^/]+)\/repos$/.exec(path);
  if (reposMatch) {
    if (decodeURIComponent(reposMatch[1]) !== LOGIN) return notFound();
    return json(REPOS);
  }

  const eventsMatch = /^\/users\/([^/]+)\/events$/.exec(path);
  if (eventsMatch) {
    if (decodeURIComponent(eventsMatch[1]) !== LOGIN) return notFound();
    return json(EVENTS);
  }

  return notFound();
}

const server = createServer(async (req, res) => {
  const url = `http://${req.headers.host ?? `localhost:${PORT}`}${req.url ?? "/"}`;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const request = new Request(url, {
    method: req.method ?? "GET",
    headers: req.headers,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });

  const response = await route(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
});

server.listen(PORT, () => {
  console.info(`mock GitHub listening on http://localhost:${PORT}`);
});

// A journey's teardown sends SIGTERM; exiting cleanly keeps the port reusable.
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));