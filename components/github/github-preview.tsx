"use client";

import { useCallback, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/**
 * RootRealm — GitHub ingestion preview (TASKS 4.2).
 *
 * A development harness, not product UI. TASKS 4.1 and 4.2 are server-only
 * code, so without a browser surface there is nothing to inspect, screenshot or
 * manually verify against the real API. This screen exists for that review step
 * and for checking the controlled error states (invalid username, unknown
 * account, rate limit, outage) that a unit test can only assert in the
 * abstract.
 *
 * What it deliberately does not do:
 *
 * - no XP, attributes, skills or level — scoring is TASKS 4.5 onward, and a
 *   number on this screen would be invented data;
 * - no token input — `GITHUB_TOKEN` is read server-side only;
 * - no caching, no history and no retries beyond the client's own backoff.
 *
 * It is not one of the five destinations in `NAV_ITEMS` — the product
 * information architecture is fixed at TASKS 1.5 — so it is reached from the
 * Home screen's Development card, and carries a back link.
 */

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "populated";
      profile: PreviewProfile;
      observation: PreviewObservation | null;
      repositoriesMessage: string | null;
      rateLimit: PreviewRateLimit;
    }
  | {
      status: "error";
      reason: string;
      message: string;
      retryAfterMs: number | null;
      rateLimit: PreviewRateLimit;
    };

/**
 * The subset of `PublicProfile` this screen renders. The route returns the
 * full profile plus `source`; the preview narrows to the identity fields so
 * the screen cannot accidentally come to depend on a raw GitHub field.
 */
interface PreviewProfile {
  login: string;
  githubId: number;
  name: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  publicRepos: number | null;
  publicGists: number | null;
  followers: number | null;
  following: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface PreviewRateLimit {
  limit: number | null;
  remaining: number | null;
  resetsAt: number | null;
}

/**
 * The subset of `RepositoryRecord` this screen renders, plus the observation
 * counters. The route returns the full record including `source`; the preview
 * narrows to the fields it displays so the screen cannot come to depend on a
 * raw GitHub field.
 */
interface PreviewRepository {
  repositoryId: number;
  fullName: string;
  description: string | null;
  url: string | null;
  primaryLanguage: string | null;
  isFork: boolean;
  isArchived: boolean;
  isTemplate: boolean;
  stars: number | null;
  createdAt: string | null;
  pushedAt: string | null;
}

interface PreviewObservation {
  repositories: PreviewRepository[];
  count: number;
  pages: number;
  truncated: boolean;
  oldestCreatedAt: string | null;
  latestActivityAt: string | null;
}

function rateLimitOf(value: unknown): PreviewRateLimit {
  const raw = (value ?? {}) as Partial<PreviewRateLimit>;
  return {
    limit: raw.limit ?? null,
    remaining: raw.remaining ?? null,
    resetsAt: raw.resetsAt ?? null,
  };
}

/** Formats an epoch timestamp, or a placeholder when GitHub gave none. */
function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatCount(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

export function GitHubPreview() {
  const [username, setUsername] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const lookup = useCallback(async () => {
    const query = username.trim().replace(/^@/, "");
    setState({ status: "loading" });

    try {
      const response = await fetch(
        `/api/github/profile?username=${encodeURIComponent(query)}`,
      );
      const body = (await response.json()) as {
        profile: PreviewProfile | null;
        failure: {
          reason: string;
          message: string;
          retryAfterMs: number | null;
        } | null;
        rateLimit: unknown;
      };

      if (body.profile) {
        // Repositories are a second request, so a failure there must not discard
        // the profile that did resolve — the two are reported independently.
        const repositories = await fetch(
          `/api/github/repositories?username=${encodeURIComponent(query)}`,
        );
        const repositoryBody = (await repositories.json()) as {
          observation: PreviewObservation | null;
          failure: { message: string } | null;
          rateLimit: unknown;
        };

        setState({
          status: "populated",
          profile: body.profile,
          observation: repositoryBody.observation,
          repositoriesMessage: repositoryBody.observation
            ? null
            : (repositoryBody.failure?.message ??
              "The repository lookup failed for an unknown reason."),
          rateLimit: rateLimitOf(repositoryBody.rateLimit ?? body.rateLimit),
        });
        return;
      }

      setState({
        status: "error",
        reason: body.failure?.reason ?? "unexpected_response",
        message:
          body.failure?.message ?? "The lookup failed for an unknown reason.",
        retryAfterMs: body.failure?.retryAfterMs ?? null,
        rateLimit: rateLimitOf(body.rateLimit),
      });
    } catch {
      // The route is same-origin, so reaching this means the server itself
      // failed to answer — not that GitHub rejected the username.
      setState({
        status: "error",
        reason: "unavailable",
        message: "Could not reach the RootRealm server.",
        retryAfterMs: null,
        rateLimit: { limit: null, remaining: null, resetsAt: null },
      });
    }
  }, [username]);

  const busy = state.status === "loading";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-start gap-3">
        <Badge variant="warning">Development</Badge>

        {/*
          A back link, because this screen is not in the primary navigation:
          without one, arriving here from Home leaves no visible way out.
        */}
        <Link
          href="/"
          className="text-label text-text-muted transition-colors duration-(--motion-fast) ease-standard hover:text-text-secondary motion-reduce:transition-none"
        >
          ← Back to Home
        </Link>

        <Text variant="label" className="uppercase text-text-secondary">
          RootRealm
        </Text>

        <Text variant="display">GitHub ingestion preview</Text>

        <Text variant="body" className="text-text-secondary">
          Looks up a public GitHub profile and repository list through{" "}
          <code className="font-mono text-text-primary">
            /api/github/profile
          </code>{" "}
          and{" "}
          <code className="font-mono text-text-primary">
            /api/github/repositories
          </code>
          . It exercises TASKS 4.1–4.3 only — nothing is scored, normalised or
          stored.
        </Text>
      </header>

      <Card className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void lookup();
          }}
        >
          <Input
            label="GitHub username"
            placeholder="plvtolee"
            autoComplete="off"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <Button type="submit" loading={busy} className="sm:w-auto">
            Look up
          </Button>
        </form>

