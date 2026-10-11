# ROOTREALM — TASKS

Version: 1.0
Status: Approved implementation plan

This document breaks the RootRealm build into small, testable,
AI-executable tasks.

The purpose is to prevent large uncontrolled AI changes.

Each task should:

1. Have a clear scope.
2. Have measurable acceptance criteria.
3. Avoid implementing future features.
4. Reuse existing architecture and components.
5. Run relevant checks before completion.
6. End with a reviewable working state.

Do not ask an AI coding agent to build the entire application in one
prompt.

---

# 0. WORKFLOW

For every task:

```text
Read project docs
      ↓
Inspect existing repository
      ↓
Identify smallest implementation
      ↓
Implement task
      ↓
Run checks
      ↓
Inspect browser
      ↓
Review screenshot/UI
      ↓
Commit
```

Required checks when relevant:

- TypeScript/typecheck
- ESLint
- unit tests
- production build
- Playwright/e2e tests

Every completed task should report:

- files changed
- dependencies added
- checks run
- known limitations

---

# 1. PHASE 0 — REPOSITORY FOUNDATION

## TASK 0.1 — Verify Repository

Goal:

Confirm RootRealm is correctly connected to GitHub.

Acceptance criteria:

- local repository root is correct
- origin points to the RootRealm repository
- main exists
- develop exists
- working tree is clean or intentionally changed

---

## TASK 0.2 — Documentation Foundation

Create and maintain:

- PRD.md ✅
- ARCHITECTURE.md ✅
- DATA_CONTRACT.md ✅
- DESIGN_SYSTEM.md ✅
- SCORING.md ✅
- TASKS.md ✅
- AGENTS.md ✅
- CLAUDE.md ✅

**All present.** `DATA_CONTRACT.md` was written retrospectively, after nine source
files had begun citing it, and it records the drift it found (§11.1).
`ARCHITECTURE.md` §7 and §5 were updated to match the implementation, which
diverged from both sketches deliberately — §7.1 and §5.1 record each divergence
and its reason.

Two vocabulary decisions are left open rather than settled by accident:

- **Skill node state names.** DESIGN_SYSTEM §17 specifies `Locked / In Progress /
  Eligible / Unlocked / Selected`. The prototype's `SkillNodeStatus` uses
  `locked | in-progress | eligible | learned`, deliberately dropping `selected`
  as a view concern. So `learned` and `Unlocked` name the same state, and TASK 6.5
  should pick the domain term deliberately rather than inherit whichever it reads
  first.
- **Attribute colour.** `lib/attributes.ts` attaches no colour to an attribute,
  because DESIGN_SYSTEM defines no attribute→colour mapping. That absence is
  load-bearing and should stay deliberate.

Acceptance criteria:

All project rules are committed and available to the coding agent.

---

## TASK 0.3 — Approved UI References

Ensure:

references/
└── approved-ui/

contains:

- profile.png
- skill-tree.png
- node-detail.png
- achievements.png
- shop.png
- customization.png

Acceptance criteria:

The coding agent can inspect the approved reference screens.

---

# 2. PHASE 1 — UI FOUNDATION

## TASK 1.1 — Design Tokens

Build centralized RootRealm design tokens.

Include:

- colors
- typography
- spacing
- radius
- borders
- shadows
- motion durations
- semantic colors

Acceptance criteria:

- tokens are centralized
- no unnecessary hard-coded design values
- mobile layouts are supported

---

## TASK 1.2 — Typography System

Implement:

- display
- heading
- subheading
- body
- caption
- label

Acceptance criteria:

Typography hierarchy is consistent across the application.

---

## TASK 1.3 — Base UI Primitives

Create reusable:

- Button
- Card
- Badge
- Divider
- Input
- IconButton
- ProgressBar
- Avatar

Acceptance criteria:

Components are reusable and typed.

---

## TASK 1.4 — Application Shell

Build:

- global background
- top-level layout
- responsive content container
- page transition foundation
- desktop/mobile breakpoints

Acceptance criteria:

Shell works at:

- 375x812
- 390x844
- tablet
- desktop

