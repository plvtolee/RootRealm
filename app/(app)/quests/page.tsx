import type { Metadata } from "next";

import QuestsGate from "@/components/quests/quests-gate";

export const metadata: Metadata = {
  title: "Quests",
};

/**
 * Rendered per request so `proxy.ts` can attach the CSP nonce to every script.
 * See the note in `app/page.tsx`.
 */
export const dynamic = "force-dynamic";

export default function QuestsPage() {
  return <QuestsGate />;
}
