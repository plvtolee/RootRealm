import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { accountFromCookieHeader } from "@/lib/auth/guard";
import { safeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = {
  title: "Enter your realm",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const query = await searchParams;
  const rawNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const next = safeNextPath(rawNext);
  const account = await accountFromCookieHeader((await cookies()).toString());

  if (account !== null) redirect(next);

  return <SignInScreen next={next} />;
}
