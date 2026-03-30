# Lucky Screen Redesign Spec

## Purpose

This document translates the Lucky UI direction into concrete redesign requirements for the core frontend screens and workflows.

It is intentionally opinionated. The goal is not incremental polish. The goal is to reshape Lucky into a clearer, more distinctive Discord operations product.

## Global Cross-Screen Requirements

Apply these rules across all redesigned screens.

### Context

- always show the active guild clearly when inside an authenticated guild-scoped area
- make server switching explicit and low-friction
- never navigate into a guild-scoped page without confirming or setting guild context

### Layout

- reduce default card-grid composition
- use stronger sectional framing and task-based panels
- add local page navigation on long admin screens
- design mobile layouts intentionally rather than collapsing desktop blocks

### Components

- standardize on one accessible dialog pattern
- standardize destructive confirmations and undo patterns
- replace raw ID fields with searchable selectors wherever backend data is available
- use semantic interactive elements for all clickable actions

### Tone

- every screen should feel operational and purpose-built
- avoid generic stats and decorative filler
- use copy that helps admins act, not copy that narrates obvious UI state

## 1. Sidebar / App Shell

### Current Problems

- feels structurally solid but still visually similar to standard admin templates
- active guild context is present but not dominant enough
- module groups are useful, but they do not yet create a strong operational mental model
- some route IA drift remains, including routes with weaker exposure in navigation

### Redesign Goals

- make the shell feel like a persistent guild operations frame
- make current guild identity, status, and context unmistakable
- create clearer workflow groupings
- strengthen module discoverability without visual clutter

### Proposed Structure

1. Persistent guild block at top
    - guild avatar/icon
    - guild name
    - compact status or readiness line
    - direct switch action

2. Primary navigation groups
    - Overview
    - Moderation
    - Automation
    - Community
    - Media
    - Integrations / Advanced

3. Utility rail/footer
    - user profile
    - logout
    - optional support/docs link

### UI Notes

- use sharper section dividers and tighter spacing rhythm
- active item should feel selected by structure, not just color wash
- consider slim module chips for setup-needed, warning, or recently active states
- mobile drawer should feel like a command panel, not a generic slide-over

## 2. Servers Page

### Current Problems

- reads like a polished but familiar grid of server cards
- “Manage” flow is vulnerable to wrong-context navigation
- servers are presented visually, but not operationally
- page lacks a distinctive guild roster identity

### Redesign Goals

- make this page feel like a server control roster
- emphasize readiness and capability, not just server presence
- make selecting and entering a guild unambiguous

### Proposed Direction

Replace the current gallery-first feeling with a roster/board hybrid.

Each guild item should communicate:

- guild identity
- membership or scope signal
- bot presence/status
- setup readiness
- permission health or missing requirements
- last active/admin action context if available

### Recommended Layout

- top band with user context and managed-servers summary
- segmented controls for `All`, `Ready`, `Needs Setup`, `Attention`
- guild list with richer rows or structured cards
- right-side or inline quick summary for the selected guild before entering

### Required UX Fixes

- fix `ServerCard` manage action so it always selects the intended guild before routing
- make `Enter Guild` the primary action language instead of a vague manage CTA
- preserve filter/search state in the URL if practical

## 3. Dashboard Overview

### Current Problems

- useful, but still too close to generic dashboard conventions
- stat cards compete equally for attention
- quick actions do not create a strong command-center feel
- page does not yet fully communicate guild health at a glance

### Redesign Goals

- create a true command-center landing page for a selected guild
- prioritize current operational state over generic stats
- let admins see what needs attention first

### Proposed Layout

1. Guild status header
    - guild name and tier/context
    - bot health / connection state
    - urgent notices or setup blockers

2. Operations summary band
    - moderation activity
    - automation health
    - music/live state
    - recent changes or warnings

3. Priority action zones
    - moderation queue / recent cases
    - setup shortcuts
    - recommended next steps for incomplete configuration

4. Secondary metrics
    - only after task-critical state is visible

### Interaction Notes

- quick actions should reflect actual admin frequency, not route parity
- use stronger panel differentiation between alerts, summaries, and shortcuts
- timestamps and IDs should use mono styling for system feel

## 4. Server Settings

### Current Problems

- page is too long and too form-heavy
- density exists without enough navigation support
- fixed mobile save bar risks covering content
- some flows still fall back to raw IDs

### Redesign Goals

- turn settings into a guided system configuration workspace
- improve orientation inside long forms
- reduce admin fatigue and scanning cost

### Proposed Layout

- sticky local section nav on desktop
- compact jump menu on mobile
- settings grouped by real jobs, for example:
    - Identity
    - Notifications
    - Permissions
    - Warnings & Moderation Defaults
    - Server Presets
    - Automation Dependencies

### Interaction Pattern

- each section gets:
    - short operational description
    - grouped fields
    - validation/help state
    - explicit dirty/saved state

- page-level save remains, but section-level change awareness should be visible

