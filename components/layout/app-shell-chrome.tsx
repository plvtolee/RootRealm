"use client";

import { usePathname } from "next/navigation";

import { BottomNavigation } from "./bottom-navigation";
import { TopNavigation } from "./top-navigation";

const PROTECTED_ROOTS = [
  "/home",
  "/skill-tree",
  "/achievements",
  "/quests",
  "/shop",
  "/customization",
  "/profile",
  "/leaderboard",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/** Application navigation is mounted only for authenticated app routes. */
export function AppShellChrome() {
  const pathname = usePathname();

  if (!isProtectedPath(pathname)) {
    return null;
  }

  return (
    <>
      <TopNavigation />
      <BottomNavigation />
    </>
  );
}
