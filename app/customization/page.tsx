import type { Metadata } from "next";

import { CustomizationScreen } from "@/components/customization/customization-screen";

export const metadata: Metadata = {
  title: "Customization",
};

export default function CustomizationPage() {
  return <CustomizationScreen />;
}
