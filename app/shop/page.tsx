import type { Metadata } from "next";

import { ShopScreen } from "@/components/shop/shop-screen";

export const metadata: Metadata = {
  title: "Shop",
};

export default function ShopPage() {
  return <ShopScreen />;
}