---

## TASK 1.5 — Mobile Navigation

Build the primary mobile navigation:

- Home
- Skill Tree
- Achievements
- Shop
- Profile

Acceptance criteria:

- correct active state
- touch-friendly targets
- accessible labels
- restrained transitions

---

## TASK 1.6 — Desktop Navigation

Introduce an appropriate desktop navigation pattern without changing
the mobile information architecture.

Acceptance criteria:

- desktop feels intentionally designed
- navigation remains visually restrained
- routes remain consistent

---

# 3. PHASE 2 — STATIC PRODUCT UI

No real GitHub data yet.

Use typed mock data.

---

## TASK 2.1 — Static Profile

Build the main RootRealm profile screen.

Include:

- avatar
- equipped frame
- developer name
- title
- level
- XP
- six attributes
- featured project
- current quest
- achievement highlights

Acceptance criteria:

- high visual fidelity to approved profile reference
- mobile-first
- no invented backend dependencies

---

## TASK 2.2 — Profile Responsive States

Test profile at:

- 375x812
- 390x844
- 768+
- desktop

Acceptance criteria:

No:

- overflow
- clipped text
- broken cards
- unusable touch targets

---

## TASK 2.3 — Skill Tree Renderer Prototype

Implement a static interactive skill tree.

Support:

- pan
- zoom
- fit to screen
- node selection
- locked state
- in-progress state
- unlocked state

Use mock nodes.

Acceptance criteria:

The visual tree resembles the approved reference and behaves as an
interactive graph.

---

## TASK 2.4 — Organic Tree Geometry

Improve the static tree's branch appearance.

Use:

- SVG
- organic curves
- controlled strokes
- subtle progression lines

Do not add excessive particles or decorative effects.

---

## TASK 2.5 — Skill Node Detail

Build the node detail UI.

Include:

- title
- description
- requirements
- progress
- status
- reward
- evidence/source links

Acceptance criteria:

Node detail works on mobile as a bottom sheet or dedicated view.

---

## TASK 2.6 — Accessible Skill Tree

Create list-mode fallback.

Include:

- categories
- ordered nodes
- status
- progress
- requirements
- rewards

Acceptance criteria:

All essential skill information remains accessible without the graph.

---

## TASK 2.7 — Achievements Screen

Build:

- achievement cards
- rarity
- filters
- earned dates
- criteria
- evidence

Use mock data.

---

## TASK 2.8 — Shop Screen

Build:

- item cards
- rarity
- price
- ownership
- equip state
- preview

Use mock currency and inventory.

No real purchase logic yet.

---

## TASK 2.9 — Customization Screen

Build:

- avatar selector
- frame selector
- banner selector
- title selector
- theme selector
- effect selector
- live preview

Use mock data.

---

## TASK 2.10 — Quests Screen

Build:

- daily quest
- weekly quest
- goal quest
- progress
- completion state
- reward preview

Use mock data.

---

## TASK 2.11 — Leaderboard Screen

Build the presentation layer only.

Include:

- season
- rank
- player
- score
- eligibility
- opt-in state

Do not implement ranking calculations yet.

---

# 4. PHASE 3 — UI MOTION

Only add motion after the static UI is stable.

---

## TASK 3.1 — Base Motion

Add restrained transitions.

Target:

150–250ms

use gsap animations and motions
---

## TASK 3.2 — Avatar Frame Motion

Create configurable frame animation.

Requirements:

- intensity control
- optional glow
- reduced motion support

---

## TASK 3.3 — Skill Unlock Animation

Create:

- branch stroke reveal
- node reveal
- short glow pulse

Animate only the changed branch.

---

## TASK 3.4 — Achievement Reveal

Create a restrained achievement reveal sequence.

Do not make common achievements look like major unlocks.

---

## TASK 3.5 — Reduced Motion

Create reduced-motion behavior across all major animated surfaces.

Acceptance criteria:

Reduced motion removes unnecessary animation while preserving state
and information.

---

# 5. PHASE 4 — GITHUB INGESTION

Do not implement scoring in this phase.

---