### Mobile Requirements

- no content can be hidden behind fixed action bars
- save affordance should stay present without covering field content
- long inputs and selector pickers must be thumb-friendly

## 5. Moderation

### Current Problems

- underlying functionality is solid
- mobile table collapse loses label clarity
- clickable rows are semantically weak
- view could feel more like an incident console

### Redesign Goals

- make moderation feel high-trust and high-speed
- improve scanning, filtering, and case inspection
- preserve density without losing clarity on mobile

### Proposed Direction

Treat moderation as a case and incident workspace.

### Recommended Layout

- top filter rail with search, case type, moderator, and time window
- primary case stream with stronger row hierarchy
- optional side detail pane on desktop or structured dialog on smaller screens
- summary widgets focused on actionable moderation state, not vanity counts

### Mobile Pattern

- replace collapsed pseudo-table rows with labeled case cards
- each card should clearly show type, user, moderator, time, and status
- primary tap target should be a real button or link

### Data Presentation

- use mono for case IDs and timestamps
- use stronger type/status badges
- make severity and recency easy to spot

## 6. Auto Messages

### Current Problems

- custom modal pattern weakens accessibility and consistency
- channel setup still depends on raw ID input
- delete flow is too immediate
- current layout feels like a standard CRUD list

### Redesign Goals

- make this page feel like an automation scheduler, not a basic record editor
- reduce technical friction
- improve clarity around cadence, destination, and message type

### Proposed Layout

- overview strip with total scheduled messages, active/inactive state, and nearest send timing
- message schedule list with clearer cadence and destination metadata
- create/edit flow in shared dialog or dedicated side panel

### Form Improvements

- searchable channel selector instead of raw channel ID entry
- clearer recurrence controls
- message preview zone
- explicit activation state

### Safety Requirements

- confirm destructive delete or provide undo toast
- dialog must use the shared accessible dialog system

## 7. Embed Builder

### Current Problems

- current modal is desktop-first and cramped on smaller screens
- custom modal and custom confirm pattern are inconsistent
- builder feels like fields in a popup, not a creative tool

### Redesign Goals

- reposition this as a small creative studio inside Lucky
- support desktop power use and mobile editing cleanly
- make preview and structure feel central

### Proposed Direction

Use a dedicated builder workspace pattern.

### Recommended Desktop Layout

- left: template list and actions
- center: structured editor sections
- right: live preview stage

### Recommended Mobile Layout

- stacked sections with preview toggle or sticky preview access
- section tabs such as `Content`, `Media`, `Fields`, `Preview`
- large touch-safe controls and reduced visual crowding

### Interaction Requirements

- shared accessible dialog only if the builder remains modal
- otherwise prefer a full-page builder route
- image/color/field editing should feel scaffolded and deliberate
- save state should be explicit and stable

## 8. Music

### Current Problems

- one of the strongest areas already
- could still feel more intentionally integrated into the new Lucky shell
- keyboard shortcuts should avoid interfering with more focus targets

### Redesign Goals

- keep it as the most live and energetic area of the product
- frame it as a media operations deck rather than a generic now-playing screen

### Proposed Improvements

- stronger live-state banner for connected / idle / disconnected
- clearer separation between search/import, now playing, and queue management
- improved queue action safety for destructive clears
- optional richer queue metadata and moderation-style status density

## 9. Login

### Current Problems

- visually stronger than most internal screens, but still slightly too theatrical compared with core operational UX
- should better bridge brand identity into product identity

### Redesign Goals

- preserve strong first impression
- make the transition into the app feel more coherent with the rest of the redesign

### Proposed Direction

- keep editorial type and premium framing
- use more guild and control-system cues rather than abstract product beauty alone
- tighten copy around what the admin can do immediately after sign-in

## Design System Translation Into Build Work

### Components To Standardize First

- sidebar shell
- page header
- section nav
- panel wrapper
- status chip/badge
- shared dialog
- destructive confirm pattern
- selector inputs for guild channels/roles/users

### Token Adjustments To Consider

- introduce more neutral dark surface steps for layout framing
- reduce reliance on purple as background fill
- add clearer divider and panel-edge tokens
- define radius scale by component density

## Implementation Order

### First Wave

1. Sidebar / app shell
2. Servers page
3. Dashboard overview

These screens define the product's identity fastest.

### Second Wave

4. Server settings
5. Moderation
6. Shared dialog and confirmation system

These screens fix operational clarity and accessibility.

### Third Wave

7. Auto Messages
8. Embed Builder
9. Music polish and cross-screen consistency

These screens complete the distinctive product feel.

## Acceptance Criteria

The redesign is successful when:

- Lucky no longer reads as a generic AI dashboard
- the active guild is always obvious
- long admin flows feel guided instead of form-dumped
- moderation and automation areas feel purpose-built
- the Embed Builder feels like a tool, not a popup
- mobile UX remains professional and readable across all core workflows
