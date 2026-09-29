import type { Metadata } from "next";

import { RoutePlaceholder } from "../_components/route-placeholder";

export const metadata: Metadata = {
  title: "Shop",
};

/**
 * Shop — the Task 1.5 navigation placeholder. The cosmetic marketplace
 * arrives with Phase 2.
 */
export default function ShopPage() {
  return (
    <RoutePlaceholder
      title="Shop"
      note="This route exists so the navigation has a destination with a verifiable active state. The shop itself arrives with Phase 2."
    />
  );
}