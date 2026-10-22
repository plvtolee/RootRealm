"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * RootRealm — the 404 (TASKS 22.4).
 *
 * ```text
 * a URL that names nothing → the same voice as every other screen, plus the two places worth going
 * ```
 *
 * A wrong URL used to reach Next.js's built-in not-found page, which is a bare
 * unstyled document — the one route in the product that looked like it belonged
 * to something else. This is the same shell, the same typography and the same
 * vocabulary as every other failure state.
 *
 * A client component only because the two destinations are navigations. Both are
 * public routes that work with no session and no arguments — the landing page
 * and the login wall. A 404 must never send a signed-out visitor into the app.
 */
export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-4">
      <Text as="h1" variant="heading" className="text-text-primary">
        There is nothing at this address
      </Text>

      <Text as="p" variant="body" className="max-w-prose text-text-secondary">
        The page may have been renamed, or the link that brought you here may be
        out of date. Nothing about your account has changed.
      </Text>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => router.push("/")}>
          Go to the start
        </Button>
        <Button variant="secondary" onClick={() => router.push("/login")}>
          Sign in
        </Button>
      </div>
    </div>
  );
}