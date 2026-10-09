import type { Metadata } from "next";

import { GitHubPreview } from "@/components/github/github-preview";

export const metadata: Metadata = {
  title: "GitHub ingestion preview",
  robots: { index: false, follow: false },
};

/**
 * GitHub ingestion preview — the manual review surface for TASKS 4.1 and 4.2.
 *
 * It is a development harness on a real route rather than a component story,
 * because the code under test is server-only: a browser needs a server boundary
 * to exercise at all. The screen is excluded from search indexing and is not a
 * primary navigation destination — it is reached from the Development card on
 * the Home screen; see components/github/github-preview.tsx.
 */
export default function GitHubPreviewPage() {
  return <GitHubPreview />;
}