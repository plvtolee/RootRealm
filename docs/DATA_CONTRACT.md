# DATA_CONTRACT

This document defines the shapes RootRealm passes between layers, and — more
importantly — **which layer is allowed to compute what**.

---

## 0. What this document is for

Two screens must not disagree about what "Builder" means, a UI must not invent an
XP total, and the skill tree must not decide eligibility from a pixel coordinate.
Those are only enforceable if the shapes are written down and referenced by
section.

Code cites this document as `DATA_CONTRACT §<n>`. The sections are numbered to
match the citations already in the tree; they are stable, so a reference does not
rot when a section is inserted.

**This document describes what the code does.** Where the implementation and an
earlier intent disagree, the disagreement is recorded here rather than hidden. If
this file and the TypeScript types disagree, the TypeScript types are correct and
this file is a bug.

---

## 1. Layers

```text
GitHub API
    ↓  lib/github/          parse + validate; no domain meaning
ActivityRecord
    ↓  lib/developer-event.ts   normalize; attach evidence and gaps
DeveloperEvent
    ↓  lib/scoring/         score; pure, no clock, no network
ScoreResult
    ↓  lib/scoring/ledger.ts    record, explainably
XPTransaction
    ↓  lib/skills/          derive eligibility from domain state
SkillDefinition + progress
    ↓  components/          render only; compute nothing
UI
```

Two rules govern every boundary:

1. **Data flows down. Meaning is added going down, never taken back up.** A
   component that needs a new number must not derive it; it must be derived
   upstream and arrive as a field.
2. **A layer that cannot reach the layer above's data may not imitate it.** This
   is what separates "computed" from "typed as if computed".

---

## 2. Vocabulary ownership

Shared vocabularies live in exactly one place, so two screens cannot drift.

| Vocabulary | Owner | Re-exported by |
| --- | --- | --- |
| `AttributeKey` (the six) | `lib/attributes.ts` | `components/profile/profile-data.ts` |
| `ScoringClassification` | `lib/scoring/types.ts` | — |
| `SkillDefinition` | `lib/skills/definition.ts` | — |

A second spelling of any of these is a defect, not a convenience.

---

## 3. XP is computed exactly once

`SCORING.md` owns the values. This contract owns their *shape*.

```ts
interface XPTransaction {
  id: string;              // "xp:<login>:<eventId>:<version>" — §18
  eventId: string;
  developerLogin: string;
  xp: number;              // integer
  classification: ScoringClassification;
  reason: string;          // human-readable, safe to render
  ruleId: string;          // e.g. "pr.merged"
  attributeAwards: AttributeAward[];
  scoringVersion: ScoringVersionId;
  breakdown?: ScoreLine[]; // present only when one award spans two §4 lines
  sourceUrl: string | null;
  awardedAt: string;       // supplied by the caller, never read from a clock
}
```

`id` **is** the idempotency key. Uniqueness is the mechanism that prevents a
double award, so it is the record's identity rather than metadata alongside one.

---

## 4. One event, one transaction

`SCORING.md` §33 specifies `scoreEvent(event, version): ScoreResult` — a single
result. §18's key is scoped to the event. Together they mean an event produces
**exactly one** transaction.

A merged pull request carrying a regression test is genuinely two lines of §4's
table. It is therefore **one transaction spanning both**, carrying a `breakdown`
naming each line's classification, rule and XP:

```ts
xp: 42,
breakdown: [
  { classification: "merged_pull_request", ruleId: "pr.merged", xp: 30 },
  { classification: "verified_regression_test", ruleId: "pr.regression_test", xp: 12 },
],
```

A bare `42` would not say whether that was two lines composed correctly or one
miscalibrated value. Two transactions for one event would collide on `id`.

---

## 5. Domain state and display data never share a shape

The most common defect in this codebase's history has been a mock value typed as
though it were measured. Three cases are live right now and are named here so
they cannot be mistaken for contract:

| Field | Actually | Not |
| --- | --- | --- |
| `MockProfile.xpCurrent` | a literal from the approved reference | a computed XP total |
| `SkillNode.progress` (prototype copy) | static, defaults to `requiredProgress` | measured progress |
| `ProfileAttribute.value` | a static illustrative number | derived attribute units |

