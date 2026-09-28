# ROOTREALM — PRODUCT REQUIREMENTS DOCUMENT

## 1. Product Vision

RootRealm is an RPG-inspired developer identity and progression platform
that converts verifiable GitHub activity into transparent progression,
an expandable living skill tree, achievements, cosmetics, personalized
profiles and optional seasonal competition.

RootRealm should feel like an RPG system without becoming a traditional
RPG game.

---

## 2. Core Product Idea

A developer enters a public GitHub username.

RootRealm:

1. Retrieves available public GitHub evidence.
2. Normalizes that activity into a stable event model.
3. Calculates explainable XP and attribute progress.
4. Determines achievement and skill eligibility.
5. Presents the result as a developer character/profile.
6. Visualizes progression through a living skill tree.

The system must make it clear that public GitHub activity is observed
evidence and does not represent a complete developer career history.

---

## 3. Target Users

### Developer exploring a profile

A user enters a public GitHub username and receives a generated
developer profile.

### Developer claiming a profile

A developer connects GitHub through OAuth, verifies ownership of the
matching account and enables persistent progression.

### Returning developer

A claimed user synchronizes new eligible GitHub activity, receives
new progression and achievements, and customizes their profile.

### Competitive developer

A user can voluntarily participate in seasonal rankings with
published eligibility and scoring rules.

### Visitor

Anyone can open and inspect a public RootRealm profile without logging in.

---

## 4. Core Product Loop

GitHub activity
→ normalized evidence
→ deterministic scoring
→ XP and attributes
→ skill progression
→ achievements
→ developer profile

A separate cosmetic loop exists:

Quests / milestones
→ CodeCoins
→ cosmetic items
→ customization

Competitive progression is separate:

Eligible activity
→ season rules
→ Rank Points
→ opt-in leaderboard

---

## 5. Core Screens

### Home / Profile

Contains:

- avatar
- equipped animated frame
- developer name
- title
- level
- XP
- six skill summaries
- featured project
- current quest
- achievement highlights
- featured repositories
- optional seasonal rank

Mobile uses a single-column layout with persistent bottom navigation.

### Skill Tree

Contains:

- category tabs
- organic branching skill graph
- tier labels
- progress
- locked nodes
- eligible nodes
- unlocked nodes
- node details

Interaction:

- pan
- zoom
- fit-to-screen
- focus selected node
- expand/collapse branches
- node selection
- keyboard traversal on desktop
- accessible list fallback

### Node Details

Contains:

- node title
- description
- verified requirements
- progress
- reward
- evidence/source links
- current status

### Achievements

Contains:

- filters
- rarity
- unlock criteria
- earned dates
- evidence

### Shop

Contains:

- avatar frames
- banners
- titles
- effects
- balance
- item previews
- purchase flow

### Customization

Contains:

- avatar
- frame
- banner
- title
- theme
- effects
- equipped state
- live preview

### Leaderboard

Contains:

- current season
- ranking
- eligibility
- opt-in controls
- global/friends scope where supported

### Quests

Contains:

- daily quests
- weekly quests
- goal-based quests
- progress
- evidence
- completion state

### Settings

Contains:

- GitHub permissions
- privacy
- notifications
- reduced motion
- account deletion

---

## 6. Six Core Attributes

RootRealm uses six developer attributes:

- Builder
- Debugger
- Scholar
- Collaborator
- Maintainer
- Architect

### Builder

Evidence examples:

- qualifying implementation pull requests
- shipped features

### Debugger

Evidence examples:

- linked bug fixes
- regression tests

### Scholar

Evidence examples:

- documentation
- learning projects

### Collaborator

Evidence examples:

- pull-request reviews
- discussions
- cross-project work

### Maintainer

Evidence examples:

- releases
- issue triage
- CI maintenance

### Architect

Evidence examples:

- verified refactoring
- modularization
- design/system work

---

## 7. Progression Principles

XP must be:

- deterministic
- explainable
- evidence-backed
- versioned

Skill nodes unlock through verified prerequisites.

Users cannot purchase skill progression using CodeCoins.

Achievements require defined criteria and evidence.

Cosmetics must never affect contribution scoring.

---

## 8. Public Profile Principles

The public profile is the central identity page.

The default presentation should remain sparse and premium.

The profile may display:

- avatar
- animated frame
- title
- level
- XP
- six attribute indicators
- achievements
- featured repositories
- optional seasonal ranking

Cosmetics modify presentation only.

---

## 9. Guest-to-Claim Journey

Guest:

Public username search
→ generated preview
→ inspect profile

Claim:

Connect GitHub
→ verify ownership
→ claim matching profile
→ enable persistence

The initial public preview does not require account creation.

---

## 10. GitHub Data Principles

RootRealm initially consumes public GitHub evidence.

The system must:

- support pagination
- normalize raw responses
- deduplicate events
- track fetch coverage
- distinguish observed public activity from complete history
- handle missing data explicitly
- handle rate limits
- handle invalid or unavailable users

Private repositories require explicit authorization and must not
be publicly exposed without user consent.

---

## 11. Gamification Economy

### XP

Permanent progression.

### Attributes

Specialized progression based on evidence.

### Achievements

Milestone-based collectibles.

### CodeCoins

Earnable cosmetic currency.

CodeCoins can be spent on visual customization.

### Rank Points

Separate seasonal competitive score.

Rank Points must not replace permanent XP.

---

## 12. Fairness

RootRealm must avoid rewarding:

- trivial commit farming
- duplicated events
- repetitive self-generated activity
- raw volume without meaningful evidence

The system should account for:

- incomplete public data
- private work
- unequal access to open-source opportunities

Every scoring event should have an inspectable explanation.

---

## 13. Competition

Leaderboards are:

- opt-in
- season-scoped
- governed by published eligibility rules
- separate from permanent developer progression

Competitive scoring must include anti-farming protections.

---

## 14. Visual Direction

RootRealm uses a near-black monochrome visual language.

Base:

- #0B0C0E background
- #131518 elevated surface
- #1B1D22 secondary surface
- #F1F1F4 primary text
- #9A9DA6 secondary text
- #2B2E35 hairline border
- #B49AF7 default accent

Optional accents:

- cyan
- crimson
- amber/gold
- emerald

The UI should remain quiet at rest.

Expressive visual effects should be concentrated around:

- equipped avatar frames
- selected skill nodes
- rank badges
- rare achievements
- progression events

Avoid:

- generic AI anime portraits
- giant fantasy backgrounds
- excessive particles
- glowing every UI element
- ornamental borders everywhere

---

## 15. Mobile First

Primary initial targets:

- 375 × 812
- 390 × 844

Then support:

- tablet
- desktop
- large displays

Touch interactions must be considered first.

---

## 16. Accessibility

RootRealm must support:

- reduced motion
- sufficient contrast
- semantic navigation
- keyboard traversal
- screen-reader descriptions
- accessible skill-tree list fallback
- usable touch targets

---

## 17. V1 Scope

### Must have

- public GitHub username search
- normalized GitHub evidence
- explainable XP
- six attributes
- living skill tree
- achievements
- public developer profile

### V1.1 / later

- GitHub OAuth
- persistent accounts
- synchronization
- quests
- cosmetics
- CodeCoins
- shop
- seasonal leaderboards

### Explicitly out of scope

- dungeon exploration
- repository fantasy world maps
- multiplayer RPG combat
- procedural planets
- 3D world
- pay-to-win progression

---

## 18. Product Guardrail

When deciding whether to build a feature, ask:

Does it improve:

- developer identity
- transparent progression
- meaningful customization
- the competitive/social loop

If not, defer it.