/**
 * RootRealm — typed GitHub REST payload shapes (TASKS 4.1 "typed
 * responses").
 *
 * These describe the *raw* API responses, not RootRealm domain types. The
 * canonical `DeveloperEvent` (DATA_CONTRACT) is produced later, by
 * normalization (TASKS 4.5) — nothing here may import from the domain layer,
 * so ingestion stays testable in isolation from scoring.
 *
 * Fields are nullable rather than optional where GitHub can legitimately omit
 * or null them, and every field RootRealm does not read is simply absent.
 */

import {
  arr,
  bool,
  num,
  obj,
  str,
  timestamp,
  type Shape,
} from "./validate";

/** `GET /users/{username}` — the fields TASKS 4.2 needs. */
export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string | null;
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
  /** Present only for site administrators; never relied upon. */
  type: string | null;
  siteAdmin: boolean;
}

export function parseUser(value: unknown, path: string): GitHubUser {
  const raw = obj(value, path);
  return {
    login: str(raw, "login", path, { required: true }) as string,
    id: num(raw, "id", path, { required: true }) as number,
    name: str(raw, "name", path),
    avatarUrl: str(raw, "avatar_url", path),
    htmlUrl: str(raw, "html_url", path),
    bio: str(raw, "bio", path),
    company: str(raw, "company", path),
    location: str(raw, "location", path),
    blog: str(raw, "blog", path),
    publicRepos: num(raw, "public_repos", path),
    publicGists: num(raw, "public_gists", path),
    followers: num(raw, "followers", path),
    following: num(raw, "following", path),
    createdAt: timestamp(raw, "created_at", path),
    updatedAt: timestamp(raw, "updated_at", path),
    type: str(raw, "type", path),
    siteAdmin: bool(raw, "site_admin", path) ?? false,
  };
}

/** `GET /users/{username}/repos` — the fields TASKS 4.3 needs. */
export interface GitHubRepository {
  /** Stable numeric id; survives renames, unlike `fullName`. */
  id: number;
  /** `owner/name` at fetch time. */
  fullName: string;
  ownerLogin: string;
  name: string;
  description: string | null;
  htmlUrl: string | null;
  language: string | null;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  isTemplate: boolean;
  stars: number | null;
  forks: number | null;
  watchers: number | null;
  openIssues: number | null;
  sizeKb: number | null;
  topics: string[];
  license: string | null;
  defaultBranch: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
}

export function parseRepository(value: unknown, path: string): GitHubRepository {
  const raw = obj(value, path);
  const owner = obj(raw.owner, `${path}.owner`);
  const license = raw.license === null || raw.license === undefined
    ? null
    : obj(raw.license, `${path}.license`);

  return {
    id: num(raw, "id", path, { required: true }) as number,
    fullName: str(raw, "full_name", path, { required: true }) as string,
    ownerLogin: str(owner, "login", `${path}.owner`, { required: true }) as string,
    name: str(raw, "name", path, { required: true }) as string,
    description: str(raw, "description", path),
    htmlUrl: str(raw, "html_url", path),
    language: str(raw, "language", path),
    fork: bool(raw, "fork", path) ?? false,
    // Preserved verbatim: archived repositories still count as observed work
    // and must not be silently filtered (TASKS 4.3).
    archived: bool(raw, "archived", path) ?? false,
    disabled: bool(raw, "disabled", path) ?? false,
    isTemplate: bool(raw, "is_template", path) ?? false,
    stars: num(raw, "stargazers_count", path),
    forks: num(raw, "forks_count", path),
    watchers: num(raw, "watchers_count", path),
    openIssues: num(raw, "open_issues_count", path),
    sizeKb: num(raw, "size", path),
    topics: Array.isArray(raw.topics)
      ? raw.topics.filter((topic): topic is string => typeof topic === "string")
      : [],
    license: license === null ? null : str(license, "spdx_id", `${path}.license`),
    defaultBranch: str(raw, "default_branch", path),
    createdAt: timestamp(raw, "created_at", path),
    updatedAt: timestamp(raw, "updated_at", path),
    pushedAt: timestamp(raw, "pushed_at", path),
  };
}

/** One entry of `GET /users/{username}/events`. */
export interface GitHubEvent {
  /** GitHub's own event id — unique per event, unlike `payload.id`. */
  id: string;
  type: string;
  /** Public visibility of the event; only `Public` is ever ingested. */
  public: boolean;
  createdAt: string | null;
  actorLogin: string | null;
  actorAvatarUrl: string | null;
  repoId: number | null;
  repoFullName: string | null;
  /**
   * The raw `payload` object, untyped by design. Its shape is per-event-type
   * and GitHub has changed it before; normalization (TASKS 4.5) reads it
   * defensively rather than trusting a fixed schema here.
   */
  payload: Shape;
}

export function parseEvent(value: unknown, path: string): GitHubEvent {
  const raw = obj(value, path);
  const actor = raw.actor === null || raw.actor === undefined
    ? null
    : obj(raw.actor, `${path}.actor`);
  const repo = raw.repo === null || raw.repo === undefined
    ? null
    : obj(raw.repo, `${path}.repo`);

  return {
    id: str(raw, "id", path, { required: true }) as string,
    type: str(raw, "type", path, { required: true }) as string,
    public: bool(raw, "public", path) ?? false,
    createdAt: timestamp(raw, "created_at", path),
    actorLogin: actor === null ? null : str(actor, "login", `${path}.actor`),
    actorAvatarUrl: actor === null ? null : str(actor, "avatar_url", `${path}.actor`),
    repoId: repo === null ? null : num(repo, "id", `${path}.repo`),
    repoFullName: repo === null ? null : str(repo, "name", `${path}.repo`),
    payload:
      raw.payload === null || raw.payload === undefined
        ? {}
        : obj(raw.payload, `${path}.payload`),
  };
}

/** Parses a JSON array with `parse`, reporting the offending index. */
export function parseEach<T>(
  value: unknown,
  path: string,
  parse: (entry: unknown, path: string) => T,
): T[] {
  return arr(value, path).map((entry, index) => parse(entry, `${path}[${index}]`));
}

export function parseRepositoryList(
  value: unknown,
  path: string,
): GitHubRepository[] {
  return parseEach(value, path, parseRepository);
}

export function parseEventList(value: unknown, path: string): GitHubEvent[] {
  return parseEach(value, path, parseEvent);
}