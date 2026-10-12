"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export type DevFundButtonProps = {
  /** Coins to seed the development wallet with. */
  readonly coins?: number;
  readonly label?: string;
  readonly className?: string;
};

/**
 * The development funding control (see `app/api/dev/session`).
 *
 * Shop currency has to come from somewhere for the shop to be reviewable, and
 * the honest source is the earn rules (TASKS 14.3) — a developer clicks their
 * way to a balance. That is slow and not what a review session wants, so this
 * button mints a development session with a funded wallet instead.
 *
 * It is rendered only when `NODE_ENV !== "production"`, and the route it calls
 * 404s in production regardless, so there are two gates: the control is absent
 * from a production build and the endpoint it would call does not exist there.
 */
export function DevFundButton({
  coins = 5_000,
  label = "Fund a development wallet",
  className,
}: DevFundButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  async function fund(): Promise<void> {
    setResult(null);

    const response = await fetch("/api/dev/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "dev-user", coins }),
    });

    const body = (await response.json().catch(() => null)) as
      | { userId?: string; coins?: number; message?: string }
      | null;

    startTransition(() => {
      router.refresh();
      setResult(
        response.ok
          ? `Signed in as ${body?.userId ?? "dev-user"} with ${(body?.coins ?? coins).toLocaleString()} CodeCoins.`
          : (body?.message ?? "The development harness is unavailable."),
      );
    });
  }

  return (
    <div className={className}>
      <Button variant="secondary" size="sm" loading={pending} onClick={() => void fund()}>
        {label}
      </Button>
      <div aria-live="polite" className="mt-2">
        {result ? (
          <Text variant="caption" className="text-text-muted">
            {result}
          </Text>
        ) : null}
      </div>
    </div>
  );
}