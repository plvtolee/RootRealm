# ROOTREALM — DATA CONTRACT

Version: 1.0
Status: Approved for implementation

This document defines the canonical data structures used by RootRealm.

The purpose of the data contract is to ensure that every feature,
service and AI coding agent uses the same terminology, identifiers,
relationships and field meanings.

The data contract is authoritative for domain shape.

Do not invent alternative schemas in feature code without updating
this document first.

---

# 1. Core Data Principles

RootRealm data must be:

- typed
- explicit
- deterministic
- traceable
- versionable
- idempotent where mutations occur
- safe to expose only within intended visibility boundaries

Core principle:

GitHub evidence
→ normalized DeveloperEvent
→ progression state
→ presentation

The normalized DeveloperEvent is the canonical evidence layer.

---

# 2. Identifier Rules

All persistent entities require a stable unique identifier.

Recommended:

- UUID for internal database entities
- GitHub native IDs where available
- stable composite identifiers where GitHub does not provide a
  sufficient unique event identity

Never use display names as primary identifiers.

Examples:

Good:
user_01J...
skill_builder_pr_001
event_github_123456

Bad:
"Lee"
"Builder"
"my-project"

---

# 3. Timestamps

All persisted timestamps should be stored in UTC.

Use ISO-compatible timestamp representations at the application
boundary.

Example:

2026-09-29T12:30:00Z

Important timestamps include:

- occurredAt
- createdAt
- updatedAt
- unlockedAt
- completedAt
- purchasedAt
- syncedAt

---

# 4. Enumerations

## DeveloperEventType

```ts
type DeveloperEventType =
  | "commit"
  | "pull_request"
  | "review"
  | "issue"
  | "discussion"
  | "release"
  | "workflow_run"
```

## Visibility

```ts
type Visibility =
  | "public"
  | "private"
```

## EvidenceConfidence

```ts
type EvidenceConfidence =
  | "verified"
  | "inferred"
```

## SkillStatus

```ts
type SkillStatus =
  | "locked"
  | "eligible"
  | "unlocked"
```

## CurrencyTransactionType

```ts
type CurrencyTransactionType =
  | "earn"
  | "purchase"
  | "refund"
  | "admin"
```

---

# 5. User

Represents a RootRealm account.

```ts
type User = {
  id: string

  username: string

  displayName: string | null

  email: string | null

  avatarUrl: string | null

  createdAt: string
  updatedAt: string

  deletedAt: string | null
}
```

Rules:

- username must be unique
- user deletion must be supported
- deleted accounts must not expose protected information

---

# 6. GitHubAccount

Represents a connected GitHub identity.

```ts
type GitHubAccount = {
  id: string

  userId: string

  githubUserId: string

  login: string

  avatarUrl: string | null

  profileUrl: string | null

  accessTokenEncrypted: string | null

  tokenExpiresAt: string | null

  scopes: string[]

  connectedAt: string
  updatedAt: string
}
```

Security:

- access tokens are server-side only
- never return accessTokenEncrypted to the client
- request least-privilege scopes
- private access requires explicit authorization

---

# 7. Repository

Represents an observed GitHub repository.

```ts
type Repository = {
  id: string

  githubRepositoryId: string

  ownerLogin: string

  name: string

  fullName: string

  description: string | null

  url: string

  visibility: Visibility

  defaultBranch: string | null

  language: string | null

  archived: boolean

  createdAt: string | null

  updatedAt: string | null

  lastObservedAt: string
}
```

Rules:

- githubRepositoryId should be unique
- repository names are display data, not primary identifiers
- private repository information must obey user authorization

---

# 8. DeveloperEvent

