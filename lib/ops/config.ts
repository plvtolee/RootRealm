/**
 * RootRealm — the production environment contract (TASKS 21.1 and 21.2).
 *
 * ```text
 * the variables this process needs, checked before it serves a request
 * ```
 *
 * TASKS 21.1 asks to configure environment variables and 21.2 to *validate* them
 * at startup. Those are the same list read twice: once to say what a deployment
 * must provide, and once to refuse to run without it. The list lives here and both
 * readers use it, so documentation and enforcement cannot drift.
 *
 * ## Why this is a total function over the environment
 *
 * The validator takes `process.env` as an argument rather than reading it. A
 * function that reads the ambient environment cannot be asked "what would happen
 * with production values?" without mutating the process, which is exactly the
 * question a deployment check has to answer. Passing the environment in makes
 * the check testable, and makes the difference between development and
 * production an input rather than a compile-time accident.
 *
 * ## What counts as fatal
 *
 * Only two things stop the server:
 *
 * - a *missing* value the deployment cannot run without; and
 * - a value that is present but cannot be trusted (a session secret too short to
 *   be one).
 *
 * Everything else is a finding, not a refusal. `GITHUB_TOKEN` is genuinely
 * optional — the app runs anonymously at 60 requests/hour — and `DATABASE_URL`
 * is optional while the in-memory store is still in place (Phase 10 wires the
 * driver). Reporting an optional absence as fatal is how a deployment ends up
 * disabling the check to get a release out, and a disabled check protects
 * nothing.
 *
 * ## Never report a value, only a name
 *
 * Every finding carries the variable's *name*. The report is written to the
 * startup log (TASKS 21.3), which leaves the process, and a configuration report
 * that echoes a session secret is a credential leak with extra steps. The
 * `secret` flag exists so a reader can see which absences are sensitive without
 * the module ever holding a value it might be tempted to print.
 */

/** Which concern a variable belongs to, so the report groups by subsystem. */
export type EnvironmentGroup = "runtime" | "auth" | "github" | "database";

/**
 * An environment: a map from variable name to string value.
 *
 * Deliberately this rather than `NodeJS.ProcessEnv`, which narrows `NODE_ENV` to
 * a union of known values. The validator reads strings and nothing else, and a
 * test — or a deployment check for a hypothetical environment — must be able to
 * pass one. `process.env` is assignable to this, so the ambient environment is
 * still the common argument.
 */
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** One variable a RootRealm deployment may be asked to provide. */
export interface EnvironmentVariable {
  readonly name: string;
  readonly group: EnvironmentGroup;
  /** One line describing what it is for, shown in the report and the docs. */
  readonly purpose: string;
  /** Whether the value is a credential the report must never contain. */
  readonly secret: boolean;
}

/**
 * Every variable RootRealm reads, and nothing else.
 *
 * Kept as data rather than as prose in a README because it is consumed: the
 * report below is generated from it, and `lib/ops/config.test.ts` asserts that it
 * stays in step with `.env.example`. A variable added to `.env.example` but not
 * here would be read by no one; one here but not there would be a gap in the
 * deploy instructions.
 */
export const ENVIRONMENT_VARIABLES: readonly EnvironmentVariable[] = [
  {
    name: "SESSION_SECRET",
    group: "auth",
    purpose: "Signs the session cookie. Rotating it invalidates every session.",
    secret: true,
  },
  {
    name: "GITHUB_OAUTH_CLIENT_ID",
    group: "github",
    purpose: "GitHub OAuth app client id; enables signing in with GitHub.",
    secret: false,
  },
  {
    name: "GITHUB_OAUTH_CLIENT_SECRET",
    group: "github",
    purpose: "GitHub OAuth app client secret.",
    secret: true,
  },
  {
    name: "GITHUB_OAUTH_REDIRECT_URI",
    group: "github",
    purpose: "Must match the callback URL registered on the GitHub OAuth app.",
    secret: false,
  },
  {
    name: "GITHUB_TOKEN",
    group: "github",
    purpose: "Optional. Without it ingestion runs anonymously at 60 requests/hour.",
    secret: true,
  },
  {
    name: "DATABASE_URL",
    group: "database",
    purpose: "Optional until Phase 10 wires the driver; the in-memory store is the placeholder.",
    secret: true,
  },
  {
    name: "LOG_LEVEL",
    group: "runtime",
    purpose: "Minimum structured-log level: debug, info, warn or error. Defaults to info.",
    secret: false,
  },
];

/** The three variables that make up the OAuth login cluster. */
export const OAUTH_VARIABLES: readonly string[] = [
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "GITHUB_OAUTH_REDIRECT_URI",
];

/**
 * The shortest session secret that is plausibly one.
 *
 * A secret signs every session; a short one is guessable, and a guessed secret
 * lets an attacker mint a session for any user id. 32 characters is the length of
 * a base64url-encoded 24-byte key, which is what `.env.example` tells an operator
 * to generate.
 */
export const MIN_SESSION_SECRET_LENGTH = 32;

export type EnvironmentSeverity = "error" | "warning" | "info";

/** One thing worth saying about the environment. */
export interface EnvironmentFinding {
  readonly severity: EnvironmentSeverity;
  /** The variable the finding is about, so a deployment screen can link it. */
  readonly variable: string;
  /** A sentence a human can act on. Never contains a value. */
  readonly message: string;
}

