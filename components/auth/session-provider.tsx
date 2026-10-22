"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Account } from "@/lib/auth/account";

export type SessionContextValue = {
  readonly status: "loading" | "ready";
  readonly userId: string | null;
  readonly login: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
};

const EMPTY_SESSION: SessionContextValue = {
  status: "loading",
  userId: null,
  login: null,
  displayName: null,
  avatarUrl: null,
};

const SessionContext = createContext<SessionContextValue>(EMPTY_SESSION);

/** Supplies the account resolved by the protected server layout. */
export function SessionProvider({ account, children }: { account: Account; children: ReactNode }) {
  const value = useMemo<SessionContextValue>(
    () => ({
      status: "ready",
      userId: account.id,
      login: account.login,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
    }),
    [account],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Shared session identity for all protected client screens. */
export function useSessionLogin(): SessionContextValue {
  return useContext(SessionContext);
}
