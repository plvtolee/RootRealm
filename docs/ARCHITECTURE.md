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

- CSS transitions
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

```ts
type DeveloperEvent = {
  id: string
  actorId: string
  repositoryId: string | null

  type:
    | "commit"
    | "pull_request"
    | "review"
    | "issue"
    | "discussion"
    | "release"
    | "workflow_run"

  occurredAt: string

  sourceUrl?: string

  visibility:
    | "public"
    | "private"

  metadata: Record<string, unknown>

  evidenceConfidence:
    | "verified"
    | "inferred"
}