## TASK 4.1 — GitHub API Client

Build a server-side GitHub client.

Requirements:

- typed responses
- error handling
- request abstraction
- rate-limit awareness

No browser secrets.

---

## TASK 4.2 — Public Profile Fetching

Implement:

username
→ GitHub profile

Acceptance criteria:

- valid user works
- invalid user returns controlled error
- response is validated

---

## TASK 4.3 — Repository Fetching

Implement repository retrieval with pagination.

Acceptance criteria:

- pagination works
- archived state preserved
- repository identifiers normalized

---

## TASK 4.4 — Activity Fetching

Implement relevant public GitHub activity retrieval.

Handle pagination and partial responses.

---

## TASK 4.5 — DeveloperEvent Normalization

Convert raw GitHub data into the canonical DeveloperEvent type.

Acceptance criteria:

- type-safe
- stable identifiers
- source URL preserved where available
- visibility preserved
- confidence preserved

---

## TASK 4.6 — Event Deduplication

Prevent duplicate DeveloperEvents.

Acceptance criteria:

Same source event processed repeatedly produces one canonical event.

---

## TASK 4.7 — Coverage Tracking

Track observed:

- repository count
- event count
- time range
- pagination completeness

---

## TASK 4.8 — GitHub Error States

Implement handling for:

- invalid username
- deleted user
- empty activity
- rate limiting
- partial pagination
- GitHub outage
- malformed response

---

# 6. PHASE 5 — SCORING ENGINE

This phase is pure TypeScript/domain logic.

---

## TASK 5.1 — Scoring Types

Implement:

- ScoringVersion
- ScoreResult
- AttributeAward
- XPTransaction

---

## TASK 5.2 — Commit Scoring

Implement initial qualifying commit rule.

Starting value:

+3 XP

Acceptance criteria:

- deterministic
- explainable
- test-covered

**Implemented as push scoring.** TASKS 4.4 verified against the live API that a
`PushEvent` carries no commit list — no count, no messages, no files — so §7's
per-commit unit is not observable from the activity feed. Rather than leave the
line unearned, the rule awards §7's `+3 XP` per **push**, under the
classification `qualifying_push`.

`qualifying_commit` remains `null` on `SCORING_V1` so the commit-level gap stays
visible rather than being quietly satisfied by a different unit. If a commit
source is added later, the two coexist: a push awards for landing code, and its
commits additionally award per commit.

Two consequences, both deliberate:

- **Overlap with TASKS 5.3.** A merged pull request was usually pushed first, so
  both events qualify and both are awarded. Accepted rather than worked around:
  suppressing it needs the repository's default branch inside every rule, and §4's
  own values keep it from dominating (`+3` against `+30`). If tuning shows this is
  wrong, the fix is a new scoring version per §3.
- **§7's repetition warning is only partly answerable.** A push where
  `head === before` landed nothing and is declined under `anti_farming_rule`. A
  long repetitive commit sequence *inside* one push is not detectable, because the
  commit list does not exist in this data. The flat per-push award means splitting
  work into more pushes cannot multiply the score, which is the half that is
  fixable.

Unblocking both consequences needs the same data: one request per push head
(`GET /repos/{owner}/{repo}/commits/{sha}`) would count commits and close the
repetition gap; the pull request files endpoint would expose changed paths.

---

## TASK 5.3 — Pull Request Scoring

Implement merged PR scoring.

Starting value:

+30 XP

---

## TASK 5.4 — Review Scoring

Implement qualifying completed review scoring.

Starting value:

+15 XP

---

## TASK 5.5 — Issue Closure Scoring

Implement qualifying linked issue closure.

Starting value:

+20 XP

---

## TASK 5.6 — Release Scoring

Implement qualifying release scoring.

Starting value:

+25 XP

---

## TASK 5.7 — Documentation Scoring

Implement qualifying documentation scoring.

Starting value:

+10 XP

---

## TASK 5.8 — Regression Test Scoring

Implement qualifying regression test scoring.

Starting value:

+12 XP

