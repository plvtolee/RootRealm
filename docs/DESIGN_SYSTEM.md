# ROOTREALM — DESIGN SYSTEM

## 1. Design Philosophy

RootRealm is a premium developer product with RPG-inspired progression.

The interface should feel:

- technical
- mysterious
- minimal
- premium
- intentional
- responsive

The default interface is visually quiet.

Interaction, progression and customization introduce controlled visual
expression.

RootRealm is not a traditional fantasy RPG interface.

Avoid:
- fantasy HUDs
- noisy game interfaces
- excessive ornamentation
- generic AI-generated character art
- excessive neon
- excessive particles

---

# 2. Core Visual Language

The primary interface is monochrome with controlled accent color.

The base interface should remain neutral.

Accent color communicates:

- selection
- progression
- rarity
- achievement
- equipped cosmetics
- important actions

The user-selected cosmetic system can introduce additional accent colors,
but the underlying UI remains restrained.

---

# 3. Color Tokens

## Base

Background:

#0B0C0E

Elevated Surface:

#131518

Secondary Surface:

#1B1D22

Primary Text:

#F1F1F4

Secondary Text:

#9A9DA6

Hairline Border:

#2B2E35

## Default Accent

Soft Violet:

#B49AF7

## Optional Accents

Cyan
Crimson
Amber / Gold
Emerald

These accents should be used intentionally rather than simultaneously.

---

# 4. Semantic Color Roles

Background:
--color-bg

Surface:
--color-surface

Surface Secondary:
--color-surface-secondary

Text Primary:
--color-text-primary

Text Secondary:
--color-text-secondary

Border:
--color-border

Accent:
--color-accent

Success:
--color-success

Warning:
--color-warning

Danger:
--color-danger

---

# 5. Typography

Use a neutral modern sans-serif.

Preferred:

Inter or equivalent.

Typography hierarchy:

Display
Large section titles and identity moments.

Heading
Screen and section titles.

Subheading
Supporting section hierarchy.

Body
Descriptions and normal content.

Caption
Metadata, timestamps and supporting information.

Label
Buttons, filters, tabs and status indicators.

Use weight and spacing to establish hierarchy before using color.

Avoid excessive font variation.

---

# 6. Spacing

Use a consistent spacing scale:

4px
8px
12px
16px
24px
32px
48px
64px

Do not introduce arbitrary spacing values unless necessary for a
specific visual correction.

---

# 7. Radius

Cards:

8–14px

Buttons:

8–12px

Inputs:

8–12px

Avatar:

Circular

Skill nodes:

Shape may vary based on node hierarchy but should remain geometrically
consistent.

Avoid overly rounded "mobile SaaS" styling.

---

# 8. Borders

Borders are subtle.

Default:

1px solid #2B2E35

Do not put decorative borders around every element.

Use borders primarily for:

- cards
- panels
- controls
- separators
- interactive states

---

# 9. Elevation

Depth should be subtle.

Preferred techniques:

- surface contrast
- border contrast
- restrained shadow
- limited glow

Do not rely on large shadows or dramatic neon lighting.

---

# 10. Glow

Glow is meaningful, not decorative.

Use it for:

- equipped avatar frames
- unlocked skill nodes
- rare achievements
- selected nodes
- progression events

Do not use glow for:

- every button
- every card
- every icon
- normal text
- navigation items
- background decoration

---

# 11. Motion

Normal UI transitions:

150–250ms

Reward / progression reveals:

400–900ms

Motion should communicate state.

Use:

- opacity
- scale
- transform
- stroke drawing
- restrained glow
- controlled rotation

Avoid:

- constant floating objects
- aggressive bouncing
- unnecessary parallax
- constant particle movement

---

# 12. Reduced Motion

All major animated features must support reduced motion.

When reduced motion is enabled:

- remove unnecessary movement
- disable decorative particles
- replace animated reveals with fades or instant state changes
- preserve information and hierarchy

---

# 13. Avatar System

The avatar should primarily be:

1. User-uploaded photo
2. GitHub avatar
3. Curated abstract/geometric avatar

Do not generate generic AI anime portraits.

The avatar frame is one of RootRealm's main cosmetic surfaces.

Frames use:

- SVG geometry
- CSS
- gradients where appropriate
- optional GSAP animation

Frame intensity should be configurable.

---

# 14. Avatar Frames

Initial frame direction:

## Oblivion

Neutral monochrome frame.

## Void Pulse

Restrained violet animated frame.

## Azure Current

Restrained cyan animated frame.

Future:

- Ember Crown
- Emerald variants
- seasonal frames
- rare achievement frames

Frames should remain visually distinct without changing the avatar itself.

---

# 15. Profile

The profile is the central identity screen.

Default presentation should remain sparse.

Core hierarchy:

Avatar
↓
Developer Name
↓
Title
↓
Level / XP
↓
Six Attributes
↓
Featured Project
↓
Achievements
↓
Current Quest

The avatar frame should be one of the strongest visual elements.

