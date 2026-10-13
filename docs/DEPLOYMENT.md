# RootRealm — Deployment

This document is TASKS 21.1 (production environment), 21.2 (production build),
21.3 (monitoring) and 21.4 (recovery). It describes how RootRealm is deployed,
how to tell whether a deployment is healthy, and what to do when it is not.

Everything here is checked against the code. Where a piece is intentionally not
built yet — the database driver, until the deployment target is chosen — it is
called out as a marker rather than described as if it existed.

---

## 1. Production environment (TASK 21.1)

### 1.1 Application hosting

RootRealm is a Next.js 16 application deployed as a **Node.js server**. It needs a
long-running Node process, not a static host: the API routes read secrets, hold a
server-side GitHub token and issue signed cookies, none of which a static export
can do.

```bash
npm ci          # install exactly what the lockfile pins
npm run build   # next build
npm run start   # next start — serves on $PORT (default 3000)
```

Any platform that runs a Node server works (Railway, Render, Fly.io, a container,
a VM). The requirements are a Node 24 runtime, `PORT` provided by the platform,
and the environment variables in §1.3.

To ship a minimal image, `next.config.ts` can set `output: "standalone"`, which
emits `.next/standalone/server.js` — a server that runs without `node_modules`.
This is deliberately **not** enabled by default: standalone output omits `public/`
and `.next/static/`, which must then be served by a CDN or copied in by hand, and
that trade belongs to the chosen platform rather than to this repository. See
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`.

Whatever the platform, the health check should be `GET /` — a 200 means the route
tree, the design tokens and the server all loaded.

### 1.2 Database — Supabase

The deployment target is **Supabase**, reached over `pg`. The decision that was
deferred while the target was unchosen has been made, and the schema model, the
migration runner, both stores and the bootstrap script are all in place.

```bash
npm run db:migrate
```

That applies every migration in `lib/db/schema.ts` and seeds the catalogues the
foreign keys depend on. It is idempotent, so a deploy can run it on every release.

**What is wired:**

| file | role |
| --- | --- |
| `lib/db/postgres.ts` | the pooled `pg` client, shared on `globalThis` so Next's per-route bundles do not each open one |
| `lib/db/account-store.ts` | `AccountStore` on the `users` table |
| `lib/db/wallet-store.ts` | `WalletStore` on `currency_transactions` and `inventory_items` |
| `lib/db/stores.ts` | chooses PostgreSQL when `DATABASE_URL` is set, in-memory otherwise |
| `lib/db/seed.ts` | writes the cosmetic and scoring catalogues |
| `scripts/migrate.ts` | the deploy-time bootstrap |

**Connection string.** Take the *Session pooler* string from the Supabase
dashboard (Project Settings → Database → Connection string → **Session pooler**,
port 5432) and append `?sslmode=no-verify`:

```
postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=no-verify
```

**Why `no-verify` and not `verify-full`.** The pooler's certificate is issued by
*Supabase Intermediate 2021 CA*, a private CA that is not in Node's bundled trust
store. `verify-full` therefore fails against the **real** Supabase server with
"self-signed certificate in certificate chain" — this was checked by reading the
certificate the server actually presents, and it is genuinely
`*.pooler.supabase.com` rather than a TLS-intercepting proxy.

`no-verify` still encrypts the connection (`pg` maps it to
`rejectUnauthorized: false`); it does not authenticate the server, which is the
residual man-in-the-middle risk. Supabase's pooler imposes this choice, and the
alternative — adding their CA to the Node trust store via `NODE_EXTRA_CA_CERTS` —
is only worth it if the connection crosses a network you do not control. Note that
nothing in the code sets `ssl`, because that would silently override whatever the
string says.

**What is still in memory, and why it is not a bug yet.** `DATABASE_URL` unset —
a laptop, the test suite — uses the in-memory stores, so a restart loses
accounts and wallets. With it set, both stores are PostgreSQL and both persist.
The choice is deliberately not configurable: a "force in-memory" switch in
production would silently lose every purchase on a restart.

**Atomic purchases.** `lib/db/wallet-store.ts` runs the read-decide-write of a
purchase inside one transaction (`withTransaction`), so two concurrent purchases
cannot both pass the balance check. The spend and the grant share it, which is
what makes "paid but not owned" unreachable.

### 1.3 Environment variables

The full contract is `ENVIRONMENT_VARIABLES` in `lib/ops/config.ts`, and it must
stay in step with `.env.example` — a test (`lib/ops/config.test.ts`) fails if the
two disagree. Summary:

| variable | required | secret | purpose |
| --- | --- | --- | --- |
| `SESSION_SECRET` | **yes** | yes | Signs the session cookie. ≥ 32 chars. Rotating it invalidates every session. |
| `GITHUB_OAUTH_CLIENT_ID` | cluster | no | GitHub OAuth app id; enables sign-in. |
| `GITHUB_OAUTH_CLIENT_SECRET` | cluster | yes | GitHub OAuth app secret. |
| `GITHUB_OAUTH_REDIRECT_URI` | cluster | no | Must match the callback URL registered on the OAuth app. |
| `GITHUB_TOKEN` | optional | yes | Ingestion budget: anonymous is 60 req/h, a token is 5000. |
| `DATABASE_URL` | optional | yes | The migration runner's connection string (§1.2). |
| `LOG_LEVEL` | optional | no | `debug` / `info` / `warn` / `error`. Defaults to `info`. |

The three OAuth variables are a **cluster**: set all three or none. Half a login
configuration is worse than none, because the sign-in button appears and then
fails — so a partial cluster is reported as an error, not a warning.

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 1.4 GitHub integration

RootRealm talks to GitHub for two independent things, and they are configured
separately on purpose:

**OAuth sign-in (TASK 9.1).** Create an OAuth app at
<https://github.com/settings/developers> → "New OAuth App". The callback URL must
equal `GITHUB_OAUTH_REDIRECT_URI` exactly. RootRealm requests exactly one scope,
`read:user`, which reads the authenticated login and nothing else — it cannot read
repository contents or private events, which is the strongest form of "we cannot
leak private data". See `lib/auth/oauth.ts`.

**Read-only ingestion (TASK 4.1).** A classic personal access token with **no
scopes** covers public read-only data, which is all this app uses. Do **not**
grant `repo`, `workflow` or any write scope. The token is read only in
`createProfileClient` (`lib/github/profile.ts`) and never reaches the browser; the
API routes return fixed bodies with no field for it. It is also the token the
logger redacts by value if it ever reaches a log line.

**Test seam.** `GITHUB_API_BASE` and `GITHUB_OAUTH_BASE` redirect GitHub traffic to
a mock, and are honoured **only when `NODE_ENV !== "production"`**
(`lib/github/endpoints.ts`). Production always talks to real GitHub, and the token
is withheld entirely while an override is in force, so a live credential never
travels to a mock host.

### 1.5 Verifying the environment

```bash
npm run check:env               # development judgement
node scripts/check-environment.ts --production
```

The check prints the report and exits `0` when ready and `1` when a required
variable is missing or unsafe, so a deploy pipeline can gate on it. It never
prints a value — only variable names — so its output is safe to retain. The same
judgement runs at server boot (`instrumentation.ts`), which is where an operator
sees it first.

---

## 2. Production build (TASK 21.2)

The four things TASK 21.2 asks to verify, and how each is checked:

| step | command | expected |
| --- | --- | --- |
| **install** | `npm ci` | completes with no unmet peer dependencies; `@playwright/test` is a devDependency and is not installed in a production-only install |
| **migrate** | `npm run db:migrate` | `Applied N migration(s), skipped M` then `Seeded N catalogue row(s)` |

To check what a database actually contains, rather than trusting that the
statements ran:

```bash
npx tsx scripts/inspect-db.ts          # tables, row counts, the catalogue
npx tsx scripts/verify-persistence.ts  # writes, then proves it outlived the connection
```

`db:reset` drops the public schema and rebuilds it from the model. It is the only
way to apply a **changed** migration, because migrations are forward-only and a
database that already recorded `0003_cosmetics` will not re-run it. It refuses to
run under `NODE_ENV=production` and prints the host it is about to drop.
| **build** | `npm run build` | `✓ Compiled successfully` and no `Failed to compile` |
| **startup** | `npm run start` | `✓ Ready`, then `GET /` returns 200 |
| **environment validation** | `npm run check:env` | exits 0; the boot report in the server log says `environment_ready` |

The full pre-release gate, in order, is:

```bash
npm ci
npx tsc --noEmit          # typecheck is separate: vitest does not typecheck
npm run lint              # 0 errors
npm test                  # unit and integration tests
npx playwright test       # end-to-end journeys (needs a browser)
npm run build
npm run check:env
npm run start &           # then curl the health check
```

Each of these is also what CI should run; none of them requires a live GitHub, a
database, or a browser other than the Playwright step.

---

## 3. Monitoring (TASK 21.3)

Every log line is one JSON object on stdout, written by `lib/ops/logger.ts` and
shaped by `lib/ops/monitoring.ts`. The keys are stable, so a log platform can
filter and alert on them without parsing prose.

### 3.1 Structured error logs

| event | level | when |
| --- | --- | --- |
| `startup.environment_ready` | info | the server booted with a complete environment |
| `startup.environment_incomplete` | warn | booted, but an optional variable is missing |
| `startup.environment_invalid` | error | a required variable is missing or unsafe |
| `server.request_error` | error | an unhandled server error (`instrumentation.ts` `onRequestError`) |

`server.request_error` carries `method`, the request `path` **without its query
string** (a query can hold a login), the `routePath`, and `errorName` /
`errorMessage` — never a stack trace. The optional `LOG_LEVEL` environment
variable sets the minimum level.

### 3.2 Synchronization monitoring

| event | level | notable fields |
| --- | --- | --- |
| `sync.started` | debug | `jobId`, `developer` |
| `sync.succeeded` | info | counters, `durationMs` |
| `sync.partial` | warn | `failureReason` |
| `sync.failed` | error | `failureReason` |
| `sync.recovery` | info / warn | `action`, `waitMs`, `reason` |

`partial` is a warning and **not** an error, deliberately: the activity feed is
capped at 300 events (TASKS 4.4), so a busy developer's sync is always partial. An
alert that fires on every partial sync is an alert an operator learns to ignore.
`eventsDuplicate` on a repeat sync is the visible proof that TASKS 11.3's
idempotency is holding.

### 3.3 API rate-limit visibility

`github.rate_limit` is emitted after every GitHub operation. It carries `limit`,
`remaining`, `resetsAt` (epoch ms) and `retryAfterMs`. A healthy snapshot is
`debug`; an exhausted budget, or a stated `retry-after`, is `warn`. Watching
`remaining` approaching zero is how a deployment sees a rate limit before it
becomes an incident.

### 3.4 Transaction failure visibility

`shop.transaction_succeeded` and `shop.transaction_failed` carry `userId`,
`itemId`, `cost` and `balance`. A refusal that is a normal answer to a user
("insufficient balance") is `info`. The one refusal logged at **error** is
`already_charged` — the state the purchase flow documents as unreachable, where a
charge was persisted without its grant. That is the one a human must reconcile.

### 3.5 Reading the stream

Because lines are JSON, the usual tools work without a parser of our own:

```bash
npm run start | grep '"level":"error"'          # everything that went wrong
npm run start | grep '"event":"github.rate_limit"'   # the budget over time
```

---

## 4. Recovery (TASK 21.4)

### 4.1 Backup

**Durable today, with `DATABASE_URL` set:** accounts, wallets, inventories and the
CodeCoin ledger, in Supabase. Without it they are in-memory (§1.2) and a restart
loses them — which is why the environment check warns rather than errors, but also
why a production deployment must set it.

- **Schema and code** are in git; a deployment is reproducible from a commit.
- **Data** is backed up by Supabase's own mechanisms — point-in-time recovery on
  the Pro plan, or `pg_dump` against the connection string on the free plan. The
  property that makes a restore safe is the same one that makes the schema
  checkable: the database is the *only* system of record, and the coin ledger is
  append-only, so a restored snapshot cannot contain a balance that its own
  entries do not explain.
- **Migrations are re-derived, never restored.** `db/migrations/*.sql` is
  generated from `lib/db/schema.ts` and lives in git. A restore replays them
  forward; it does not roll them back (§4.2).
- **What is never backed up:** `GITHUB_TOKEN`, the OAuth secrets and
  `SESSION_SECRET`. They are configuration, not data, and a backup containing them
  is a credential in a second place.

### 4.2 Rollback

Application rollback is a redeploy of the previous commit — a build is a pure
function of the source, so there is no migration in reverse for code:

```bash
git revert <bad-commit>   # then redeploy
```

Database rollback is **compatibility, not reversal**. Migrations are forward-only
and the runner refuses to re-apply one it has recorded (`schema_migrations`), so
the rule is: a code deploy must be compatible with both the schema before it and
the schema after it. Add a column nullable, backfill, then enforce — never drop a
column the running version still reads. A rollback that is incompatible with data
already written is the one operation that cannot be undone by redeploying.

### 4.3 Account recovery

An account is a GitHub identity plus a session cookie:

- **A lost session** — the cookie expired, or `SESSION_SECRET` was rotated — needs
  no recovery. Signing in with GitHub again claims the same account, because the
  claim is keyed on the GitHub id, not on the cookie (`lib/auth/account.ts`).
  Rotating `SESSION_SECRET` logs everyone out; that is the intended effect and not
  data loss.
- **A renamed GitHub account** resolves to the same account, because the key is
  the numeric GitHub id, which survives a rename.
- **A deleted GitHub account** cannot be recovered through GitHub, and RootRealm
  has no second identity. Once the database exists, the account row can be
  re-pointed to a new GitHub id by an operator; until then, losing the GitHub
  account means starting a new RootRealm character, and the in-memory store was
  lost at the last restart anyway.

### 4.4 Sync recovery

Sync recovery is a real, tested decision rather than a runbook entry, and it lives
in `lib/sync/recovery.ts` (`decideRecovery`). Given a failure reason, the attempt
number and whether any progress was recorded, it returns one of four actions:

| action | meaning |
| --- | --- |
| `retry_now` | a transient failure (outage, unexpected response); retry after backoff |
| `retry_later` | a rate limit; wait exactly as long as GitHub stated, then retry |
| `stop_partial` | progress was written; stop, keep it, let the next sync continue |
| `stop_failed` | nothing usable came back; stop and surface the failure |

The rules that matter operationally:

- a rate limit is waited out for exactly `retry-after`, never polled sooner —
  retrying early risks a secondary limit;
- `not_found` and `invalid_username` are **never** retried: they will not change
  by asking again;
- a sync cut short by the 300-event ceiling is `partial`, and the progress it
  wrote is kept, not discarded (`failSyncJob` vs `markPartial` in
  `lib/sync/job.ts`).

**To recover a stuck sync manually**, re-run it: the engine is idempotent (TASKS
11.3), so a second run over the same activity writes nothing new and reports the
events it recognised as `eventsDuplicate`. There is no "reset" and there does not
need to be one — re-running is always safe. What a stuck sync cannot fix is lost
progress; if a run recorded nothing before failing, the job's counters say so.

### 4.5 Incident checklist

1. `GET /` — is the server up at all?
2. The startup block — is the environment `READY`?
3. `grep '"level":"error"'` in the stream — what actually failed?
4. `grep '"event":"sync.failed"'` — did ingestion stop, and with which reason?
5. `grep '"event":"github.rate_limit"'` — are we simply out of budget?
6. If the last deploy is the suspect, revert and redeploy (§4.2).