**Implemented from fetched filenames.** §13 asks for a test "associated with
fixing or preventing a defect". No ingested event carries file paths, so the
changed filenames are fetched from
`GET /repos/{owner}/{repo}/pulls/{n}/files` — one request per pull-request event,
roughly thirty per 300-event feed, capped at one page of 100 files with
truncation reported rather than assumed complete.

A filename is a convention, not a certainty, so `lib/scoring/test-detection.ts`
grades rather than returning a boolean: `strong` for a file that is a test by
language convention, `weak` for the ambiguous middle (a shared helper, a
`conftest.py`), `none` otherwise. Only `strong` is awarded, so §13's "verified"
is honoured rather than approximated.

**Composed into the merge award, not a second transaction.** §33 specifies
`scoreEvent` returning a single `ScoreResult`, and §18's idempotency key is scoped
to the event — so one event produces one transaction. A merged pull request
carrying a regression test is genuinely two §4 lines, so it becomes one
transaction spanning both, with a `breakdown` naming each line's classification,
rule and XP. It also cannot be its own rule: dispatch is first-match and
`pr.merged` claims every `pull_request`.

**What is not verified.** §13's defect *association* is unchecked — that needs
the pull request's issue links from the timeline API, which nothing ingests. The
award rests on merge plus test file, and the narrower claim is the pinned one.
§13's "meaningful" is likewise undecidable from a filename, and a generated test
is indistinguishable from a written one.

Pending: the ingestion task that actually calls the files endpoint. Until it
lands, `testFiles` is `null` on every event and the `test_files_unavailable`
limitation records the open question; the rule declines with that stated rather
than guessing.

---

## TASK 5.9 — Six Attribute Mapping

Implement:

- Builder
- Debugger
- Scholar
- Collaborator
- Maintainer
- Architect

Acceptance criteria:

Each event type maps through explicit, testable rules.

---

## TASK 5.10 — Explanation Ledger

Ensure every award produces:

- event
- reason
- XP
- attribute impact
- scoring version
- source URL

---

## TASK 5.11 — Idempotent Scoring

Repeated processing of the same event must not award progression twice.

---

## TASK 5.12 — Scoring Fixtures

Create fixtures for:

- active profile
- inactive profile
- new profile
- large profile
- duplicate activity
- mixed activity

---

## TASK 5.13 — Level Calculation

Implement a separate versioned level curve.

Do not hard-code level thresholds inside UI components.

Initial prototype curve may be used for testing only.

---

# 7. PHASE 6 — SKILL SYSTEM

---

## TASK 6.1 — Skill Definitions

Create typed skill nodes from the data contract.

---

## TASK 6.2 — Skill Prerequisites

Implement prerequisite evaluation.

Acceptance criteria:

- missing prerequisite → locked
- satisfied prerequisite → eligible where other conditions pass

---

## TASK 6.3 — Evidence Rules

Implement skill-specific evidence requirements.

---

## TASK 6.4 — Skill Progress

Calculate:

current progress
required progress
status

---

## TASK 6.5 — Skill Unlock

Implement persistent SkillUnlock records.

Prevent duplicate unlocks.

---

## TASK 6.6 — Connect Skill Engine to Tree UI

Replace mock skill data with real progression state.

The visual tree must only consume domain state.

---

# 8. PHASE 7 — ACHIEVEMENTS

---

## TASK 7.1 — Achievement Definitions

Create initial achievement catalog.

Examples:

- First Merge
- First Release
- Reviewer
- Documentation milestone
- Contribution milestones

---

## TASK 7.2 — Achievement Eligibility

Implement deterministic achievement criteria.

---

## TASK 7.3 — Achievement Unlocks

Persist unlock records and evidence references.

---

## TASK 7.4 — Connect Real Achievements to UI

Replace mock achievement data.

---

# 9. PHASE 8 — REAL PROFILE

---

## TASK 8.1 — Profile Aggregation

Create a profile service that combines:

- character
- XP
- attributes
- achievements
- featured repository
- cosmetics
- quest state

---

## TASK 8.2 — Public Profile Preview

Implement:

GitHub username
→ real RootRealm profile preview

No login required.