DeveloperEvent is the canonical normalized GitHub evidence record.

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

  observedAt: string

  sourceProvider: "github"

  sourceEventId: string
}
```

Important fields:

id:
Internal stable event identifier.

actorId:
The RootRealm/GitHub actor associated with the event.

repositoryId:
Internal repository reference when applicable.

type:
Normalized event category.

occurredAt:
When the underlying GitHub activity occurred.

sourceUrl:
Human-readable evidence link where available.

metadata:
Event-specific information that does not fit the stable schema.

evidenceConfidence:
Whether the event is directly verified or inferred.

observedAt:
When RootRealm observed the event.

sourceEventId:
Stable upstream identifier used for deduplication.

---

# 9. DeveloperEvent Deduplication

The combination of:

sourceProvider
+
sourceEventId

should be treated as a unique source event identity wherever the
GitHub source provides a stable identifier.

Repeated synchronization of the same event must not create:

- duplicate DeveloperEvents
- duplicate XP
- duplicate achievements
- duplicate CodeCoins

---

# 10. SyncJob

Represents a GitHub synchronization operation.

```ts
type SyncJob = {
  id: string

  userId: string

  status:
    | "queued"
    | "running"
    | "completed"
    | "partial"
    | "failed"

  startedAt: string | null

  completedAt: string | null

  observedFrom: string | null

  observedTo: string | null

  pagesFetched: number

  eventsObserved: number

  eventsCreated: number

  eventsSkipped: number

  errorCode: string | null

  errorMessage: string | null
}
```

Purpose:

- track synchronization
- track coverage
- diagnose failed syncs
- prevent silent missing data

---

# 11. ScoringVersion

Defines a version of RootRealm scoring rules.

```ts
type ScoringVersion = {
  id: string

  version: string

  description: string

  active: boolean

  configuration: Record<string, unknown>

  createdAt: string
}
```

Examples:

scoring-v1
scoring-v2

Historical XP transactions must retain the scoring version used
to create them.

---

# 12. XPTransaction

Represents one explainable XP award.

```ts
type XPTransaction = {
  id: string

  userId: string

  eventId: string | null

  scoringVersionId: string

  amount: number

  reason: string

  sourceUrl: string | null

  idempotencyKey: string

  createdAt: string
}
```

Rules:

- append-only where practical
- never silently rewrite history
- idempotencyKey must protect against duplicate awards
- the transaction must be explainable to the user

---

# 13. Character

Represents the user's RootRealm character identity.

```ts
type Character = {
  id: string

  userId: string

  level: number

  totalXp: number

  titleId: string | null

  avatarUrl: string | null

  bannerId: string | null

  frameId: string | null

  themeId: string | null

  effectId: string | null

  featuredRepositoryId: string | null

  createdAt: string

  updatedAt: string
}
```

The Character is a presentation-oriented aggregate of progression and
equipped identity.

It must not independently calculate XP.

---

# 14. AttributeType

```ts
type AttributeType =
  | "builder"
  | "debugger"
  | "scholar"
  | "collaborator"
  | "maintainer"
  | "architect"
