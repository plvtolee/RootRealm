import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import { Text } from "@/components/ui/text";

/**
 * Rendered per request, not prerendered.
 *
 * Not a performance choice — a correctness one. `proxy.ts` mints a fresh CSP
 * nonce on every request, and Next.js can only attach a nonce to a script while
 * rendering it. A page prerendered at build time has no nonce available, so its
 * inline RSC payload scripts carry none and the Content-Security-Policy blocks
 * them: verified in the browser console, where two inline scripts were rejected
 * and every script tag on the page had no `nonce` attribute.
 *
 * Do not "optimise" this away. `e2e/security.e2e.ts` fails without it.
 */
export const dynamic = "force-dynamic";

/**
 * Home — the landing page.
 *
 * ```text
 * a visitor with no account → what RootRealm is, and one click to see it work
 * ```
 *
 * ## Why this replaced the shell placeholder
 *
 * It said "Application shell", carried a "Phase 1" badge, and told the reader the
 * screens "arrive with Phase 2". They arrived a long time ago. This was the first
 * thing anyone saw of the product, and it described a scaffold rather than the
 * thing itself.
 *
 * ## What this page will not do
 *
 * **It will not claim anything it cannot show.** No invented user counts, no
 * "trusted by developers", no sample XP totals. Every number in this product has
 * to come from a real developer's real activity, and a landing page that opens
 * with invented numbers makes the whole product look like it does.
 *
 * **It will not hide the catch.** Progression is recomputed from public GitHub
 * activity on every visit, and anyone can look up any public profile without an
 * account. Both are stated, because both are true and both are what a careful
 * visitor would otherwise have to discover for themselves.
 *
 * ## Why the primary action is a lookup, not a sign-up
 *
 * `/preview` needs no account, no OAuth app and no configuration, and it runs the
 * real ingestion and scoring against live GitHub. Asking a stranger to sign in
 * before they have seen anything is the wrong first question; "type a username"
 * lets them see the product in one step and decide afterwards.
 *
 * @see docs/PRD.md §1 — what the product is.
 */
export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      {/* --- The pitch ------------------------------------------------- */}
      <header className="flex flex-col items-start gap-4">
        <Badge variant="neutral">Public beta</Badge>

        <Text as="h1" variant="display" className="text-text-primary">
          Your GitHub history, as a character
        </Text>

        <Text variant="body" className="max-w-prose text-text-secondary">
          RootRealm turns a GitHub profile into an RPG character. Merged pull
          requests, shipped releases, reviews and documentation become XP. Six
          attributes grow with the work. A skill tree unlocks on real evidence,
          achievements record consistency, and a season leaderboard ranks you
          against other developers.
        </Text>

        {/*
          Both actions work with no account. That is a product fact, not a
          courtesy: `/preview` is the real ingestion path, and sign-in only adds
          progression and cosmetics on top.
        */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link href="/preview">
            <Button size="lg">Look up a profile</Button>
          </Link>
          <Link href="/api/auth/github">
            <Button size="lg" variant="secondary">
              Sign in with GitHub
            </Button>
          </Link>
        </div>

        <Text variant="caption" className="text-text-muted">
          No account needed to look up a profile. Sign-in adds your own character,
          purchases and season standing.
        </Text>
      </header>

      <Divider />

      {/* --- What it measures ------------------------------------------ */}
      <section aria-labelledby="what-it-reads" className="flex flex-col gap-4">
        <Text
          as="h2"
          variant="heading"
          id="what-it-reads"
          className="text-text-primary"
        >
          What it reads
        </Text>

        <Text variant="body" className="max-w-prose text-text-secondary">
          Four kinds of public activity, and nothing else. A push is recorded as
          a push rather than as a commit, because GitHub does not tell us how many
          commits a push contained.
        </Text>

        <div className="grid gap-4 sm:grid-cols-2">
          <SourceCard
            title="Pull requests"
            detail="Merges score, reviews score, and the ledger explains every award."
          />
          <SourceCard
            title="Releases"
            detail="Publishing a version is tracked separately from the commits behind it."
          />
          <SourceCard
            title="Reviews and documentation"
            detail="Reviewing someone else's work counts as work, and so does writing it down."
          />
          <SourceCard
            title="Pushes"
            detail="Code that landed. Counted as pushes, never as commits we cannot see."
          />
        </div>
      </section>

      <Divider />

      {/* --- What you get ---------------------------------------------- */}
      <section aria-labelledby="what-you-get" className="flex flex-col gap-4">
        <Text
          as="h2"
          variant="heading"
          id="what-you-get"
          className="text-text-primary"
        >
          What you get
        </Text>

        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            title="A skill tree you have to earn"
            detail="Every node has real prerequisites. The cheapest path to the next unlock is shown to you."
            href="/skill-tree"
            linkLabel="Open the skill tree"
          />
          <FeatureCard
            title="A record of consistency"
            detail="Achievements track the habits that compound — reviewing, documenting, shipping steadily."
            href="/achievements"
            linkLabel="Browse achievements"
          />
          <FeatureCard
            title="A season to compete in"
            detail="Rank points are separate from XP and exist only inside one season, so the ladder keeps moving."
            href="/leaderboard"
            linkLabel="See the season"
          />
        </div>
      </section>

      <Divider />

      {/*
        The honest footer. Both facts here are limitations as much as features,
        and a product that computes from public data should say so plainly rather
        than let a visitor wonder whether something is being collected.
      */}
      <section aria-labelledby="how-it-works" className="flex flex-col gap-3">
        <Text
          as="h2"
          variant="heading"
          id="how-it-works"
          className="text-text-primary"
        >
          How it works
        </Text>

        <Text variant="body" className="max-w-prose text-text-secondary">
          Progression is recomputed from public GitHub activity each time you look.
          Nothing is stored unless you sign in, any public profile can be looked up
          by anyone, and the GitHub token RootRealm uses is never given scopes.
        </Text>

        <Text variant="caption" className="text-text-muted">
          When GitHub withholds something — a missing line count on a pull request
          looks exactly like a pull request that changed nothing — the profile says
          so rather than reading the gap as a fact.
        </Text>
      </section>
    </div>
  );
}

/** One of the activity kinds that becomes progression. */
function SourceCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className="flex flex-col gap-2">
      <Text as="h3" variant="subheading" className="text-text-primary">
        {title}
      </Text>
      <Text variant="body" className="text-text-secondary">
        {detail}
      </Text>
    </Card>
  );
}

/** One of the systems, linking to the screen that shows it. */
function FeatureCard({
  title,
  detail,
  href,
  linkLabel,
}: {
  title: string;
  detail: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <Card className="flex flex-col items-start gap-3">
      <Text as="h3" variant="subheading" className="text-text-primary">
        {title}
      </Text>
      <Text variant="body" className="text-text-secondary">
        {detail}
      </Text>
      <Link
        href={href}
        className="mt-auto inline-flex min-h-(--control-height-md) items-center text-label text-accent underline underline-offset-4 transition-colors duration-(--motion-fast) ease-standard hover:opacity-80 motion-reduce:transition-none"
      >
        {linkLabel}
      </Link>
    </Card>
  );
}