---

## TASK 8.3 — Evidence Transparency

Add visible explanations:

- observed activity scope
- scoring explanations
- source links
- limitations

---

# 10. PHASE 9 — AUTHENTICATION

---

## TASK 9.1 — GitHub OAuth

Implement ownership verification.

---

## TASK 9.2 — Account Creation

Create RootRealm user after verified GitHub identity.

---

## TASK 9.3 — Claim Profile

Allow guest profile to become a persistent account.

---

## TASK 9.4 — Permission Boundaries

Verify that:

- credentials remain server-side
- only required scopes are requested
- private data requires explicit authorization

---

# 11. PHASE 10 — DATABASE / PERSISTENCE

---

## TASK 10.1 — Database Setup

Configure PostgreSQL/Supabase.

---

## TASK 10.2 — Core Tables

Implement:

- User
- GitHubAccount
- Repository
- DeveloperEvent
- ScoringVersion
- XPTransaction
- Character

---

## TASK 10.3 — Progression Tables

Implement:

- AttributeProgress
- SkillNode
- SkillUnlock
- Achievement
- AchievementUnlock
- Quest
- QuestProgress

---

## TASK 10.4 — Cosmetic Tables

Implement:

- CosmeticItem
- InventoryItem
- CurrencyTransaction

---

## TASK 10.5 — Seasonal Tables

Implement:

- Season
- RankSnapshot

---

## TASK 10.6 — Constraints

Add important uniqueness and foreign-key constraints.

---

# 12. PHASE 11 — SYNCHRONIZATION

---

## TASK 11.1 — SyncJob

Implement synchronization tracking.

---

## TASK 11.2 — Initial Synchronization

After profile claim:

GitHub
→ ingestion
→ normalization
→ progression

---

## TASK 11.3 — Repeat Synchronization

Repeated sync must:

- detect existing events
- avoid duplicate XP
- avoid duplicate achievements
- update newly observed activity

---

## TASK 11.4 — Sync Error Recovery

Support:

- partial sync
- retry
- rate limit
- failed sync
- GitHub outage

---

# 13. PHASE 12 — QUESTS

---

## TASK 12.1 — Quest Definitions

Create daily, weekly and goal quests.

---

## TASK 12.2 — Quest Progress

Connect quest progress to normalized evidence.

---

## TASK 12.3 — Quest Completion

Award:

- XP
- CodeCoins
- cosmetic rewards

without fabricating evidence.

---

# 14. PHASE 13 — COSMETICS

---

## TASK 13.1 — Cosmetic Definitions

Create initial catalog:

- frames
- banners
- titles
- themes
- effects

Keep the initial catalog small.

---

## TASK 13.2 — Inventory

Implement ownership.

---

## TASK 13.3 — Equipped State

Implement equip/unequip.

---

## TASK 13.4 — Live Preview

Connect customization UI to real inventory/equipped state.

---

# 15. PHASE 14 — CODECOINS

---

## TASK 14.1 — Currency Ledger

Implement immutable currency transactions.

---

## TASK 14.2 — Currency Balance

Calculate the user's CodeCoin balance.

---

## TASK 14.3 — Earn Rules

Connect quest/milestone rewards.

---

## TASK 14.4 — Purchase Flow

Implement atomic cosmetic purchases.

Acceptance criteria:

- insufficient balance rejected
- successful purchase grants ownership
- duplicate request does not deduct twice
- failed transaction does not corrupt balance

---

# 16. PHASE 15 — SHOP

---

## TASK 15.1 — Real Shop Data

Replace mock catalog.

---

## TASK 15.2 — Preview Flow

Preview cosmetic on current avatar.

---

## TASK 15.3 — Purchase Flow

Connect UI to atomic backend transaction.

---

## TASK 15.4 — Equip Flow

Purchase
→ inventory
→ equip

---

# 17. PHASE 16 — SEASONAL LEADERBOARDS

---

## TASK 16.1 — Season Model

Implement active and historical seasons.

---

## TASK 16.2 — Opt-In

Require explicit leaderboard participation.

---

## TASK 16.3 — Rank Points

