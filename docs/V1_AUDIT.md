# V1 checkpoint audit

TASKS §24 lists what a "V1 — Public Product" requires:

> all core systems · accessibility · performance · security · monitoring ·
> deployment · account deletion · documentation · QA

This records, for each one, whether it is **actually** true — measured or
inspected, not assumed. Several are not, and one of the failures is a defect the
project's own tests were built in a way that made them blind to.

**Summary: 6 of 9 hold. 1 is partial. 2 are not done.**

*Updated after the security-header fix and a full nine-route accessibility sweep.*

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

## 2. Accessibility — ✅ now holds on `/skill-tree` (was: unverified, 1 real defect)

**It had never been audited.** No axe, no Lighthouse, no screen-reader pass had
ever been run. The first audit found a genuine interaction bug, and diagnosing it
took two findings, not one.

### The symptom

Lighthouse scored `/skill-tree` **96/100**, failing one rule: `target-size`.

### The first cause — the hit targets did not sit on the hexagons

The node buttons are HTML siblings of the `<svg>`, so nothing moves them when the
viewBox changes. They were positioned as a plain percentage of
`SKILL_TREE_VIEWBOX` — the *whole* map frame — while the SVG was drawing
`INITIAL_VIEWPORT`, a zoomed window onto it. They also ignored the letterbox
offset that `preserveAspectRatio="xMidYMid meet"` introduces, worth about 95px
here.

Measured on screen: **15 of 36 target pairs overlapped**, 13 sat closer than 24px,
and some nodes could not be tapped at all. Keyboard users could still Tab between
them.

This was introduced by the TASKS 22.3 fix that made the map legible. Opening
zoomed in was right; leaving the overlay positioned against the unzoomed frame
was not.

**Fixed.** `overlayTransform` mirrors the SVG's own fit-and-centre transform, and
`positionOverlays` applies it imperatively from `applyViewport` and a
`ResizeObserver` — the viewport is a ref specifically so panning does not
re-render 36 components, so the targets have to move without a render too.
`NodeButton` lost its `left`/`top` props entirely rather than keeping a second,
wrong source of truth.

### The second cause — the Foundation row was packed too densely

With the alignment fixed the overlaps went to zero, but 24px was still missed:
21.9px of free space against a 24px minimum. The Foundation tier holds **eleven**
nodes (six branch foundations interleaved with five bridges) where every other
tier holds six, spaced 115 units apart.

**Fixed** by widening that row to 140 units. The row is centred on x 0 and the
frame has room, so nothing else moved.

### Result

| | before | after |
| --- | --- | --- |
| Accessibility | 96/100 | **100/100** |
| `target-size` | fail | **pass** |
| overlapping targets | 15 | **0** |
| narrowest free space | 21.9px | **44px** (needs 24) |

### Why the project's own audit missed it

`e2e/responsive.e2e.ts` asserts every control is **at least 44px tall**. Every one
of these nodes is 44px tall. The rule it encodes — "no target below the minimum" —
cannot detect two targets that are each individually large enough but sit on top
of each other. It was checking size and calling it accessibility.

`e2e/skill-tree.e2e.ts` (4 journeys) now asserts the things that were missing:
free space between every pair at the opening zoom, the Foundation row's spacing,
zero overlaps in a real browser, and that each target lands within 2px of the
hexagon drawn beneath it.

### The full sweep

All nine routes were then audited. **Seven were already clean; two were not.**

| route | before | after |
| --- | --- | --- |
| `/` | — | 100 |
| `/preview` | — | 100 |
| `/profile` | — | 100 |
| `/skill-tree` | 96 | **100** |
| `/achievements` | **96** | **100** |
| `/quests` | — | 100 |
| `/shop` | — | 100 |
| `/customization` | — | 100 |
| `/leaderboard` | — | 100 |

#### `/achievements` — `color-contrast`

Unearned cards carried `opacity-80` **on the whole card**, which dimmed the
card's text along with its decoration. Measured against the card surface:

| token | with `opacity-80` | without |
| --- | --- | --- |
| `--color-text-muted` (the "0 of 1" caption) | 3.53:1 | **4.98:1** |
| `--color-text-disabled` (the card index) | 1.79:1 | — |

"0 of 1" is information, not decoration. Receding is a property of the
decoration, so the treatment moved to the icon glyph and the card's own surface
was left alone.

`bg-surface-secondary` was tried for the unearned card and **rejected**: it is
lighter than the default surface, which made unearned cards *more* prominent than
earned ones, and still only reached 4.42:1.

#### A second defect the token test found that Lighthouse did not

`tests/contrast.test.ts` asserts the palette against WCAG rather than auditing
screens, and it immediately failed on something no route-level audit reported:
**`--rr-text-disabled` was at 2.0–2.3:1** on all three surfaces — below even the
3:1 *non-text* minimum. That is not de-emphasised text, it is text nobody can
read.

Raised from `#4a4d55` to `#6a6d75` (~3.2:1). WCAG 1.4.3 exempts inactive
components from the 4.5:1 text requirement, so 3:1 is the correct bar for a
disabled label; it remains well below `--rr-text-muted` at 4.98:1, so the
hierarchy is intact. `docs/DESIGN_SYSTEM.md` asks disabled text for "reduced
contrast" and no number, so this changed nothing it had committed to.

