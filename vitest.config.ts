import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The `@/` alias is declared once, here, so a test can import a module by the
 * path the application uses. Without it a test has to reach across into
 * `../components/...`, which reads as if components were a different codebase —
 * and it is what made the Phase 17 information-architecture test (17.1) awkward
 * enough to be worth fixing properly.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
  },
});