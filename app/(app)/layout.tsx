import { headers } from "next/headers";
import type { ReactNode } from "react";

import { SessionProvider } from "@/components/auth/session-provider";
import { ProfileProvider } from "@/components/profile/profile-store";
import { requireAccount } from "@/lib/auth/guard";
import { safeNextPath } from "@/lib/auth/next-path";

export const dynamic = "force-dynamic";

/**
 * The server boundary for account-backed screens.
 *
 * Route groups do not affect public URLs, so `/profile`, `/quests`, and the
 * other product routes retain their existing links while sharing one guard and
 * one client-side session/profile context.
 */
export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const pathname = safeNextPath(requestHeaders.get("x-rootrealm-pathname"));
  const account = await requireAccount(pathname);

  return (
    <SessionProvider account={account}>
      <ProfileProvider login={account.login}>{children}</ProfileProvider>
    </SessionProvider>
  );
}
