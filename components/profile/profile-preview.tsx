"use client";

import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { errorStateFor, formatRetryDelay, noticesFor } from "@/lib/github/error-states";
import type { CoverageReport } from "@/lib/coverage";
import type { AttributeKey } from "@/lib/attributes";
import { ATTRIBUTE_LABEL } from "@/lib/attributes";
import type { AggregatedProfile } from "@/lib/profile/aggregate";
import type { ProfileExplanation } from "@/lib/profile/service";
import { AttributeSection } from "./attribute-section";
import { FeaturedProjectCard } from "./featured-project-card";
import { RecentAchievements } from "./recent-achievements";

/**
 * RootRealm — public profile preview (TASKS 8.2 and 8.3).
 *
 * ```text
 * GitHub username → real RootRealm profile preview (no login required)
 * ```
 *
 * TASKS 8.2 is the lookup and the real profile it produces; TASKS 8.3 is the
 * transparency layer on top of it. They are one screen because the transparency
 * is only meaningful next to the numbers it explains: showing an XP total
 * without saying which activity produced it, and over what window, is exactly
 * what PRD §10 forbids.
 *
 * ## What it renders from real state
 *
 * Everything scored comes from `/api/github/profile-preview`, which runs the
 * Phase 4 ingestion and the Phase 5 scoring engine. Nothing on this screen is
 * computed here: the numbers are formatted, never derived (DATA_CONTRACT §13).
 *
 * ## What it deliberately does not show
 *
 * - No equipped cosmetics and no quest: those are Phases 12 and 13. The
 *   aggregate returns `null` for both and the screen renders nothing rather than
 *   a mock.
 * - No verified badge: verification is OAuth (TASKS 9.1). A public lookup has
 *   not proved ownership, so the character is `verified: false`.
 */

interface PreviewRateLimit {
  limit: number | null;
  remaining: number | null;
  resetsAt: number | null;
}

interface PreviewPayload {
  preview: {
    profile: AggregatedProfile;
    coverage: CoverageReport;
    explanations: ProfileExplanation[];
    rateLimit: unknown;
  } | null;
  failure: { reason: string; message: string; retryAfterMs: number | null } | null;
  rateLimit: unknown;
}

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "populated"; payload: NonNullable<PreviewPayload["preview"]>; rateLimit: PreviewRateLimit }
  | { status: "error"; reason: string; retryAfterMs: number | null; rateLimit: PreviewRateLimit };

function rateLimitOf(value: unknown): PreviewRateLimit {
  const raw = (value ?? {}) as Partial<PreviewRateLimit>;
  return { limit: raw.limit ?? null, remaining: raw.remaining ?? null, resetsAt: raw.resetsAt ?? null };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export function ProfilePreview() {
  const [username, setUsername] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const lookup = useCallback(async () => {
    const query = username.trim().replace(/^@/, "");
    setState({ status: "loading" });

    try {
      const response = await fetch(
        `/api/github/profile-preview?username=${encodeURIComponent(query)}`,
      );
      const body = (await response.json()) as PreviewPayload;

      if (body.preview) {
        setState({
          status: "populated",
          payload: body.preview,
          rateLimit: rateLimitOf(body.preview.rateLimit ?? body.rateLimit),
        });
        return;
      }

      setState({
        status: "error",
        reason: body.failure?.reason ?? "unexpected_response",
        retryAfterMs: body.failure?.retryAfterMs ?? null,
        rateLimit: rateLimitOf(body.rateLimit),
      });
    } catch {
      setState({
        status: "error",
        reason: "unavailable",
        retryAfterMs: null,
        rateLimit: { limit: null, remaining: null, resetsAt: null },
      });
    }
  }, [username]);

  const busy = state.status === "loading";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col items-start gap-3">
        <Badge variant="neutral">Public preview</Badge>

        <Text variant="label" className="uppercase text-text-secondary">
          RootRealm
        </Text>

        <Text variant="display" as="h1">
          Profile preview
        </Text>

        <Text variant="body" className="max-w-2xl text-text-secondary">
          Enter a GitHub username to see the RootRealm profile its public
          activity produces. No login is required, and nothing is stored.
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
            Preview
          </Button>
        </form>

        <Text variant="caption" className="text-text-muted">
          Try <code className="font-mono">octocat</code> for a valid account or{" "}
          <code className="font-mono">octocat-does-not-exist-404</code> for an
          unknown one.
        </Text>
      </Card>

      {state.status === "idle" ? (
        <Text variant="body" className="text-text-secondary">
          Enter a username to build a preview.
        </Text>
      ) : null}

      {state.status === "loading" ? (
        <Text variant="body" className="text-text-secondary">
          Reading public activity and scoring it...
        </Text>
      ) : null}

      {state.status === "error" ? <PreviewError reason={state.reason} retryAfterMs={state.retryAfterMs} /> : null}

      {state.status === "populated" ? (
        <PreviewBody payload={state.payload} />
      ) : null}
    </div>
  );
}