```

---

# 15. AttributeProgress

Tracks progress for one character attribute.

```ts
type AttributeProgress = {
  id: string

  userId: string

  attribute:
    | "builder"
    | "debugger"
    | "scholar"
    | "collaborator"
    | "maintainer"
    | "architect"

  value: number

  level: number

  updatedAt: string
}
```

Attribute progression must be derived from qualifying evidence.

---

# 16. SkillNode

Represents one node in the RootRealm skill tree.

```ts
type SkillNode = {
  id: string

  category:
    | "builder"
    | "debugger"
    | "scholar"
    | "collaborator"
    | "maintainer"
    | "architect"

  tier: number

  title: string

  description: string

  prerequisiteIds: string[]

  evidenceRule: Record<string, unknown>

  requiredProgress: number

  xpReward: number

  codeCoinReward: number

  icon: string

  visualX: number

  visualY: number

  accessibleDescription: string

  createdAt: string
}
```

Important:

visualX and visualY are presentation metadata.

They must never determine eligibility.

---

# 17. SkillUnlock

Records a user's unlocked skill.

```ts
type SkillUnlock = {
  id: string

  userId: string

  skillNodeId: string

  unlockedAt: string

  evidenceEventIds: string[]

  xpAwarded: number

  codeCoinsAwarded: number
}
```

Rules:

- one user should not unlock the same skill repeatedly
- eligibility must be calculated from domain state
- evidenceEventIds provides traceability

---

# 18. SkillProgress

Optional derived model for current node progress.

```ts
type SkillProgress = {
  skillNodeId: string

  userId: string

  currentProgress: number

  requiredProgress: number

  status:
    | "locked"
    | "eligible"
    | "unlocked"
}
```

This can be computed rather than persisted where practical.

Prefer derived state unless persistence provides a clear benefit.

---

# 19. Achievement

Represents a defined milestone.

```ts
type Achievement = {
  id: string

  title: string

  description: string

  criteria: Record<string, unknown>

  rarity:
    | "common"
    | "rare"
    | "epic"
    | "legendary"

  icon: string

  createdAt: string
}
```

Criteria must be deterministic and testable.

---

# 20. AchievementUnlock

Records a user's unlocked achievement.

```ts
type AchievementUnlock = {
  id: string

  userId: string

  achievementId: string

  evidenceEventIds: string[]

  unlockedAt: string
}
```

A user must not receive the same achievement more than once.

---

# 21. Quest

Represents a daily, weekly or goal-based task.

```ts
type Quest = {
  id: string

  title: string

  description: string

  type:
    | "daily"
    | "weekly"
    | "goal"

  criteria: Record<string, unknown>

  xpReward: number

  codeCoinReward: number

  startAt: string | null

  endAt: string | null

  active: boolean
}
```

Quest criteria must reference meaningful evidence.

Do not create quests that incentivize trivial contribution farming.

---

# 22. QuestProgress

Tracks one user's progress toward a quest.

```ts
type QuestProgress = {
  id: string

  userId: string

  questId: string

  currentProgress: number

  requiredProgress: number

  completed: boolean

  completedAt: string | null

  evidenceEventIds: string[]

  createdAt: string
  updatedAt: string
}
```

---

# 23. CosmeticItem

Defines an item that can be equipped.

```ts
type CosmeticItem = {
  id: string

  type:
    | "frame"
    | "banner"
    | "title"
    | "theme"
    | "effect"

  name: string

  description: string

  rarity:
    | "common"
    | "rare"
    | "epic"
    | "legendary"

  price: number

  configuration: Record<string, unknown>

  active: boolean

  createdAt: string
}
```

Cosmetics modify presentation only.

---

# 24. InventoryItem

Represents ownership of a cosmetic.

```ts
type InventoryItem = {
  id: string

  userId: string

  cosmeticItemId: string

  acquiredAt: string

  acquisitionSource:
    | "purchase"
    | "quest"
    | "achievement"
    | "season"
    | "admin"

  equipped: boolean
}
```

A user may own a cosmetic without equipping it.

---

# 25. CurrencyTransaction

Represents a CodeCoin transaction.

```ts
type CurrencyTransaction = {
  id: string

  userId: string

  amount: number

  type:
    | "earn"
    | "purchase"
    | "refund"
    | "admin"

  referenceId: string | null

  idempotencyKey: string

  createdAt: string
}
```

Rules:

- transaction must be traceable
- duplicate mutations must be rejected
- balances should be derived from transactions where practical
- purchases must be atomic

---

# 26. Season

Represents a competitive season.

```ts
type Season = {
  id: string

  name: string

  startsAt: string

  endsAt: string

  active: boolean

  rulesVersion: string
}
```

Seasonal rules must be versioned.

---

# 27. RankSnapshot

Represents a user's score within a season.

```ts
type RankSnapshot = {
  id: string

  seasonId: string

  userId: string

  rankPoints: number

  rankPosition: number | null

  eligible: boolean

  optIn: boolean

  capturedAt: string
}
```

Rank Points are separate from permanent XP.

---

# 28. Public Profile DTO

The public profile should not expose raw database records.

Create a dedicated view model.

```ts
type PublicProfile = {
  username: string

  displayName: string | null

  avatarUrl: string | null

  title: string | null

  level: number

  totalXp: number

  attributes: {
    builder: number
    debugger: number
    scholar: number
    collaborator: number
    maintainer: number
    architect: number
  }

  equippedCosmetics: {
    frameId: string | null
    bannerId: string | null
    titleId: string | null
    themeId: string | null
    effectId: string | null
  }

  achievements: PublicAchievement[]

  featuredRepository: PublicRepository | null

  seasonalRank: PublicSeasonalRank | null
}
```

---

# 29. PublicAchievement DTO

```ts
type PublicAchievement = {
  id: string

  title: string

  description: string

  rarity:
    | "common"
    | "rare"
    | "epic"
    | "legendary"

  unlockedAt: string
}
```

Do not expose private evidence.

---

# 30. PublicRepository DTO

```ts
type PublicRepository = {
  id: string

  name: string

  description: string | null

  url: string

  language: string | null
}
```

Only repositories that are safe and authorized for public display
should appear.

---

# 31. PublicSeasonalRank DTO

```ts
type PublicSeasonalRank = {
  seasonId: string

  seasonName: string

  rankPoints: number

  rankPosition: number | null
}
```

Only expose seasonal ranking data when the user has opted into
the relevant public competition.

---

# 32. Profile Preview DTO

Guest profile previews must explicitly represent that the data is
observed public evidence.

```ts
type ProfilePreview = {
  username: string

  observed: boolean

  coverage: {
    repositoriesObserved: number
    eventsObserved: number

    from: string | null
    to: string | null

    paginationComplete: boolean
  }

  profile: PublicProfile

  limitations: string[]
}
```

Example limitation:

"Public GitHub activity does not represent the complete work history
of this developer."

---

# 33. API Response Envelope

Use consistent response structures.

Success:

```ts
type ApiSuccess<T> = {
  success: true
  data: T
}
```

Failure:

```ts
type ApiError = {
  success: false

  error: {
    code: string
    message: string
    retryable: boolean
  }
}
```

Avoid returning arbitrary response shapes from each endpoint.

---

# 34. Example GitHub Profile Flow

Input:

```ts
{
  username: "plvtolee"
}
```

Processing:

```text
Username
  ↓
