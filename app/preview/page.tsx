import type { Metadata } from "next";

import { ProfilePreview } from "@/components/profile/profile-preview";

export const metadata: Metadata = {
  title: "Profile preview",
};

/**
 * Public profile preview — TASKS 8.2 and 8.3.
 *
 * A GitHub username produces a real RootRealm profile with no login. The route
 * stays thin: it renders the client component that calls
 * `/api/github/profile-preview`, where the ingestion, scoring and aggregation
 * happen.
 */
export default function PreviewPage() {
  return <ProfilePreview />;
}