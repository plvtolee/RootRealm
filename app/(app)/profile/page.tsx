import type { Metadata } from "next";

import ProfileGate from "@/components/profile/profile-gate";

export const metadata: Metadata = {
  title: "Profile",
};

/**
 * Profile — the developer's own character (TASKS 2.1 presentation, TASKS 8.1 data).
 *
 * The route stays thin: it selects the gate component and hands it to the
 * rendering. Everything the profile shows is computed server-side from the same
 * normalized evidence the skill tree and the achievement screen read, which is
 * what stops the three from disagreeing — the failure this route used to have,
 * when it rendered a static Phase 2 object while a live lookup showed real numbers.
 *
 * It is a client component because the session cookie is HttpOnly: resolving
 * *whose* character to load is a request, not a server render.
 */
/**
 * Rendered per request so `proxy.ts` can attach the CSP nonce to every script.
 * See the note in `app/page.tsx`.
 *
 * Also correct on its own terms: this screen is about the *signed-in*
 * developer's character, which is per-session by definition.
 */
export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return <ProfileGate />;
}