The rest of the interface should support it rather than compete with it.

---

# 16. Skill Tree

The skill tree is RootRealm's signature visual feature.

It must be a real branching tree rather than a static grid.

Structure:

Roots
↓
Foundation
↓
Intermediate Branches
↓
Advanced Branches
↓
Mastery / Canopy

Branches should feel organic while remaining precise and readable.

---

# 17. Skill Node States

## Locked

Dimmed.

Low visual emphasis.

## In Progress

Outlined or partially illuminated.

Show progress clearly.

## Eligible

Visually indicates that requirements are satisfied.

## Unlocked

Restrained luminous treatment.

## Selected

Accent outline and stronger information hierarchy.

---

# 18. Skill Tree Motion

When a skill unlocks:

1. Start from the nearest unlocked parent.
2. Draw the changed branch.
3. Reveal the node.
4. Apply a restrained glow.
5. Stop.

Do not animate the entire tree every time it loads.

Only changed progression should animate.

---

# 19. Achievements

Achievements use visual rarity carefully.

Preferred hierarchy:

Common
Rare
Epic
Legendary

Rarity should affect:

- accent
- border treatment
- subtle glow
- reveal animation

Avoid making every achievement look legendary.

Achievement cards should prioritize:

Icon
↓
Title
↓
Requirement
↓
Evidence
↓
Earned date

---

# 20. Shop

The shop is a cosmetic marketplace.

Supported categories:

- frames
- banners
- titles
- effects
- themes

Every item must support:

- preview
- rarity
- price
- ownership state
- equipped state

The preview should use the current user's avatar.

---

# 21. Customization

Customization should provide:

- live preview
- avatar selection
- frame selection
- banner selection
- title selection
- theme selection
- effects selection

The preview area should remain visually dominant.

Controls remain neutral.

---

# 22. Navigation

Mobile-first bottom navigation.

Initial destinations:

Home
Skill Tree
Achievements
Shop
Profile

Use icons plus labels where space permits.

Selected destination uses the current accent.

Do not over-animate navigation.

---

# 23. Cards

Cards should be:

- compact
- information-dense
- restrained
- visually consistent

Default:

background:
#131518

border:
#2B2E35

radius:
10–14px

Cards should not become decorative containers for everything.

Use open layouts where appropriate.

---

# 24. Buttons

Primary button:

- strong contrast
- restrained accent
- clear text

Secondary button:

- surface background
- subtle border

Danger:

- restrained crimson semantic treatment

Disabled:

- reduced contrast
- no distracting animation

Buttons should never depend on glow alone to indicate interactivity.

---

# 25. Inputs

Inputs should have:

- clear labels
- strong focus state
- readable contrast
- predictable height
- subtle border

Focus state may use the current accent.

---

# 26. Icons

Prefer:

- simple geometric SVG icons
- Lucide-style utility icons
- custom SVG for RootRealm-specific elements

Icons should share:

- stroke weight
- optical size
- alignment

Avoid mixing unrelated icon styles.

---

# 27. Backgrounds

Default background should remain near-black.

Optional backgrounds may use:

- extremely subtle gradients
- architectural abstractions
- geometric textures

Do not use large fantasy scenes behind application content.

---

# 28. Decorative Effects

Allowed:

- subtle scanline
- restrained aura
- minimal particle drift
- subtle ripple
- SVG frame animation
- branch drawing

Effects must remain optional where practical.

Provide a reduced-effects or reduced-motion path.

---

# 29. Responsive Design

Design mobile first.

Primary targets:

375 × 812
390 × 844

Then support:

768+
1024+
1280+
1440+

Do not simply stretch the mobile interface to desktop.

Desktop may introduce:

- wider content regions
- expanded navigation
- larger tree canvas
- multi-column profile layouts

while preserving the same visual hierarchy.

---

# 30. Touch Targets

Interactive targets should be comfortable for touch.

Avoid tiny nodes and controls on mobile.

The skill tree must provide an alternative accessible list/detail
interaction for precise navigation.

---

# 31. Accessibility

Required:

- semantic HTML
- sufficient contrast
- keyboard focus
- keyboard traversal
- screen-reader labels
- reduced-motion support
- accessible tree alternative
- meaningful button labels
- visible focus state

Do not make essential information dependent on animation.

---

# 32. Component Philosophy

Prefer reusable components.

Examples:

- RootHeader
- BottomNavigation
- ProfileHeader
- XPProgress
- AttributeCard
- SkillTree
- SkillNode
- SkillNodeDetail
- AchievementCard
- CosmeticCard
- ShopPreview
- AvatarFrame
- QuestCard
- RankBadge

Components should be driven by typed props and data.

Avoid deeply duplicated markup.

---

# 33. Visual Guardrail

At rest:

RootRealm should look mostly monochrome.

During interaction:

RootRealm becomes expressive.

During progression:

RootRealm becomes celebratory.

The contrast between these states is intentional.

The interface should never look maximally animated all the time.