# ROOTREALM — ARCHITECTURE

## 1. Architecture Goal

RootRealm must separate:

- data ingestion
- normalized evidence
- progression logic
- presentation
- cosmetics
- competition

The same normalized evidence must be reusable across the profile,
skill tree, achievements and scoring systems.

The UI must never become the source of truth for progression.

---

# 2. High-Level Architecture

GitHub
  ↓
GitHub Ingestion
  ↓
Raw GitHub Responses
  ↓
Normalization
  ↓
DeveloperEvent Store
  ↓
Scoring Engine
  ↓
XP Ledger
  ↓
Attribute Progress
  ↓
Skill Eligibility
  ↓
Achievements / Quests
  ↓
Profile API
  ↓
RootRealm UI

Public entrance:

`/` → landing narrative → `/login` → GitHub OAuth → `/home`

Protected application:

`app/(app)/layout.tsx` → account guard → shared session/profile providers →
profile, skill tree, achievements, quests, shop, customization and leaderboard.

The shared profile provider owns one in-memory snapshot for the protected app
session. Screen navigation consumes that snapshot; it does not call
`/api/profile/me` or re-ingest GitHub independently on every route.

Separate systems:

Cosmetics
  ↓
Inventory
  ↓
CodeCoins Ledger
  ↓
Shop / Customization

Seasonal Competition
  ↓
Eligibility
  ↓
Rank Points
  ↓
Season Leaderboard

---

# 3. Initial Technology Stack

Frontend / Application:

- Next.js
- React
- TypeScript
- Tailwind CSS

UI / Motion:

- CSS transitions and tokenized route motion
- `components/motion/reveal.tsx` for one-time viewport reveals and page entrances
- `components/layout/navigation-link.tsx` for the shared moving navigation marker
- the browser View Transitions API as a progressive enhancement (root snapshots
  remain static because the App Router template owns the route animation)
- SVG
- GSAP where required


Persistence:

- PostgreSQL
- Supabase can provide database/auth infrastructure

GitHub:

- GitHub REST API initially
- GraphQL only where it provides a clear benefit

Testing:

- Vitest
- Playwright

Deployment:

- Vercel-compatible deployment
- Managed PostgreSQL

---

# 4. Architecture Principle

Choose one primary application architecture.

Do not introduce separate backend infrastructure unless the project
actually requires it.

The initial architecture should remain simple enough for a solo
developer to maintain.

---

# 5. Frontend Structure

Suggested structure:

src/
  app/
  components/
    profile/
    skills/
    achievements/
    shop/
    leaderboard/
    quests/
  features/
    github/
    scoring/
    cosmetics/
    ranking/
  lib/
    api/
    db/
    auth/
    validation/
  styles/

Responsibilities:

components/

Presentation and reusable UI.

features/

Domain-specific application behavior.

lib/

Infrastructure and shared services.

app/

Routing, pages and application entry points.

### 5.1 As implemented

The `features/` layer was **not** created. Domain code lives in `lib/` beside the
infrastructure it depends on:

```text
app/          routing and pages only
components/   presentation and reusable UI
lib/github/   ingestion, parsing, validation
lib/scoring/  scoring engine, rules, ledger, level curve
lib/skills/   skill definitions, eligibility, progress
styles/       design tokens
```

The `features/` boundary would have separated scoring from the GitHub client it
consumes, but scoring *is* the consumer of normalized GitHub data and has nothing
else to depend on. Splitting them would add a layer carrying types across a
boundary without carrying a second responsibility.

The §6 boundaries are enforced by directory ownership and by the types
themselves — a scoring rule cannot render UI because it imports no React, and
cannot call GitHub because the engine's entry points are pure.

---

# 6. Domain Boundaries

## GitHub Feature

Responsible for:

- GitHub API requests
- pagination
- rate limiting
- fetching public profile information
- repositories
- events
- normalization input

It must not calculate XP.

---

## Scoring Feature

Responsible for:

- scoring versions
- XP calculation
- attribute contribution
- eligibility calculations
- explanation generation

It must not render UI.

---

## Skills Feature

Responsible for:

- skill definitions
- prerequisites
- node eligibility
- progression state
- node unlock state

The visual tree must consume this data.

---

## Achievements Feature

Responsible for:

- criteria
- evidence
- unlock state
- rarity
- unlock dates

---

## Cosmetics Feature

Responsible for:

- cosmetic definitions
- inventory
- CodeCoins
- purchases
- equipped items
- preview state

Cosmetics must never modify contribution scoring.

---

## Ranking Feature

Responsible for:

- seasons
- rank eligibility
- Rank Points
- anti-farming rules
- leaderboard snapshots

Ranking must remain separate from permanent XP.

---

# 7. Canonical Developer Event

All GitHub activity eventually becomes a normalized event.

**As implemented** (`lib/developer-event.ts`, TASKS 4.5):

```ts
type DeveloperEvent = {
  // `${kind}:${githubEventId}` — scoped to the occurrence, not the object
  id: string
  kind:
    | "push"
    | "pull_request"
    | "review"
    | "issue"
    | "release"
    | "documentation"
    | "lifecycle"

  developerLogin: string
  developerId: number | null      // survives a login rename
  repositoryId: number | null     // survives a rename or transfer
  repositoryFullName: string | null

  occurredAt: string | null
  visibility: "public" | "non_public"
  confidence: "verified" | "inferred"

  sourceUrl: string | null
  relevance: "scored" | "weak" | "ignored"

  evidence: DeveloperEventEvidence  // discriminated by kind
  limitations: EventLimitation[]
}
```

## 7.1 Divergence from the original sketch

This section originally sketched a flat `metadata: Record<string, unknown>` with a
`type` including `"commit"` and a `visibility` of `"public" | "private"`. The
implementation deliberately diverged. Each change is load-bearing:

| Sketch | Implemented | Why |
| --- | --- | --- |
| `metadata: Record<string, unknown>` | `evidence`, a union discriminated by `kind` | A loose bag means every rule re-guesses its shape at runtime. The union makes reading `commits` off a release a **compile error**. |
| `type: "commit"` | `kind: "push"` | A `PushEvent` carries **no commit list** (TASKS 4.4, verified live). Naming the kind `commit` would have invited scoring "3 XP per commit" from data containing no commits. |
| `visibility: "private"` | `"public" \| "non_public"` | The events endpoint serves only public activity. A `false` flag is preserved without asserting a cause we cannot observe, and SCORING.md §31 governs private work. |
| `evidenceConfidence` | `confidence` | Shorter; the vocabulary is `SCORING.md` §6's. |
| `actorId` | `developerLogin` + `developerId` | Both are needed: the id survives a rename, the login is what a human reads. |
| *(absent)* | `limitations` | GitHub withholds fields **silently** — a missing `additions` looks exactly like a pull request that changed nothing. Every gap is named, computed from what was actually absent, and travels with the event. |

`discussion` and `workflow_run` are not yet ingested; adding a kind is a
discriminated-union member plus a normalizer branch, which is the point of the
union over a string enum.

See `DATA_CONTRACT.md` for the layer boundary this type sits on.