Implement season-specific scoring separate from XP.

---

## TASK 16.4 — Eligibility

Publish and enforce eligibility rules.

---

## TASK 16.5 — Anti-Farming

Implement initial safeguards.

Do not build unnecessarily complex heuristics before actual abuse
patterns exist.

---

## TASK 16.6 — Leaderboard UI

Connect real season/rank data.

---

# 18. PHASE 17 — ACCESSIBILITY

---

## TASK 17.1 — Semantic Navigation

Audit all primary navigation.

---

## TASK 17.2 — Keyboard Navigation

Ensure desktop navigation and skill tree fallback work by keyboard.

---

## TASK 17.3 — Screen Reader Support

Add meaningful labels and descriptions.

---

## TASK 17.4 — Reduced Motion

Audit all animated surfaces.

---

## TASK 17.5 — Contrast Audit

Verify text, borders and controls have appropriate contrast.

---

# 19. PHASE 18 — PERFORMANCE

---

## TASK 18.1 — React Render Audit

Find unnecessary re-renders.

---

## TASK 18.2 — Skill Tree Optimization

Optimize:

- branch rendering
- node rendering
- off-screen content
- interaction responsiveness

---

## TASK 18.3 — Animation Audit

Remove unnecessary animations.

---

## TASK 18.4 — Mobile Performance

Test on lower-powered devices.

---

# 20. PHASE 19 — SECURITY

---

## TASK 19.1 — Secrets Audit

Confirm no secrets are client-exposed.

---

## TASK 19.2 — API Validation

Validate API inputs.

---

## TASK 19.3 — OAuth Security

Verify:

- state validation
- callback validation
- scope handling

---

## TASK 19.4 — Mutation Security

Protect:

- purchases
- equip actions
- profile mutation
- sync triggers
- account deletion

---

## TASK 19.5 — Privacy Audit

Verify private repository/activity data cannot leak through:

- public profile
- API response
- ranking
- logs
- client state

---

# 21. PHASE 20 — TESTING

---

## TASK 20.1 — Unit Test Coverage

Cover:

- normalization
- scoring
- prerequisites
- achievements
- quests
- currency
- idempotency

---

## TASK 20.2 — GitHub Fixtures

Test:

- active
- inactive
- new
- empty
- invalid
- large
- duplicated
- partial data

---

## TASK 20.3 — Playwright Core Journey

Test:

Guest
→ username search
→ profile
→ skill tree
→ node detail

---

## TASK 20.4 — Playwright Claim Journey

Test:

Guest
→ claim
→ OAuth
→ persistent profile

---

## TASK 20.5 — Playwright Economy Journey

Test:

Quest
→ CodeCoins
→ shop
→ purchase
→ inventory
→ equip

---

## TASK 20.6 — Playwright Leaderboard Journey

Test:

Season
→ eligibility
→ opt-in
→ leaderboard

---

# 22. PHASE 21 — DEPLOYMENT

---

## TASK 21.1 — Production Environment

Configure:

- application hosting
- database
- environment variables
- GitHub integration

---

## TASK 21.2 — Production Build

Verify:

- install
- build
- startup
- environment validation

---

## TASK 21.3 — Monitoring

Add:

- structured error logs
- synchronization monitoring
- API rate-limit visibility
- transaction failure visibility

---

## TASK 21.4 — Recovery

Document:

- backup
- rollback
- account recovery
- sync recovery

---

# 23. PHASE 22 — LAUNCH POLISH

---

## TASK 22.1 — Mobile QA

Test:

375x812
390x844

---

## TASK 22.2 — Desktop QA

Test:

768+
1024+
1280+
1440+

---

## TASK 22.3 — Visual Comparison

Compare implemented screens against:

references/approved-ui/

Review:

- spacing
- typography
- proportions
- component hierarchy
- color use
- animation
- responsive behavior

---

## TASK 22.4 — Empty / Loading / Error States

Every important screen should have:

- loading
- empty
- error
- populated

states.

---

## TASK 22.5 — Account Deletion

Implement and test account deletion flow.

---

