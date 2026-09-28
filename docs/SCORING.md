# ROOTREALM — SCORING SYSTEM

Version: 1.0
Status: Initial scoring specification

This document defines how verified GitHub evidence can produce
RootRealm progression.

Scoring is an application mechanic, not a scientific measurement of
developer skill.

RootRealm scores observable GitHub activity within a defined evidence
scope. It must never claim to measure a developer's complete ability,
career value or engineering competence.

The scoring system must remain deterministic, versioned, inspectable
and resistant to trivial farming.

---

# 1. Scoring Goals

The scoring system must be:

- explainable
- evidence-backed
- deterministic
- versioned
- resistant to trivial farming
- reasonably balanced across different forms of contribution
- understandable to users
- testable without React
- independent from cosmetics

Every meaningful award should be explainable.

Example:

+30 XP
Merged Pull Request

Repository:
RootRealm

Evidence:
GitHub PR #42

Scoring version:
scoring-v1

---

# 2. Scoring Pipeline

The canonical scoring flow is:

DeveloperEvent[]
      ↓
Eligibility checks
      ↓
Event classification
      ↓
Contribution value
      ↓
XP award
      ↓
Attribute contribution
      ↓
Ledger transaction

The scoring engine must not directly unlock visual effects.

UI consumes the results.

---

# 3. Scoring Version

Every scoring calculation belongs to a named scoring version.

Example:

scoring-v1

Future versions:

scoring-v2
scoring-v3

A historical XP transaction must retain the scoring version that
generated it.

Changing scoring values for future activity must not silently rewrite
historical transactions.

---

# 4. Starting XP Values

The blueprint provides the following illustrative starting values:

Merged Pull Request: +30 XP

Linked Issue Closure: +20 XP

Completed Review: +15 XP

Release: +25 XP

Qualifying Documentation: +10 XP

Qualifying Commit: +3 XP

Verified Regression Test: +12 XP

These values are starting placeholders for implementation and tuning.

They are NOT final balance values.

They should be tested against real sample profiles before public
launch.

---

# 5. Event Eligibility

An event should only produce progression when it satisfies the
relevant evidence rule.

General eligibility checks:

1. Event exists in normalized form.
2. Event has a stable source identity.
3. Event belongs to the relevant developer.
4. Event has sufficient evidence confidence.
5. Event is not already rewarded.
6. Event passes event-specific qualification rules.
7. Event is within the scoring scope.
8. Event is not rejected by anti-farming rules.

---

# 6. Evidence Confidence

RootRealm supports:

verified

inferred

For initial progression:

Verified evidence should be preferred for high-value progression.

Inferred evidence should not automatically receive the same treatment
as directly verified evidence.

The exact use of inferred evidence must be defined per scoring rule.

Do not silently treat inferred data as verified.

---

# 7. Commit Scoring

Baseline:

Qualifying commit: +3 XP

A commit is not automatically valuable merely because it exists.

The scoring system must avoid rewarding large amounts of trivial commit
activity.

Potential qualification signals may include:

- repository context
- event relationships
- whether the commit is part of a qualifying change
- duplication/repetition checks

The initial implementation may keep commit qualification simple,
then tighten anti-farming rules using real examples.

Do not reward every commit in a long repetitive sequence without
considering farming controls.

---

# 8. Pull Request Scoring

Baseline:

Merged pull request: +30 XP

A qualifying merged PR represents shipped implementation work.

The PR should be:

- attributable to the developer
- successfully merged
- backed by a stable GitHub source
- not previously rewarded

Do not create duplicate XP when the same PR is observed through
multiple ingestion paths.

Additional PR-related activity may contribute to other attributes
through separate rules.

---

# 9. Review Scoring

Baseline:

Completed review: +15 XP

A qualifying review should represent an actual GitHub pull-request
review event.

Review rules should avoid rewarding repetitive or meaningless
self-generated activity.

Review evidence should contribute primarily to:

Collaborator

and may contribute to other attributes only if explicitly defined.

---

