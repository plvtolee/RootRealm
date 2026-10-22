import type { Metadata } from "next";

import SkillTreeGate from "@/components/skill-tree/skill-tree-gate";

export const metadata: Metadata = {
  title: "Skill tree",
};

/**
 * Skill tree — the developer's own evidence (TASKS 6.1, 6.6).
 *
 * The route stays thin: it selects the gate, which resolves the session and hands
 * the screen its `events`, `learnedIds` and `attributeTotals` from the shared
 * store. Client-rendered because the session cookie is HttpOnly.
 */
/**
 * Rendered per request so `proxy.ts` can attach the CSP nonce to every script.
 * See the note in `app/page.tsx`.
 */
export const dynamic = "force-dynamic";

export default function SkillTreePage() {
  return <SkillTreeGate />;
}
