# Lucky UI Direction

## Objective

Define a distinctive visual and interaction direction for Lucky so the product stops reading like a generic AI-generated admin dashboard and instead feels like a premium Discord operations console.

This direction preserves Lucky's existing brand strengths:

- dark-first interface
- premium, playful, high-contrast tone
- purple + gold brand system
- `Sora`, `Manrope`, and `JetBrains Mono`

It changes how those ingredients are composed.

## Core Positioning

Lucky should feel like a guild command center, not a startup analytics template.

The product is used by Discord server owners and moderators to control live systems: moderation, automations, embeds, music, and community workflows. The UI should communicate authority, clarity, and readiness.

### Product Character

- professional, but not sterile
- premium, but not luxurious for its own sake
- Discord-native, but not derivative of Discord's default UI
- operational, but still expressive
- memorable, but still intuitive

## What To Avoid

Lucky should explicitly avoid the current wave of generic AI product aesthetics:

- interchangeable SaaS card grids
- soft glassmorphism everywhere
- vague purple gradients with no layout identity
- oversized rounded cards with weak information hierarchy
- decorative glow used instead of structure
- generic hero/stat/feature panel composition repeated across screens
- settings pages that feel like raw forms instead of controlled workflows

## Reference Signals

The best Discord bot panels feel purpose-built for server administrators.

- `carl.gg`: good reference for modular, operational clarity and bot-native utility framing
- `mee6.xyz`: strong reminder that brand distinctiveness matters more than generic dashboard polish
- `dyno.gg`: useful benchmark for dense admin tooling and guild-management orientation

Lucky should learn from the category without copying visual language one-to-one.

## Design Thesis

Use editorial hierarchy on top of operational structure.

That means:

- stronger page framing
- more intentional asymmetry
- denser and sharper control surfaces
- fewer generic cards, more purposeful panels
- gold used as a signal color, not as decoration
- technical and moderation data treated like system state, not marketing metrics

## Visual Direction

### Mood

- obsidian control room
- midnight broadcast console
- premium moderation toolkit
- atmospheric, precise, confident

### Composition

- prefer structured panels over floating card collections
- use sectional framing and panel groupings to create rhythm
- mix wide command panels with narrow utility rails
- use asymmetry where it improves emphasis
- reduce the feeling of evenly distributed template spacing

### Surfaces

- base surfaces should move closer to graphite, ink, and deep indigo-black
- keep brand purple as a controlled system color, not the entire background story
- use layered surface depth with crisp borders and restrained glow
- reserve the brightest highlights for active state, focus, status, and primary actions

### Color Strategy

Keep the existing brand tokens, but shift their usage model.

- `brand purple`: navigation state, primary actions, active modules, selected context
- `gold accent`: status emphasis, current server signal, high-priority actions, critical highlights
- `success/error/warning`: explicit system feedback only
- `muted indigo`: support backgrounds, dividers, and context bands

#### Practical Rule

Purple is the system color.
Gold is the authority color.
Neutral dark surfaces carry the interface.

### Shape Language

- reduce overuse of large rounded rectangles
- use medium radii for panels and inputs
- reserve tighter corners for dense controls and tables
- use sharper geometry in navigation and section framing to increase seriousness

### Borders And Depth

- rely on visible border hierarchy first
- use shadows sparingly and directionally
- replace generic blur depth with surface layering and edge definition
- use thin luminous separators in key areas rather than full-card glow

## Typography System

Lucky already has the right fonts. The improvement is in discipline.

### Use Of `Sora`

- page titles
- major section titles
- guild identity moments
- key hero moments on onboarding/login

Do not use `Sora` for every label or stat tile.

### Use Of `Manrope`

- navigation
- form labels
- body copy
- helper text
- action text

### Use Of `JetBrains Mono`

- server IDs
- timestamps
- moderation case IDs
- queue durations
- diagnostic/system metadata

