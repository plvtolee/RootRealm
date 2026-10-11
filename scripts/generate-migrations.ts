/**
 * Renders the schema model in `lib/db/schema.ts` to SQL migration files.
 *
 * ```text
 * pnpm/node scripts/generate-migrations.ts
 * ```
 *
 * The model is the source of truth and the SQL is generated, not the other way
 * round, for the same reason the rest of this project keeps computation in one
 * place: a hand-written `.sql` file and a typed model drift, and the drift is
 * only discovered in production. Run this after changing the model; the test
 * suite fails if a table has no migration, so a forgotten run is caught locally.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Node runs this file directly (v22.6+ strips types). The `.ts` extension is
// required for Node's ESM resolver and is the one place this project needs it,
// so it is excluded from the TypeScript build rather than weakening `tsconfig`.
import { MIGRATIONS, renderMigration } from "../lib/db/schema.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "db", "migrations");

await mkdir(outDir, { recursive: true });

for (const migration of MIGRATIONS) {
  const path = join(outDir, `${migration.id}.sql`);
  await writeFile(path, renderMigration(migration), "utf8");
  console.log(`wrote ${path}`);
}