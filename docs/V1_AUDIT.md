# V1 checkpoint audit

TASKS §24 lists what a "V1 — Public Product" requires:

> all core systems · accessibility · performance · security · monitoring ·
> deployment · account deletion · documentation · QA

This records, for each one, whether it is **actually** true — measured or
inspected, not assumed. Several are not, and one of the failures is a defect the
project's own tests were built in a way that made them blind to.

**Summary: 4 of 9 hold. 3 are partially true. 2 are not done.**

---

## 1. All core systems — ⚠️ partial

Ingestion, normalization, scoring, the six attributes, skill eligibility,
achievements, quests, cosmetics, the coin ledger, shop, seasons, rank points,
opt-in leaderboard and anti-farming are all present and tested.

One is hollow. **`lib/sync/engine.ts` has zero runtime callers** — verified by
searching every non-test file in `app/`, `lib/` and `scripts/` for any import or
invocation. The engine, its retry logic and its recovery decisions are written and
unit-tested, but no route and no scheduler ever runs one.

MVP 3's "sync" checkbox is therefore aspirational. `logSyncJob` and
`logRecoveryDecision` are dead for the same reason: there is no orchestrator to
emit them.

## 2. Accessibility — ❌ not verified, and one real defect found

**Never audited.** No axe, no Lighthouse, no screen-reader pass had ever been run.
Running Lighthouse against the production build on `/skill-tree`:

| | |
| --- | --- |
| Accessibility | **96 / 100** |
| Best practices | 100 |
| SEO | 100 |

The single failure is `target-size`, and it is a genuine interaction bug, not a
theoretical one:

- The map's node targets are fixed **44×44 px** overlays positioned by percentage.
- Measured on screen: **15 of 36 node pairs overlap**, and 13 pairs sit closer
  than 24px to each other.
- Nodes in adjacent tiers share a y-row across branches and land 33–43px apart, so
  the later-drawn node covers the earlier one. **A touch user cannot reliably
  reach the lower node.** Keyboard users can still Tab between them.

### Why the project's own audit missed it

`e2e/responsive.e2e.ts` asserts every control is **at least 44px tall**. Every one
of these nodes is 44px tall. The rule it encodes — "no target below the minimum" —
cannot detect two targets that are each individually large enough but sit on top
of each other. The audit was checking size and calling it accessibility.

A second gap: only `/skill-tree` has been audited. The other eight routes are
untested against any automated standard.

### Fixing it is a design change, not a patch

The constraint is not the button size, it is the geometry. `SKILL_TREE_VIEWBOX`
packs roughly a dozen nodes into a tier row. Making the targets bigger makes the
overlap worse; zooming out to separate them shrinks the hexagons back toward the
illegibility fixed in TASKS 22.3. Satisfying both needs the node spacing in
`skill-tree-geometry.ts` widened — a change to the map's design, not to a class.

## 3. Performance — ✅ holds

Measured against `npm run build` + `npm run start`, not the dev server.

| | |
| --- | --- |
| Time to first byte | **22 ms** |
| DOMContentLoaded | 57 ms |
| Load event | 108 ms |
| Requests / transferred | 27 / **13 KB** |
| DOM nodes (`/skill-tree`) | 628 |
| Server response, `/` | 57 ms (cold), 17–19 ms (warm) |

Fast because the screens are server-rendered and the client only hydrates the
interactive parts. 952 KB of JS exists across all chunks, but a single page
transfers 13 KB of it.

## 4. Security — ⚠️ incomplete

The application-level security work is real and tested: parameterised SQL
throughout, an input/response boundary in `lib/security`, CSRF protection via
state, rate limiting, and a session cookie that is `HttpOnly`, `SameSite=Lax` and
`Secure` on HTTPS (and correctly *omits* `Secure` on plain-HTTP localhost, which
was a real bug found and fixed earlier).

**But the server sends no security headers whatsoever:**

| header | |
| --- | --- |
| `Content-Security-Policy` | **missing** |
| `Strict-Transport-Security` | **missing** |
| `X-Frame-Options` | **missing** |
| `X-Content-Type-Options` | **missing** |
| `Referrer-Policy` | **missing** |
| `Permissions-Policy` | **missing** |
| `Cross-Origin-Opener-Policy` | **missing** |