The replacements exist or are coming:

- `MockProfile` → real state from ingestion (Phases 4–6)
- `SkillNode.progress` → `lib/skills` computes it from evidence (TASKS 6.4)
- `ProfileAttribute.value` → the attribute tally from `summarize`

**A new display type must say which it is.** If a screen cannot tell whether a
number is measured or illustrative from its type alone, the type is the problem.

---

## 6. Eligibility is derived, never stored

`SCORING.md` §26: eligibility "is derived from domain state". So:

```text
learned skills + evidence  →  status
```

`status` is a **computed** value (`locked` / `in-progress` / `eligible` /
`learned`), never a stored field. Storing it would let it disagree with the state
it claims to summarise.

The only persisted skill record is the set of learned ids (§6.3 of TASKS 6.5).

---

## 7. Attribution is per-owner

Anything describing a developer's progression is scoped to one login and must say
so. Two rules follow:

- **No aggregate across developers.** A leaderboard reads many owners' records; it
  never merges them into one figure.
- **Ownership is explicit.** `DeveloperEvent.developerLogin` is the only accepted
  answer to "whose work is this".

`SCORING.md` §32 ("Unequal Access") and §31 ("Private Work and Public Data")
govern what may be inferred at all. A field that would require private data does
not exist here, by design.

---

## 8. Presentation computes nothing

A component may format, sort for display, and choose what to show. It may not
derive a value the domain layer owns.

Concretely, a component may not:

- add XP together to get a level — `calculateLevel` owns that
- decide a skill is unlocked from its position — prerequisites own that
- read a coordinate as a requirement — see §9
- format a missing value as zero

---

## 9. What presentation owns

`DESIGN_SYSTEM.md` governs visual language. The structural split:

| Presentation | Domain |
| --- | --- |
| `visualX`, `visualY` | `prerequisiteIds` |
| tier ordering for display | tier as a gate |
| glyph, flavour text, colour | requirement, cost, status |
| list sort order | — |

Coordinates are **never** read by eligibility logic. This is asserted in
`skill-tree-logic.ts` and restated here because it is the rule most likely to be
broken by a well-meaning refactor: moving a node for visual reasons must not
change what it requires.

---

## 10. Version identifiers are closed unions

`ScoringVersionId` and `LevelCurveId` are unions of literals, not `string`.
Versioning is how `SCORING.md` §3's "must not rewrite history" is actually
enforced — a typo in a free string would silently create a version nobody defined.

Every XP value and level threshold lives **on the version**, never as a module
constant. Tuning produces a new version; it does not edit an old one.

---

## 11. Sections cited in code

Kept at the end so the numbering matches existing references.

- **§13 — presentation does not compute XP.** Display values are formatted, never
  calculated. See `components/profile/profile-identity.tsx`.
- **§14 — `AttributeType`.** The six attributes, in order: `builder`, `debugger`,
  `scholar`, `collaborator`, `maintainer`, `architect`. Keys are the contract's
  lowercase enum values; labels are display names. **No attribute carries a
  colour** — the approved documents define no attribute→colour mapping, and no
  screen may invent one. See `lib/attributes.ts`.
- **§16 — `SkillNode`.** Domain fields (`id`, `category`, `type`, `tier`,
  `requiredProgress`, `prerequisiteIds`, `cost`) versus presentation fields
  (`visualX`, `visualY`, `icon`, `flavor`, `effects`). Presentation fields never
  influence eligibility. See `components/skill-tree/skill-tree-data.ts` and
  `lib/skills/definition.ts`.
- **§18 — achievement `rarity`.** `common | rare | epic | legendary`. See
  `components/profile/profile-data.ts`.

### 11.1 Known drift in the citations

Recorded rather than silently fixed, because the code is the truth and the
citation is the thing that is wrong:

- The code says `SkillNode.category`; the prototype's field is named **`branch`**
  (`skill-tree-data.ts`) and TASKS 6.1's `SkillDefinition` also uses **`branch`**.
  `category` is the contract's name, not the field's.
- `SkillNode.progress` and the mock reward fields exist in the **prototype copy
  only**. TASKS 6.1's `SkillDefinition` deliberately omits them; see §5.