/**
 * RootRealm — the Node.js half of server instrumentation (TASKS 21.2, 21.3).
 *
 * The entry file `instrumentation.ts` is evaluated in every runtime Next.js
 * supports, so it holds no runtime-specific API and delegates the real work to
 * this module from inside a `NEXT_RUNTIME === "nodejs"` guard. That is the
 * documented pattern (`node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`),
 * and it is what keeps `process.stdout`, `process.stderr` and the environment
 * reader out of an edge bundle that cannot run them.
 *
 * See `instrumentation.ts` for why the environment report does not throw and
 * what `onRequestError` is for.
 */
import { createLogger, errorFields } from "./logger";
import { formatEnvironmentReport, validateEnvironment } from "./config";

/** Runs once at server start, before the first request is handled. */
export async function registerNode(): Promise<void> {
  const report = validateEnvironment();
  const logger = createLogger({ service: "startup" });

  if (!report.ok) {
    logger.error("startup.environment_invalid", {
      production: report.production,
      missing: report.missing,
      configured: report.configured,
    });
  } else if (report.findings.some((finding) => finding.severity === "warning")) {
    logger.warn("startup.environment_incomplete", {
      production: report.production,
      configured: report.configured,
    });
  } else {
    logger.info("startup.environment_ready", {
      production: report.production,
      configured: report.configured,
    });
  }

  // The human-readable form goes to stderr, so a platform that captures only the
  // error stream still shows a readable diagnosis next to the JSON line.
  for (const line of formatEnvironmentReport(report)) {
    process.stderr.write(`${line}\n`);
  }
}

/**
 * Reports an unhandled server error as a structured line.
 *
 * The path is emitted without its query string: a query can carry a login or a
 * search term, and the logger's value redaction would not catch an arbitrary
 * personal value the way it catches a known credential. The route path is the
 * part that identifies where the error happened.
 */
export function reportRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string; routerKind: string },
): void {
  const logger = createLogger({ service: "server" });
  const [pathname] = request.path.split("?");

  logger.error("server.request_error", {
    method: request.method,
    path: pathname,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    ...errorFields(error),
  });
}