`next.config.ts` is an untouched scaffold containing only
`/* config options here */`. This is the cheapest fix in the audit — one
`headers()` block — and the largest gap between "we handled security" and
"a browser enforces security".

## 5. Monitoring — ⚠️ partial

`lib/ops/monitoring.ts` emits JSON lines with redaction by name *and* by value,
and `serviceLogger` is wired through the routes.

| emitter | wired? |
| --- | --- |
| `logRateLimit` | ✅ 9 call sites |
| `logIngestionFailure` | ✅ 9 |
| `logTransaction` | ✅ 2 |
| `logAccountClaim` | ✅ 2 |
| `logSyncJob` | ❌ 0 — no orchestrator to emit it |
| `logRecoveryDecision` | ❌ 0 — same |
| `rateLimitIsConcerning` | ❌ 0 — declared, never used |

So the events that depend on sync have never fired, because sync has never run.
There is also no alerting configuration anywhere — `docs/DEPLOYMENT.md` names the
events worth alerting on, but nothing subscribes to them.

## 6. Deployment — ❌ not done

`docs/DEPLOYMENT.md` is thorough and correct: hosting, the Supabase connection
string and why it needs `sslmode=no-verify`, the environment contract, the GitHub
OAuth setup, the events to alert on, and recovery for backup, rollback, accounts
and sync.

But documentation is not deployment. There is no hosting config committed, no
deployment config, and the app has never been served from a real domain. The
OAuth callback URL still points at `localhost`.

## 7. Account deletion — ✅ holds

Implemented, unit-tested, and **verified live against the real database**: a
delete without the confirmation phrase was refused with 400 and the account
survived unchanged; a confirmed delete returned 200 and the cascade took
`users` 3→2, `currency_transactions` 1→0, `inventory_items` 15→10.

## 8. Documentation — ✅ holds

`PRD`, `ARCHITECTURE`, `DATA_CONTRACT`, `DESIGN_SYSTEM`, `SCORING`, `TASKS`,
`DEPLOYMENT`, `VISUAL_REVIEW`, plus a README carrying setup, the environment
contract and an explicit limitations section.

## 9. QA — ✅ holds, but runs by hand

| | |
| --- | --- |
| Unit / integration | 1412 passing, 74 files |
| End-to-end | 90 passing, 6 suites |
| Responsive audit | 66 checks, 9 routes × 6 viewports |

**There is no CI.** `.github/workflows` does not exist, so nothing runs these
automatically on a push. The gates are real; they are just not enforced.

---

## What is actually true

| claim | verdict |
| --- | --- |
| all core systems | ⚠️ sync engine has no caller |
| accessibility | ❌ never audited; 1 real defect found |
| performance | ✅ measured, excellent |
| security | ⚠️ app-level good, **no HTTP headers** |
| monitoring | ⚠️ 4 of 7 emitters wired; no alerting |
| deployment | ❌ documented, not deployed |
| account deletion | ✅ verified live |
| documentation | ✅ |
| QA | ✅ but manual, no CI |

## Ranked by what a user would actually notice

1. **No security headers.** One config block, affects every page, and it is the
   difference between handling security and a browser enforcing it.
2. **Overlapping map nodes.** Some nodes genuinely cannot be tapped. Needs a
   geometry change, and it is a real accessibility failure.
3. **Sync never runs.** MVP 3's sync is a fiction, and two monitoring emitters are
   dead because of it.
4. **Accessibility of 8 of 9 routes is unknown.** One route was audited and found
   a defect; that is a reason to audit the rest, not a reason to assume they pass.
5. **No CI.** Every gate above is one forgotten push away from silently rotting.
6. **Not deployed.** Documentation exists; nothing is running in public.

Item 1 is an afternoon. Item 2 is a real design task. Item 3 is the largest piece
of unfinished product. The order matters: 1 first because it is cheap and
uncontroversial, 2 next because it is a defect users hit, then a decision on 3.