# 10. Issue Closure Scoring

Baseline:

Linked issue closure: +20 XP

The event must represent a qualifying issue closure associated with
the developer's work.

Do not award XP simply because the developer closed an arbitrary issue
without sufficient evidence.

Where possible, retain the source issue URL.

---

# 11. Release Scoring

Baseline:

Release: +25 XP

A release should represent a qualifying repository release event
attributable to the developer.

Releases contribute primarily to:

Maintainer

and may also support other progression rules where explicitly defined.

Repeated or duplicate observations of the same release must not award
additional XP.

---

# 12. Documentation Scoring

Baseline:

Qualifying documentation: +10 XP

Documentation must be classified as meaningful qualifying work rather
than simply any textual change.

Documentation may contribute primarily to:

Scholar

Potential future categories can include:

- README improvements
- guides
- project documentation
- learning material

The qualification rules should become more precise as the data model
matures.

---

# 13. Regression Test Scoring

Baseline:

Verified regression test: +12 XP

A regression test should represent meaningful test coverage associated
with fixing or preventing a defect.

This contributes primarily to:

Debugger

The system should avoid rewarding repetitive or meaningless test
generation.

---

# 14. Attribute Mapping

RootRealm uses six core attributes.

## Builder

Primary evidence:

- merged implementation PRs
- shipped features
- qualifying implementation work

Baseline intent:

Builder represents shipping and implementation.

---

## Debugger

Primary evidence:

- linked bug fixes
- regression tests
- reliability hardening

Baseline intent:

Debugger represents diagnosis, fixing and reliability work.

---

## Scholar

Primary evidence:

- qualifying documentation
- research/learning projects

Baseline intent:

Scholar represents learning, documentation and knowledge work.

---

## Collaborator

Primary evidence:

- completed PR reviews
- discussions
- cross-project work

Baseline intent:

Collaborator represents collaboration and peer contribution.

---

## Maintainer

Primary evidence:

- releases
- issue triage
- CI maintenance

Baseline intent:

Maintainer represents operational stewardship.

---

## Architect

Primary evidence:

- verified refactoring
- modularization
- system design work

Baseline intent:

Architect represents structural and systems-level contribution.

Architect scoring should be conservative because the underlying evidence
is harder to infer reliably from public GitHub activity.

---

# 15. XP and Attribute Separation

XP and attribute progression are related but conceptually separate.

Example:

Merged PR

may award:

+30 XP

and:

Builder + qualifying attribute progress

The attribute system must not simply assume that:

attribute value = XP.

Attributes represent specialization.

XP represents broad permanent progression.

---

# 16. Attribute Progress Units

Use a separate attribute progression value.

Example:

```ts
type AttributeAward = {
  attribute:
    | "builder"
    | "debugger"
    | "scholar"
    | "collaborator"
    | "maintainer"
    | "architect"

  amount: number

  eventId: string

  ruleId: string
}
```

This allows attribute balances to evolve independently from the global
XP balance.

---

# 17. Explanation Ledger

Every scoring decision should be inspectable.

Example:

Event:
PR #42

Classification:
merged_pull_request

Global reward:
+30 XP

Attribute:
Builder

Attribute reward:
+1 contribution unit

Reason:
Merged implementation pull request

Scoring version:
scoring-v1

Source:
GitHub PR #42

This data should be available to the profile/progression UI.

---

# 18. Idempotency

Scoring must be idempotent.

For the same eligible event:

First processing:
award progression

Repeated processing:
do not award progression again

The primary protection is a stable event identity plus an idempotency
key.

Example:

xp:user123:event456:scoring-v1

---

# 19. Duplicate Detection

Duplicate events may originate from:

- multiple GitHub endpoints
- repeated syncs
- pagination overlap
- retry operations
- webhook/poll combinations

The scoring engine must assume that duplicate input is possible.

No event should produce multiple awards simply because it was observed
multiple times.

---

# 20. Anti-Farming Principles

RootRealm must avoid optimizing for raw contribution volume.