### Hierarchy Rule

Every screen should have one dominant title, one operational summary, and one secondary layer of detail. Remove visual competition between cards that all currently look equally important.

## Interaction Direction

### Navigation

- sidebar should feel like a mission panel, not a generic app menu
- active server identity should remain visible and persistent
- page headers should reinforce location and current guild context
- related modules should be grouped by real admin workflows, not just by route count

### Forms And Configuration

- long settings pages should become guided configuration sections
- add local section navigation or sticky anchors for dense pages
- replace raw technical inputs with human selectors whenever possible
- saving should feel explicit, stable, and system-like

### Status And Feedback

- highlight bot state, guild readiness, connection state, and module health clearly
- use gold for selected/current/high-priority state
- use green/red only for live status and outcomes
- treat empty states as operational guidance, not blank filler

### Motion

- use motion to reinforce context changes, not to decorate everything
- preferred motion: sidebar reveal, panel entrance, section transitions, context switch transitions
- avoid floating ambient motion on every surface
- support `prefers-reduced-motion`

## UX Principles

### 1. Server Context Must Be Unmissable

The current app allows too much ambiguity around which guild the user is editing. This must become the strongest persistent context signal in the product.

### 2. Every Major Page Needs A Primary Job

Pages should stop trying to be dashboard + documentation + configuration form at the same time.

### 3. Replace Raw Technical Friction

If a user must paste an ID, the system has already lost clarity.

### 4. Dense Does Not Mean Confusing

Lucky can be information-rich, but the richness must come from hierarchy, grouping, and state cues.

### 5. Professional Means Confident Restraint

The interface should be memorable because it is intentional, not because it is noisy.

## Component Tone

### Sidebar

- stronger section structure
- visible active guild block
- module grouping with clearer visual separation
- optional small state chips for modules with alerts or setup required

### Page Headers

- title + operational purpose + current context
- optional compact status rail for server/module state
- avoid generic subtitle filler

### Panels

- build panels around tasks, not generic cards
- one panel should answer one question or contain one clear action set
- use density intentionally for moderation and automation areas

### Tables And Lists

- use command-center density
- improve scanability with stronger row structure
- transform to labeled mobile cards, not ambiguous stacked text

### Dialogs

- one shared accessible dialog system
- dialogs should feel like tools, not floating generic modals
- builders may use a studio shell, but still follow consistent semantics

## Screen Identity Guidance

Each major area should have a slightly different internal mood while remaining part of one system.

- Login: premium invitation, controlled theatricality
- Servers: guild roster and readiness board
- Dashboard Overview: command center summary
- Moderation: incident console
- Server Settings: system configuration workspace
- Auto Messages: scheduling and automation control room
- Embed Builder: creative studio
- Music: live media operations deck

## Accessibility And Professional Polish

The non-generic direction must still improve fundamentals:

- semantic navigation and buttons
- accessible dialogs
- visible `focus-visible` states
- `color-scheme: dark`
- reduced-motion support
- explicit confirmation or undo for destructive actions
- touch targets sized for mobile administration
- consistent labels, helper text, and error states

## Implementation Priorities

### Phase 1: Identity + Structure

- define updated surface, border, spacing, and panel rules
- redesign sidebar and page-header language
- establish active server context treatment

### Phase 2: Core Workflow Screens

- `ServersPage`
- `DashboardOverview`
- `ServerSettings`
- `Moderation`
- `EmbedBuilder`

### Phase 3: System-Wide Consistency

- modal/dialog standardization
- form/input modernization
- mobile-specific redesigns for dense admin screens
- status chips, readiness states, and richer empty states

## Success Criteria

Lucky will feel successful when:

- users can identify the active server instantly
- screens look purpose-built for Discord administration
- the product no longer resembles a generic AI dashboard template
- dense pages remain intuitive on desktop and mobile
- the visual language feels premium and memorable without sacrificing clarity