## TASK 22.6 — README

README should include:

- product overview
- architecture
- local setup
- environment variables
- screenshots
- demo
- testing
- limitations

---

# 24. MVP CHECKPOINTS

## MVP 0 — Foundation

Complete:

- repository
- documentation
- design system
- application shell
- navigation

---

## MVP 1 — Visual Prototype

Complete:

- static profile
- static skill tree
- node details
- achievements
- shop
- customization
- quests
- leaderboard UI

No backend required yet.

---

## MVP 2 — Public Profile

Complete:

- GitHub public ingestion
- normalization
- scoring
- six attributes
- real skill eligibility
- achievements
- public profile

This is the first meaningful public RootRealm alpha.

---

## MVP 3 — Persistent RootRealm

Complete:

- OAuth
- account claiming
- database
- sync
- persistent progression

---

## MVP 4 — Gamified Platform

Complete:

- quests
- CodeCoins
- cosmetics
- inventory
- shop

---

## MVP 5 — Competitive Platform

Complete:

- seasons
- rank points
- opt-in leaderboard
- anti-farming

---

## V1 — Public Product

Complete:

- all core systems
- accessibility
- performance
- security
- monitoring
- deployment
- account deletion
- documentation
- QA

---

# 25. AI TASK PROMPT TEMPLATE

Use this structure for every coding-agent task:

```text
You are working on RootRealm.

Read:
- AGENTS.md
- docs/PRD.md
- docs/ARCHITECTURE.md
- docs/DATA_CONTRACT.md
- docs/DESIGN_SYSTEM.md
- docs/SCORING.md
- docs/TASKS.md

Also inspect:
- references/approved-ui/

Current task:
[TASK ID + TITLE]

Scope:
[small specific scope]

Acceptance criteria:
[measurable criteria]

Do NOT:
- implement future tasks
- redesign unrelated components
- invent domain fields
- modify unrelated architecture
- add unnecessary dependencies

Before finishing:
- run typecheck
- run lint
- run relevant tests
- run build when appropriate

Report:
- files changed
- dependencies added
- checks performed
- known limitations

STOP after this task.
```

---

# 26. FIRST IMPLEMENTATION TASK

The first actual coding-agent task is:

TASK 1.1 — Design Tokens

Do not implement:

- GitHub
- OAuth
- database
- scoring
- skill tree logic
- achievements logic
- shop logic
- leaderboard logic

The first coding milestone is the visual foundation.

---

# 27. VIBE-CODING RULE

The AI is allowed to implement.

The AI is NOT allowed to redefine the product.

Product direction comes from:

PRD
+
ARCHITECTURE
+
DATA_CONTRACT
+
DESIGN_SYSTEM
+
SCORING
+
TASKS

When the agent encounters ambiguity:

1. Prefer the existing documentation.
2. Prefer the smallest implementation.
3. Do not invent new product behavior.
4. Ask for a decision when the ambiguity affects architecture.

---

# 28. Completion Standard

RootRealm is not considered complete because the app "looks good."

A feature is complete when:

- requirements are implemented
- domain logic is correct
- data contracts are respected
- tests pass
- accessibility is considered
- responsive behavior works
- errors are handled
- no unrelated regressions exist

---

# 29. Final Build Order

```text
DOCUMENTATION
    ↓
DESIGN SYSTEM
    ↓
APP SHELL
    ↓
STATIC UI
    ↓
UI MOTION
    ↓
GITHUB INGESTION
    ↓
NORMALIZATION
    ↓
SCORING
    ↓
ATTRIBUTES
    ↓
SKILLS
    ↓
ACHIEVEMENTS
    ↓
REAL PROFILE
    ↓
OAUTH
    ↓
PERSISTENCE
    ↓
SYNC
    ↓
QUESTS
    ↓
COSMETICS
    ↓
CODECOINS
    ↓
SHOP
    ↓
SEASONS
    ↓
LEADERBOARDS
    ↓
ACCESSIBILITY
    ↓
PERFORMANCE
    ↓
SECURITY
    ↓
QA
    ↓
DEPLOYMENT
```
