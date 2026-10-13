"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { serviceLogger } from "@/lib/ops/monitoring";

/**
 * RootRealm — the error boundary (TASKS 22.4).
 *
 * ```text
 * anything the app failed to render → an explanation in the product's own words, and a way out
 * ```
 *
 * ## Why this file exists
 *
 * Without `app/error.tsx` an unhandled render error in *any* route reaches
 * Next.js's production error page — a stack trace in a foreign layout that looks
 * like a different product shipped it. Three gates (profile, skill tree,
 * achievements) each render their own failure state for their own fetch; nothing
 * covered a throw from a server component, a bad route param, or a bug in a
 * screen that has no gate of its own.
 *
 * So this is the backstop, not the strategy. The per-screen gates still handle
 * the failures they can describe specifically — "GitHub did not answer" is more
 * useful than anything said here. This boundary exists for the failures nobody
 * anticipated.
 *
 * ## What it deliberately does not show
 *
 * The message is generic. An error boundary runs on the client for server
 * failures too, so anything specific it printed could be a query, a path, or an
 * identifier. The detail goes to the server log instead — `serviceLogger` with the
 * error's own message, which `lib/ops/logger.ts` redacts by name and by value —
 * and the visitor gets a sentence and two buttons.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // `error.message` is logged, never rendered: see the header note.
    serviceLogger("app").error("render.unhandled", { error: error.message });

    // The development console is the developer's own fastest path to a stack.
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4">
      <Text as="h1" variant="heading" className="text-text-primary">
        Something went wrong
      </Text>

      <Text as="p" variant="body" className="max-w-prose text-text-secondary">
        This screen could not be drawn. Nothing has been lost — your account,
        CodeCoins and progress are stored separately from anything on this page.
      </Text>

      {error.digest !== undefined && (
        <Text as="p" variant="caption" className="text-text-muted">
          Reference: {error.digest}
        </Text>
      )}

      <div className="flex flex-wrap gap-3">
        {/*
          `reset` re-renders the tree rather than reloading the document, so a
          transient failure does not cost a full navigation. The link is the
          escape hatch when reset cannot help — a boundary that only offers
          "try again" strands anyone whose failure is not transient.
        */}
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button variant="secondary" onClick={() => router.push("/")}>
          Go to the start
        </Button>
      </div>
    </div>
  );
}