Do not reward:

- trivial commit spam
- repetitive meaningless changes
- self-generated review loops
- duplicated contribution events
- artificial activity patterns
- repeated identical actions designed only to gain XP

The goal is meaningful progression rather than maximum event count.

---

# 21. Anti-Farming Strategy

Initial protections:

1. Stable event identity.
2. Duplicate event rejection.
3. Idempotent rewards.
4. Separate treatment of high-volume event types.
5. Evidence requirements for high-value actions.
6. Published scoring rules.
7. Versioned scoring.
8. Per-event explanation.

Future protections may include:

- diminishing returns
- contribution quality heuristics
- temporal caps
- repository-context checks
- cross-event relationships

Do not introduce complex heuristics until real data demonstrates
that they are needed.

---

# 22. Volume vs Value

RootRealm should not treat every GitHub event equally.

Conceptually:

High-value evidence:
- merged implementation PR
- meaningful release
- verified bug fix
- substantive review

Lower-value evidence:
- isolated commit
- low-context activity

This is why the illustrative starting values assign different XP
amounts.

The exact balance should be tuned using real sample profiles.

---

# 23. No Negative XP

Initial scoring should not remove XP because of:

- inactivity
- reduced contribution frequency
- missed quests

Permanent progression should remain stable.

Competitive rank systems are separate and may have their own
season rules.

---

# 24. XP Leveling

The exact level curve is intentionally not finalized.

Implementation should isolate the level calculation:

```ts
calculateLevel(totalXp, levelCurveVersion)
```

The level curve must be:

- deterministic
- versioned
- easy to tune

Do not hard-code level calculations throughout UI components.

---

# 25. Example Initial Level Model

For prototyping only, RootRealm may use a simple increasing threshold
model.

Example:

Level 1:
0 XP

Level 2:
100 XP

Level 3:
250 XP

Level 4:
450 XP

Level 5:
700 XP

These numbers are placeholders.

Do not treat them as final economy values.

The final curve should be tuned after observing actual developer
profiles.

---

# 26. Skill Eligibility

Skills must not be unlocked solely from global XP.

A skill node uses:

- prerequisite skills
- category progress
- evidence requirements
- required progress

Example:

```text
Merged PR count ≥ 5
        +
Builder prerequisite unlocked
        ↓
Eligible
```

Eligibility is derived from domain state.

CodeCoins cannot bypass skill requirements.

---

# 27. Achievement Scoring

Achievements should not simply mirror XP totals.

Examples:

First Merge

Condition:
At least one qualifying merged PR

First Release

Condition:
At least one qualifying release

Reviewer

Condition:
At least one qualifying completed review

The achievement system owns its own criteria.

---

# 28. Quest Rewards

Quests may award:

- XP
- CodeCoins
- cosmetic rewards

Quest rewards must not directly fabricate GitHub evidence.

Completing a quest awards the defined reward only after the actual
quest criteria are satisfied.

---

# 29. CodeCoins

CodeCoins are cosmetic currency.

They are NOT:

- XP
- skill points
- ranking points
- developer quality scores

CodeCoins can purchase visual items.

Users cannot purchase skill nodes with CodeCoins.

---

# 30. Seasonal Rank Points

Rank Points are separate from:

- XP
- attributes
- CodeCoins

Rank Points exist only within a season.

The ranking system must be:

- opt-in
- season-scoped
- transparent
- anti-farming

A high permanent XP total does not automatically define seasonal rank.

---

# 31. Private Work and Public Data

Public GitHub activity is incomplete evidence.

Do not interpret:

No public evidence

as:

No actual engineering work.

The product should clearly communicate this limitation.

Private repository activity should only enter scoring when explicitly
authorized and supported by the product's privacy model.

---

# 32. Unequal Access

The scoring system must account conceptually for unequal access to:

- open source
- public repositories
- public collaboration
- public maintainer roles

RootRealm should avoid presenting the resulting score as a universal
measure of developer ability.

---

# 33. Scoring API

Preferred pure interfaces:

```ts
scoreEvent(
  event: DeveloperEvent,
  scoringVersion: ScoringVersion
): ScoreResult
```

```ts
scoreEvents(
  events: DeveloperEvent[],
  scoringVersion: ScoringVersion
): ScoreResult[]
```

```ts
calculateAttributes(
  events: DeveloperEvent[],
  scoringVersion: ScoringVersion
): AttributeAward[]
```

```ts
calculateLevel(
  totalXp: number,
  levelCurveVersion: string
): number
```

---

# 34. Score Result

Suggested shape:

```ts
type ScoreResult = {
  eventId: string

  eligible: boolean

  xp: number

  reason: string

  attributeAwards: {
    attribute:
      | "builder"
      | "debugger"
      | "scholar"
      | "collaborator"
      | "maintainer"
      | "architect"

    amount: number
  }[]

  scoringVersion: string

  rejectionReason?: string
}
```

---

# 35. Rejection Reasons

Scoring should produce machine-readable rejection reasons where useful.

Examples:

```text
duplicate_event
invalid_event
insufficient_evidence
not_attributable
not_qualifying
already_rewarded
outside_scoring_scope
anti_farming_rule
unsupported_event
```

The user-facing UI can convert these into appropriate explanations.

---

# 36. Testing Requirements

The scoring engine must have unit tests for:

- every supported event type
- positive scoring
- zero/invalid scoring
- duplicate events
- idempotency
- scoring version changes
- attribute mapping
- skill prerequisites
- achievement criteria
- anti-farming rules

Fixtures should include:

- active profile
- inactive profile
- new profile
- large profile
- empty profile
- duplicate activity
- mixed activity

---

# 37. Example Scoring Cases

## Case A — Merged PR

Input:

Merged PR

Result:

+30 XP
Builder contribution

---

## Case B — Completed Review

Input:

Completed review

Result:

+15 XP
Collaborator contribution

---

## Case C — Release

Input:

Qualifying release

Result:

+25 XP
Maintainer contribution

---

## Case D — Duplicate PR

Input:

Same PR processed twice

Result:

First:
+30 XP

Second:
0 XP
Reason:
already_rewarded

---

## Case E — Trivial Commit Burst

Input:

Large number of repetitive low-value commits

Result:

Events may be rejected or constrained according to anti-farming rules.

Do not assume one commit always means one valuable contribution.

---

# 38. Tuning Process

Initial scoring values should be tested against real sample GitHub
profiles.

Compare:

- very active profiles
- moderately active profiles
- new developers
- inactive profiles
- maintainers
- reviewers
- documentation-heavy profiles

Look for:

- runaway XP
- contribution-type imbalance
- excessive Builder dominance
- underrepresented attributes
- trivial activity inflation
- impossible skill pacing

Scoring should be tuned before public leaderboard competition.

---

# 39. Scoring Guardrails

Rule 1:
Every progression award must have evidence.

Rule 2:
Every event must have a stable identity.

Rule 3:
Duplicate events must not duplicate rewards.

Rule 4:
Scoring rules must be versioned.

Rule 5:
XP must be explainable.

Rule 6:
Attributes must remain distinct from global XP.

Rule 7:
CodeCoins must remain separate from progression.

Rule 8:
Rank Points must remain separate from XP.

Rule 9:
The system must not claim that the score represents complete
developer ability.

Rule 10:
Do not add complex anti-farming heuristics without evidence that they
are needed.

---

# 40. Final Scoring Pipeline

GitHub event
      ↓
Normalize
      ↓
Validate
      ↓
Deduplicate
      ↓
Eligibility check
      ↓
Scoring version
      ↓
XP award
      ↓
Attribute award
      ↓
Ledger transaction
      ↓
Skill / Achievement / Quest evaluation
      ↓
Profile state

The scoring engine is deterministic and independent from the UI.

The user should always be able to understand:

WHAT happened
WHY it qualified
HOW MUCH progression it produced
WHICH rule/version was used
WHERE the evidence came from