GitHub API
  ↓
Raw profile
Raw repositories
Raw activity
  ↓
Validation
  ↓
Normalization
  ↓
DeveloperEvent[]
  ↓
Scoring
  ↓
ProfilePreview
```

---

# 35. Evidence Traceability

Every important progression result should be traceable.

Example:

```text
+30 XP
Merged Pull Request
    ↓
XPTransaction
    ↓
eventId = evt_123
    ↓
DeveloperEvent
    ↓
sourceUrl = GitHub PR URL
```

For achievements:

```text
Achievement
    ↓
AchievementUnlock
    ↓
evidenceEventIds[]
    ↓
DeveloperEvent[]
```

For skill unlocks:

```text
SkillUnlock
    ↓
evidenceEventIds[]
    ↓
DeveloperEvent[]
```

---

# 36. Idempotency

The following mutation types require idempotency:

- XP awards
- CodeCoin awards
- cosmetic purchases
- achievement unlocks
- skill unlocks
- synchronization jobs

Each mutation should have a stable idempotency key.

Example:

```text
xp:user123:event456:scoring-v1
```

A repeated request with the same idempotency key must not
create a second transaction.

---

# 37. Data Visibility

Every system must respect visibility.

Public:

- public repositories
- public activity
- public profile data
- opted-in seasonal ranking

Private:

- OAuth tokens
- private repositories
- private activity
- internal synchronization metadata
- internal scoring diagnostics

Never accidentally serialize private database fields into public DTOs.

---

# 38. Data Lifecycle

## Guest

Temporary preview.

## Claimed user

Persistent profile.

## Synchronization

New evidence is added or existing evidence is recognized.

## Progression

Derived from normalized evidence.

## Account deletion

User-facing personal data is deleted or anonymized according to
the final retention policy.

Deletion behavior must be implemented deliberately rather than
implicitly.

---

# 39. Database Constraints

Important uniqueness constraints should include:

- User.username
- GitHubAccount.githubUserId
- Repository.githubRepositoryId
- DeveloperEvent(sourceProvider, sourceEventId)
- XPTransaction.idempotencyKey
- CurrencyTransaction.idempotencyKey
- SkillUnlock(userId, skillNodeId)
- AchievementUnlock(userId, achievementId)

Foreign keys should enforce valid relationships.

---

# 40. Data Contract Guardrails

Do not:

- calculate scoring in UI components
- store derived UI labels as canonical progression state
- use usernames as entity IDs
- duplicate DeveloperEvent schemas across features
- award XP without evidence
- expose private data through public DTOs
- perform currency mutations without idempotency
- change scoring rules without a scoring version
- change entity meaning without updating this document

---

# 41. Canonical Relationships

```text
User
 ├── GitHubAccount
 ├── Character
 ├── AttributeProgress[]
 ├── DeveloperEvent[]
 ├── XPTransaction[]
 ├── SkillUnlock[]
 ├── AchievementUnlock[]
 ├── QuestProgress[]
 ├── InventoryItem[]
 ├── CurrencyTransaction[]
 └── RankSnapshot[]

Repository
 └── DeveloperEvent[]

SkillNode
 └── SkillUnlock[]

Achievement
 └── AchievementUnlock[]

Quest
 └── QuestProgress[]

CosmeticItem
 └── InventoryItem[]

Season
 └── RankSnapshot[]
```

---

# 42. Contract Change Rule

When a schema changes:

1. Update this document.
2. Update TypeScript types.
3. Update database schema/migrations.
4. Update affected domain logic.
5. Update tests and fixtures.
6. Update API DTOs where required.
7. Review backwards compatibility.

Never silently create a second incompatible shape.

---

# 43. Data Contract Summary

The canonical chain is:

GitHub
  ↓
Raw provider data
  ↓
DeveloperEvent
  ↓
XPTransaction
  ↓
AttributeProgress
  ↓
SkillUnlock / AchievementUnlock / QuestProgress
  ↓
Character / Profile
  ↓
Public DTO
  ↓
UI

Separate cosmetic chain:

Quest / Milestone
  ↓
CurrencyTransaction
  ↓
InventoryItem
  ↓
Equipped Cosmetic
  ↓
Profile Presentation

Separate competitive chain:

Season
  ↓
Eligible Evidence
  ↓
Rank Points
  ↓
RankSnapshot
  ↓
Leaderboard
