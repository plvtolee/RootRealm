/**
 * RootRealm — the production configuration check (TASKS 21.1, 21.2).
 *
 * ```bash
 * node scripts/check-environment.ts [--production]
 * ```
 *
 * TASKS 21.2 asks to verify environment validation. The running server validates
 * its environment at boot (see `instrumentation.ts`), but that report is easy to
 * miss in a wall of startup output and impossible to hold a deploy pipeline to.
 * This script produces the same judgement as a process exit code, so a release
 * step can refuse to promote a build whose environment is not ready:
 *
 * - exit `0` — the environment is ready (warnings are allowed, as at boot);
 * - exit `1` — a required variable is missing or unsafe.
 *
 * It never prints a value, only variable names (TASKS 21.1), so it is safe to run
 * where its output is retained.
 *
 * ## Why `--production` is explicit rather than read from `NODE_ENV`
 *
 * A local shell often has no `NODE_ENV`, and a deploy step may forget to set it.
 * Asking for the production judgement explicitly means the strict rules are never
 * applied "by accident of the environment" and never skipped by the same
 * accident. `--production` also selects `.env.production.local` when present, so
 * the check sees what production will see.
 */
import nextEnv from "@next/env";

// `@next/env` is a CommonJS package; Node's ESM loader exposes it through the
// default export rather than as named imports.
const { loadEnvConfig } = nextEnv;

// Load the same `.env*` files Next itself would, for the same environment, so
// the check judges the values the server will actually read.
const production = process.argv.includes("--production");
loadEnvConfig(process.cwd(), !production);

const { validateEnvironment, formatEnvironmentReport } = await import("../lib/ops/config.ts");

const report = validateEnvironment(process.env, { production });

for (const line of formatEnvironmentReport(report)) {
  process.stdout.write(`${line}\n`);
}

if (!report.ok) {
  process.stderr.write(
    `\nEnvironment is not ready: ${report.missing.length > 0 ? report.missing.join(", ") : "see errors above"}.\n`,
  );
  process.exit(1);
}

process.exit(0);