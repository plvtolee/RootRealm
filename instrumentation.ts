/**
 * RootRealm — server instrumentation (TASKS 21.2 and 21.3).
 *
 * ```text
 * a new server instance → the environment is checked before it serves a request
 * ```
 *
 * Next.js calls `register` once when a server instance starts, before it handles
 * its first request (see `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`).
 * That is exactly where TASKS 21.2's "environment validation" belongs: a
 * misconfigured deployment should say so at boot, in one readable block, rather
 * than fail the first request that happens to need the missing value.
 *
 * ## Why this file holds almost nothing
 *
 * Next.js evaluates the instrumentation module in every runtime it supports,
 * including Edge, which has no `process.stdout` and no environment reader. So
 * this file is only the *dispatch*: it imports the Node-only implementation
 * lazily, inside a runtime guard, which is the documented way to keep
 * runtime-specific APIs out of a bundle that cannot use them. Every environment
 * fact — the validation report, the logger — lives in `lib/ops/`, which are the
 * modules that actually need Node.
 *
 * ## Why this does not throw
 *
 * `register` could refuse to start the server when the environment is broken, and
 * for a strict deployment that may be right. It is not what this does, for two
 * reasons:
 *
 * - the app is *designed* to run without OAuth (a guest can preview a profile),
 *   so a deployment with no `GITHUB_OAUTH_*` is valid, not broken;
 * - a hard failure at boot turns every route into a 500 with no page that
 *   explains why, which is harder to diagnose than a server that starts and
 *   reports what is missing.
 *
 * So the report is emitted at `error` when it is not ready and `warn` when it is
 * merely incomplete, and the operator decides. The same judgement is available
 * to CI as a non-throwing function (`validateEnvironment`), which is what makes
 * "verify environment validation" (TASKS 21.2) a check that can actually fail.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./lib/ops/instrumentation-node");
    await registerNode();
  }
}

/**
 * Reports an unhandled server error as a structured line (TASKS 21.3).
 *
 * An unhandled server error is the error that matters most and is otherwise the
 * hardest to find, because React replaces the original error during
 * server-component rendering. Next hands it here with the digest that identifies
 * it. The Node-only work is imported lazily, as in `register`.
 */
export const onRequestError: import("next").Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reportRequestError } = await import("./lib/ops/instrumentation-node");
  reportRequestError(error, request, context);
};