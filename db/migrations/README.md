# Migrations (TASKS 10.1)

These `.sql` files are **generated** from `lib/db/schema.ts`. Do not edit them by
hand — edit the model and regenerate:

```bash
node scripts/generate-migrations.ts
```

The model is the source of truth because it can be checked: `lib/db/schema.test.ts`
asserts that every foreign key resolves, every referenced column is unique, and
every table belongs to a migration. A hand-written `.sql` file cannot be held to
any of those rules until a database rejects it in production.

Apply them with the runner in `lib/db/migrate.ts`, which records what it applied
in `schema_migrations` so a second boot is a no-op:

```ts
import { Pool } from "pg";
import { runMigrations } from "@/lib/db/migrate";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runMigrations({ migrator: pool });
```

`runMigrations` takes any object with `query(sql)`, so the same runner works with
`pg`, `postgres.js` or Supabase's client. No driver is a dependency of this
repository yet; the deployment target (TASKS 10.1) chooses one.