The test also guards the margin the muted token actually has — `opacity-80` is
exactly the kind of wrapper that silently eats it.

### What this sweep does *not* cover

**These are the signed-out states.** `/profile`, `/skill-tree`, `/achievements`,
`/shop` and `/customization` show a guest a browsing shell when there is no
session, and that shell is what was audited. The signed-in versions of those five
— a real character with a frame, an inventory, an unlocked skill tree — are **not**
covered, and they are where most of the product actually lives.

Reaching them needs a session, which needs the development harness, which is
404 in a production build. It is doable and it is the next honest step.

Also not covered: a screen-reader pass. Lighthouse checks markup, not whether
the thing makes sense read aloud, and the skill tree is the screen most likely to
fail that.

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

## 4. Security — ✅ now holds (was: incomplete)

The application-level security work was always real and tested: parameterised SQL
throughout, an input/response boundary in `lib/security`, CSRF protection via
state, rate limiting, and a session cookie that is `HttpOnly`, `SameSite=Lax` and
`Secure` on HTTPS (and correctly *omits* `Secure` on plain-HTTP localhost, which
was a real bug found and fixed earlier).

**What was missing was the HTTP layer.** `next.config.ts` was an untouched scaffold
and the server sent none of these headers:

| header | before | now |
| --- | --- | --- |
| `Content-Security-Policy` | missing | ✅ nonce-based, per request |
| `Strict-Transport-Security` | missing | ✅ non-loopback only |
| `X-Frame-Options` | missing | ✅ `DENY` |
| `X-Content-Type-Options` | missing | ✅ `nosniff` |
| `Referrer-Policy` | missing | ✅ `strict-origin-when-cross-origin` |
| `Permissions-Policy` | missing | ✅ camera/mic/geo off |
| `Cross-Origin-Opener-Policy` | missing | ✅ `same-origin` |
| `X-Powered-By` | `Next.js` | ✅ removed |

### What it cost, and what it nearly got wrong

Three things were measured or discovered rather than assumed:

**`'strict-dynamic'` broke the site.** It is in Next.js's own documentation, and
following it blocked every lazily-imported chunk — Next injects those without a
nonce — so hydration died. Found in the browser console, not reasoned about.
Removed; `'self'` is what actually covers same-origin chunks.

**Prerendered pages cannot carry a nonce.** Next attaches nonces while rendering,
so a page generated at build time has none available and its inline RSC payload
is blocked. The three pages that already forced dynamic rendering were the only
ones that worked. All ten routes now force dynamic rendering. This is the cost:
**load moved from ~108ms to ~150ms and TTFB from ~22ms to ~50ms** — roughly 40%,
still fast, and it is the price of a policy a browser enforces.

**HSTS would have broken every dev server.** `headers()` is static and cannot see
the host, so it moved into `proxy.ts`, which can. A browser that sees HSTS for
`localhost` refuses plain HTTP to it for the whole `max-age`.

`style-src` still allows `'unsafe-inline'`: a nonce cannot apply to a `style`
*attribute*, and the skill tree positions all 36 map nodes with inline `style` so
their hit targets track the hexagons. Scripts — which can execute — are locked.

`e2e/security.e2e.ts` (6 journeys) asserts all of it against real responses,
including that each nonce is unique per request, so none of it can be deleted
without a test failing.

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
| accessibility | ✅ all 9 routes 100/100 (signed-out states); no screen-reader pass |
| performance | ✅ measured; ~40% slower since the CSP nonce, still fast |
| security | ✅ headers added and enforced; app-level work was already solid |
| monitoring | ⚠️ 4 of 7 emitters wired; no alerting |
| deployment | ❌ documented, not deployed |
| account deletion | ✅ verified live |
| documentation | ✅ |
| QA | ✅ but manual, no CI |

## Ranked by what a user would actually notice

1. ~~**No security headers.**~~ **Done.** Seven headers, a per-request nonce, and
   six tests that fail if any of it is removed. The one caveat worth knowing:
   the nonce forced every route to render per request, which cost about 40% of
   load time. That was the right trade, but it was a real trade.
2. ~~**Overlapping map nodes.**~~ **Done.** The hit targets were positioned
   against the unzoomed frame while the drawing was zoomed — a bug this project
   introduced in TASKS 22.3 — and the Foundation row was packed with eleven nodes
   where every other tier holds six. `/skill-tree` now scores 100/100 with zero
   overlapping targets.
3. **Sync never runs.** MVP 3's sync is a fiction, and two monitoring emitters are
   dead because of it. This is now the largest unfinished piece of product.
4. **Only the signed-out states were audited.** All nine routes score 100/100, but
   `/profile`, `/skill-tree`, `/achievements`, `/shop` and `/customization` were
   audited as a guest — the five screens where the real product lives have not
   been checked at all. And nothing has been read aloud by a screen reader, which
   is a different question from whether the markup is valid.
5. **No CI.** Every gate above is one forgotten push away from silently rotting.
6. **Not deployed.** Documentation exists; nothing is running in public.