function PreviewBody({ payload }: { payload: NonNullable<PreviewPayload["preview"]> }) {
  const { profile, coverage, explanations } = payload;
  const character = profile.character;

  const attributes = (Object.keys(ATTRIBUTE_LABEL) as AttributeKey[]).map((key) => ({
    attribute: key,
    label: ATTRIBUTE_LABEL[key],
    value: profile.attributes[key],
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_3fr] lg:gap-x-8">
        <div className="flex flex-col items-start gap-3">
          <Text variant="heading" as="p">
            {character.displayName}
          </Text>
          <Text variant="caption" className="text-text-muted">
            @{character.login}
          </Text>
          {character.bio ? (
            <Text variant="body" className="text-text-secondary">
              {character.bio}
            </Text>
          ) : null}
          {character.location ? (
            <Text variant="caption" className="text-text-secondary">
              {character.location}
            </Text>
          ) : null}
          <Badge variant={character.verified ? "success" : "neutral"} size="sm">
            {character.verified ? "Verified" : "Unverified"}
          </Badge>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <Text variant="heading" as="p" id="preview-level">
                Lv. {profile.progression.level.level}
              </Text>
              <Text variant="body" className="text-text-secondary" id="preview-xp">
                {profile.progression.totalXp.toLocaleString("en-US")} XP
              </Text>
            </div>
            <ProgressBar
              value={profile.progression.level.xpIntoLevel}
              max={profile.progression.level.xpForLevel ?? profile.progression.level.xpIntoLevel}
              aria-labelledby="preview-level preview-xp"
            />
          </div>

          <AttributeSection attributes={attributes} />
        </div>
      </div>

      {profile.featuredRepository ? (
        <FeaturedProjectCard
          project={{
            name: profile.featuredRepository.fullName,
            description: profile.featuredRepository.description ?? "No description.",
            stack: profile.featuredRepository.primaryLanguage ? [profile.featuredRepository.primaryLanguage] : [],
            starsLabel: profile.featuredRepository.stars?.toLocaleString("en-US") ?? "—",
          }}
        />
      ) : null}

      <RecentAchievements
        achievements={profile.achievements.achievements
          .filter((view) => view.earned)
          .slice(0, 4)
          .map((view) => ({ name: view.definition.title, rarity: view.definition.rarity }))}
        moreCount={Math.max(0, profile.achievements.earnedCount - 4)}
      />

      <EvidenceTransparency coverage={coverage} explanations={explanations} />
    </div>
  );
}

/**
 * TASKS 8.3 — the visible explanation layer.
 *
 * The four things the task names, in order: what was observed, how it was
 * scored, where each claim came from, and what it cannot support. The last is
 * the one that matters most: PRD §31 says "no public evidence" must not read as
 * "no work", so the limitations are stated, not hidden.
 */
function EvidenceTransparency({
  coverage,
  explanations,
}: {
  coverage: CoverageReport;
  explanations: readonly ProfileExplanation[];
}) {
  const notices = noticesFor(coverage);
  const eligible = explanations.filter((e) => e.eligible);
  const rejected = explanations.filter((e) => !e.eligible);

  return (
    <section aria-labelledby="transparency-heading" className="flex flex-col gap-4">
      <Text variant="heading" as="h2" id="transparency-heading">
        How this was calculated
      </Text>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Text variant="label" className="uppercase text-text-muted">
            Observed scope
          </Text>
          <Badge variant={coverage.complete ? "success" : "warning"} size="sm">
            {coverage.complete ? "complete" : "bounded"}
          </Badge>
          <Badge variant="neutral" size="sm">
            {coverage.activity.observed} events
          </Badge>
          <Badge variant="neutral" size="sm">
            {coverage.repositories.observed} repositories
          </Badge>
        </div>

        <Text variant="caption" className="text-text-muted">
          Public activity observed {formatDate(coverage.activity.eventWindow.oldest)} –{" "}
          {formatDate(coverage.activity.eventWindow.newest)} · repository walk stopped by{" "}
          <code className="font-mono">{coverage.repositories.pagination.stoppedBy}</code> · activity
          stopped by <code className="font-mono">{coverage.activity.pagination.stoppedBy}</code>
        </Text>

        {coverage.limitations.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Text variant="label" className="uppercase text-text-muted">
              What this cannot support
            </Text>
            <ul className="flex flex-col gap-1">
              {coverage.limitations.map((limitation) => (
                <li key={limitation.code}>
                  <Text variant="caption" className="text-text-muted">
                    {limitation.count} × <code className="font-mono">{limitation.code}</code>
                  </Text>
                  <Text variant="caption" className="text-text-secondary">
                    {limitation.implication}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {notices.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Text variant="label" className="uppercase text-text-muted">
              Worth knowing
            </Text>
            <ul className="flex flex-col gap-2">
              {notices.map((notice) => (
                <li key={notice.kind} className="flex flex-col gap-1">
                  <Text variant="caption" className="text-text-muted">
                    {notice.title}
                  </Text>
                  <Text variant="body" className="text-text-secondary">
                    {notice.message}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Text variant="caption" className="text-text-muted">
          {eligible.length} events scored, {rejected.length} observed but not
          scored. Public activity is incomplete evidence: no public evidence does
          not mean no work.
        </Text>

        {eligible.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {eligible.slice(0, 20).map((explanation) => (
              <ExplanationRow key={explanation.eventId} explanation={explanation} />
            ))}
          </ul>
        ) : null}
      </Card>
    </section>
  );
}

function ExplanationRow({ explanation }: { explanation: ProfileExplanation }) {
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent" size="sm">
          {explanation.classification ?? "unclassified"}
        </Badge>
        <Text variant="caption" className="text-text-secondary">
          +{explanation.xp} XP
        </Text>
        <Text variant="caption" className="text-text-muted">
          {formatDate(explanation.occurredAt)}
        </Text>
      </div>
      <Text variant="caption" className="text-text-secondary">
        {explanation.reason}
      </Text>
      {explanation.sourceUrl ? (
        <a
          href={explanation.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "text-caption text-accent underline underline-offset-4",
            "transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
          )}
        >
          View source on GitHub
        </a>
      ) : (
        <Text variant="caption" className="text-text-disabled">
          No source link was provided by GitHub.
        </Text>
      )}
    </li>
  );
}

function PreviewError({ reason, retryAfterMs }: { reason: string; retryAfterMs: number | null }) {
  const state = errorStateFor(reason as Parameters<typeof errorStateFor>[0], retryAfterMs);
  const delay = formatRetryDelay(retryAfterMs);

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="danger">{state.reason}</Badge>
        {state.retryable ? (
          <Badge variant="neutral" size="sm">
            retryable
          </Badge>
        ) : null}
      </div>
      <Text variant="subheading">{state.title}</Text>
      <Text variant="body" className="text-text-secondary">
        {state.message}
      </Text>
      {state.nextAction ? (
        <Text variant="caption" className="text-text-muted">
          {state.nextAction}
        </Text>
      ) : null}
      {delay ? (
        <Text variant="caption" className="text-text-muted">
          GitHub asked us to wait {delay} before retrying.
        </Text>
      ) : null}
    </Card>
  );
}