        <Text variant="caption" className="text-text-muted">
          Try <code className="font-mono">octocat</code> for a valid account,{" "}
          <code className="font-mono">octocat-does-not-exist-404</code> for an
          unknown one, and <code className="font-mono">not a login!</code> for a
          malformed one. <code className="font-mono">sindresorhus</code> has over
          a thousand repositories and will show the truncated badge.
        </Text>
      </Card>

      <Card className="flex flex-col gap-4">
        <Text variant="label" className="uppercase text-text-muted">
          Result
        </Text>

        {state.status === "idle" ? (
          <Text variant="body" className="text-text-secondary">
            Enter a username to run a lookup.
          </Text>
        ) : null}

        {state.status === "loading" ? (
          <Text variant="body" className="text-text-secondary">
            Contacting GitHub…
          </Text>
        ) : null}

        {state.status === "error" ? (
          <div className="flex flex-col gap-2">
            <Badge variant="danger">{state.reason}</Badge>
            <Text variant="body">{state.message}</Text>
            {state.retryAfterMs !== null ? (
              <Text variant="caption" className="text-text-muted">
                GitHub asked us to wait {Math.ceil(state.retryAfterMs / 1000)}s
                before retrying.
              </Text>
            ) : null}
          </div>
        ) : null}

        {state.status === "populated" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {state.profile.avatarUrl ? (
                <PreviewAvatar src={state.profile.avatarUrl} />
              ) : null}

              <div className="flex flex-col">
                <Text variant="subheading">
                  {state.profile.name ?? state.profile.login}
                </Text>
                <Text variant="caption" className="text-text-muted">
                  @{state.profile.login} · id {state.profile.githubId}
                </Text>
              </div>
            </div>

            {state.profile.bio ? (
              <Text variant="body" className="text-text-secondary">
                {state.profile.bio}
              </Text>
            ) : null}

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Repositories" value={formatCount(state.profile.publicRepos)} />
              <Field label="Gists" value={formatCount(state.profile.publicGists)} />
              <Field label="Followers" value={formatCount(state.profile.followers)} />
              <Field label="Following" value={formatCount(state.profile.following)} />
              <Field label="Joined" value={formatDate(state.profile.createdAt)} />
              <Field label="Updated" value={formatDate(state.profile.updatedAt)} />
              <Field label="Company" value={state.profile.company ?? "—"} />
              <Field label="Location" value={state.profile.location ?? "—"} />
              <Field label="Blog" value={state.profile.blog ?? "—"} />
            </dl>

            {state.profile.profileUrl ? (
              <a
                href={state.profile.profileUrl}
                className="text-label text-accent underline underline-offset-4"
                rel="noreferrer noopener"
                target="_blank"
              >
                View on GitHub
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>

      {state.status === "populated" ? (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="label" className="uppercase text-text-muted">
              Repositories
            </Text>

            {state.observation ? (
              <Badge variant="neutral" size="sm">
                {state.observation.count} found · {state.observation.pages}{" "}
                {state.observation.pages === 1 ? "page" : "pages"}
              </Badge>
            ) : null}

            {/* A capped walk is not a complete one, and saying so is the point
                of TASK 4.3 — the count must never read as authoritative. */}
            {state.observation?.truncated ? (
              <Badge variant="warning" size="sm">
                truncated
              </Badge>
            ) : null}
          </div>

          {state.repositoriesMessage ? (
            <Text variant="body" className="text-text-secondary">
              {state.repositoriesMessage}
            </Text>
          ) : null}

          {state.observation ? (
            <>
              <Text variant="caption" className="text-text-muted">
                {state.observation.count === 0
                  ? "No public repositories."
                  : `Oldest created ${formatDate(state.observation.oldestCreatedAt)} · last push ${formatDate(state.observation.latestActivityAt)}`}
              </Text>

              <ul className="flex flex-col divide-y divide-border">
                {state.observation.repositories.map((repo) => (
                  <RepositoryRow key={repo.repositoryId} repo={repo} />
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      {state.status === "populated" || state.status === "error" ? (
        <Card variant="secondary" className="flex flex-col gap-2">
          <Text variant="label" className="uppercase text-text-muted">
            Rate limit
          </Text>

          <Text variant="caption" className="text-text-secondary">
            {state.rateLimit.remaining === null
              ? "No limit information — GitHub did not send the headers."
              : `${state.rateLimit.remaining} of ${state.rateLimit.limit ?? "?"} requests remaining.`}
          </Text>

          {state.rateLimit.resetsAt ? (
            <Text variant="caption" className="text-text-muted">
              Budget resets at {new Date(state.rateLimit.resetsAt).toLocaleTimeString()}.
            </Text>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

/**
 * The GitHub avatar, rendered with a plain `<img>` on purpose: the host is
 * whatever GitHub returned for that account, and this development screen only
 * previews the URL it was given. Product avatar rendering belongs to `Avatar`
 * (TASKS 2.1), which will configure a remote loader there.
 */
function PreviewAvatar({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={48}
      height={48}
      className="size-(--avatar-size-md) rounded-pill border border-border"
    />
  );
}

/**
 * One repository row.
 *
 * Archived, fork and template states are shown rather than hidden: TASKS 4.3
 * requires them to survive ingestion, so a reviewer has to be able to see that
 * they did. The chips are `Badge` tones, not product rarity — nothing here is
 * scored, so nothing here claims a repository is worth anything.
 */
function RepositoryRow({ repo }: { repo: PreviewRepository }) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text variant="subheading">
          {repo.url ? (
            <a
              href={repo.url}
              className="transition-colors duration-(--motion-fast) ease-standard hover:text-accent motion-reduce:transition-none"
              rel="noreferrer noopener"
              target="_blank"
            >
              {repo.fullName}
            </a>
          ) : (
            repo.fullName
          )}
        </Text>

        {repo.isArchived ? (
          <Badge variant="warning" size="sm">
            Archived
          </Badge>
        ) : null}
        {repo.isFork ? (
          <Badge variant="neutral" size="sm">
            Fork
          </Badge>
        ) : null}
        {repo.isTemplate ? (
          <Badge variant="neutral" size="sm">
            Template
          </Badge>
        ) : null}
      </div>

      {repo.description ? (
        <Text variant="body" className="text-text-secondary">
          {repo.description}
        </Text>
      ) : null}

      <Text variant="caption" className="text-text-muted">
        id {repo.repositoryId} · {repo.primaryLanguage ?? "no language"} ·{" "}
        {formatCount(repo.stars)} stars · created {formatDate(repo.createdAt)} ·
        last push {formatDate(repo.pushedAt)}
      </Text>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body">{value}</dd>
    </div>
  );
}