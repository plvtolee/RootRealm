"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

/**
 * RootRealm — the claim entry point (TASKS 9.3).
 *
 * The guest journey ends with a preview; claiming it makes the preview
 * persistent. This card is the one action that starts that: it sends the browser
 * to `/api/auth/github`, which begins the OAuth flow. Everything past that point
 * is server-side (TASKS 9.1–9.2).
 *
 * ## Why an anchor and not a fetch
 *
 * The OAuth flow is a full-page redirect to GitHub and back. A `fetch` cannot
 * follow a cross-origin redirect to a page meant for the browser, so this is a
 * real link — which also means it works without JavaScript and is reachable by
 * keyboard by default.
 *
 * ## Why it reports `?auth_error`
 *
 * The callback redirects failures back here with a reason. Showing it keeps a
 * failed claim from looking like nothing happened — the same honesty the
 * ingestion screens apply to their error states.
 */

const AUTH_ERROR_COPY: Record<string, string> = {
  not_configured:
    "GitHub sign-in is not configured on this deployment. Set the OAuth environment variables and try again.",
  state_mismatch:
    "That sign-in could not be verified and was cancelled for safety. Please start again.",
  authorization_denied: "You cancelled the authorization on GitHub.",
  exchange_failed: "GitHub could not complete the sign-in. Please try again.",
  malformed_response: "GitHub returned an unexpected response. Please try again.",
  identity_unavailable: "GitHub did not return your identity. Please try again.",
};

export function ClaimProfileCard({ login }: { login?: string }) {
  // Read the reason the callback redirected back with. `window` is defined here
  // because this is a client component, and guarding it keeps the component
  // renderable in a non-browser context (a test) without a Suspense boundary.
  const error =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("auth_error");
  const message = error ? (AUTH_ERROR_COPY[error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <Card as="section" aria-labelledby="claim-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Text variant="heading" as="h2" id="claim-heading">
          Make this profile yours
        </Text>
        <Badge variant="neutral" size="sm">
          Not persisted
        </Badge>
      </div>

      <Text variant="body" className="text-text-secondary">
        Connect GitHub to verify ownership{login ? ` of @${login}` : ""} and turn
        this preview into a persistent RootRealm account. RootRealm requests one
        scope — <code className="font-mono text-text-primary">read:user</code> —
        and reads only public activity.
      </Text>

      {message ? (
        <Text variant="body" className="text-danger">
          {message}
        </Text>
      ) : null}

      {/*
        A real anchor, not a `Button`: the OAuth flow is a full-page
        navigation, and `Button` is always a `<button>` with no `as` escape
        hatch (AGENTS.md primitive rule 3). The classes below are the primary
        control treatment, written out so the link reads as the primary action
        without putting a navigation into a button element.
      */}
      <div>
        <a
          href="/api/auth/github"
          className={cn(
            "inline-flex h-(--control-height-md) items-center justify-center gap-2 whitespace-nowrap select-none",
            "rounded-md px-4 text-label",
            "border border-transparent bg-text-primary text-bg",
            "transition-colors duration-(--motion-fast) ease-standard motion-reduce:transition-none",
            "hover:bg-text-secondary",
          )}
        >
          Connect GitHub
        </a>
      </div>

      <Text variant="caption" className="text-text-muted">
        Verification is handled by GitHub. RootRealm never sees your password.
      </Text>
    </Card>
  );
}