/** The environment, judged. */
export interface EnvironmentReport {
  /** True when nothing fatal was found. Warnings do not clear it. */
  readonly ok: boolean;
  /** Whether this was judged as production. */
  readonly production: boolean;
  readonly findings: readonly EnvironmentFinding[];
  /** The names that were present. Names only — never values. */
  readonly configured: readonly string[];
  /** The names that were required and absent. */
  readonly missing: readonly string[];
}

export interface ValidateEnvironmentOptions {
  /** Defaults to `env.NODE_ENV === "production"`. */
  readonly production?: boolean;
}

/** True when a variable holds a non-blank value. */
function isSet(env: EnvironmentVariables, name: string): boolean {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Judges an environment (TASKS 21.1, 21.2).
 *
 * Total: every branch returns a finding or nothing, so a variable cannot be
 * silently unreported. The rules, in order of how much they matter:
 *
 * 1. `SESSION_SECRET` must be present, and long enough to be a secret;
 * 2. the OAuth cluster is all-or-nothing — half a login configuration is worse
 *    than none, because the login button appears and then fails;
 * 3. absent optionals are reported as information, not as problems;
 * 4. production-specific hazards (a localhost callback, no database) are
 *    warnings, because they are real risks rather than configuration errors.
 */
export function validateEnvironment(
  env: EnvironmentVariables = process.env,
  options: ValidateEnvironmentOptions = {},
): EnvironmentReport {
  const production = options.production ?? env.NODE_ENV === "production";
  const findings: EnvironmentFinding[] = [];
  const missing: string[] = [];

  const configured = ENVIRONMENT_VARIABLES.filter((variable) => isSet(env, variable.name)).map(
    (variable) => variable.name,
  );

  // 1. The session secret: the one variable every deployment needs, because
  //    without it no session can be trusted and every mutating route answers 401.
  if (!isSet(env, "SESSION_SECRET")) {
    findings.push({
      severity: "error",
      variable: "SESSION_SECRET",
      message:
        "SESSION_SECRET is not set. Generate one with " +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"`.',
    });
    missing.push("SESSION_SECRET");
  } else if ((env.SESSION_SECRET as string).trim().length < MIN_SESSION_SECRET_LENGTH) {
    findings.push({
      severity: "error",
      variable: "SESSION_SECRET",
      message: `SESSION_SECRET is shorter than ${MIN_SESSION_SECRET_LENGTH} characters and is not a safe signing key.`,
    });
  }

  // 2. OAuth: all three or none. A partial cluster is the dangerous state, so the
  //    missing members are named precisely rather than reported as "not configured".
  const oauthSet = OAUTH_VARIABLES.filter((name) => isSet(env, name));
  if (oauthSet.length > 0 && oauthSet.length < OAUTH_VARIABLES.length) {
    for (const name of OAUTH_VARIABLES) {
      if (isSet(env, name)) continue;
      findings.push({
        severity: "error",
        variable: name,
        message: `${name} is missing, but ${oauthSet[0]} is set. GitHub login needs all three OAuth variables or none.`,
      });
      missing.push(name);
    }
  } else if (oauthSet.length === 0) {
    findings.push({
      severity: "info",
      variable: "GITHUB_OAUTH_CLIENT_ID",
      message:
        "GitHub login is not configured. Guests can still look up a public profile; signing in returns 503.",
    });
  }

  // 3. Optionals. Presence is the whole point of these findings, so they are
  //    information rather than problems.
  if (!isSet(env, "GITHUB_TOKEN")) {
    findings.push({
      severity: "info",
      variable: "GITHUB_TOKEN",
      message:
        "GITHUB_TOKEN is not set: ingestion runs anonymously at 60 requests/hour. Set it for 5000.",
    });
  }

  if (!isSet(env, "DATABASE_URL")) {
    findings.push({
      severity: production ? "warning" : "info",
      variable: "DATABASE_URL",
      message: production
        ? "DATABASE_URL is not set: accounts and wallets live in memory and are lost on restart."
        : "DATABASE_URL is not set; the in-memory store is in use (expected until Phase 10).",
    });
  }

  // 4. Production hazards.
  if (production && isSet(env, "GITHUB_OAUTH_REDIRECT_URI")) {
    const redirect = (env.GITHUB_OAUTH_REDIRECT_URI as string).trim();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/i.test(redirect)) {
      findings.push({
        severity: "warning",
        variable: "GITHUB_OAUTH_REDIRECT_URI",
        message:
          "GITHUB_OAUTH_REDIRECT_URI points at localhost. GitHub will refuse the callback for a deployed host.",
      });
    }
  }

  const ok = !findings.some((finding) => finding.severity === "error");

  return { ok, production, findings, configured, missing };
}

/**
 * Renders a report as lines for a human.
 *
 * Names and sentences only. The report is safe to print, which is the property
 * that lets the startup log and the CI check share it without a redaction step
 * they could forget.
 */
export function formatEnvironmentReport(report: EnvironmentReport): string[] {
  const lines: string[] = [
    `RootRealm environment check (${report.production ? "production" : "development"}) — ${report.ok ? "READY" : "NOT READY"}`,
    `  configured: ${report.configured.length > 0 ? report.configured.join(", ") : "(none)"}`,
  ];

  if (report.missing.length > 0) {
    lines.push(`  missing:    ${report.missing.join(", ")}`);
  }

  for (const severity of ["error", "warning", "info"] as const) {
    for (const finding of report.findings.filter((entry) => entry.severity === severity)) {
      lines.push(`  ${severity.padEnd(7)} ${finding.variable}: ${finding.message}`);
    }
  }

  return lines;
}