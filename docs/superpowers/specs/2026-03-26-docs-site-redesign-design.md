---
title: Docs Site Redesign
date: 2026-03-26
status: proposed
owners:
  - docs
  - product
  - frontend
---

# Docs Site Redesign

## Summary

Redesign the public docs experience so Baton is easier to understand for non-developers, easier to operate from guides, more accurate against the product, and more consistent across English and Korean.

This is not a copy-edit pass. It is a documentation product pass covering:

- visual explanation
- guided task flows
- fact accuracy
- localization consistency

## Why This Work Exists

The current docs are structurally solid, but they still read like developer documentation in several high-impact entry points.

Main issues:

1. Baton is not immediately intuitive to non-technical readers.
2. Core guides explain features, but not always the screen flow or user journey.
3. Some pages have already drifted from current product behavior.
4. Korean localization is wired correctly, but translation coverage and terminology consistency are incomplete.
5. Mermaid diagrams are useful for precise structure, but too rigid and visually cold for first-contact understanding.

## Goals

1. A first-time visitor should understand Baton in under 2 minutes.
2. A board operator should be able to follow the main guides without guessing which screen or tab to use.
3. Public docs should match the current product and release behavior.
4. English and Korean should share the same information architecture and component structure.
5. Entry-point docs should feel visual, modern, and easy to scan.

## Non-Goals

1. Full redesign of every API reference page in this phase.
2. Replacing all Mermaid diagrams everywhere.
3. Building a general-purpose design system for all Docusaurus content.
4. Rewriting product positioning outside the docs site.

## Success Criteria

### Understanding

- `What is Baton`, `Quickstart`, `Core Concepts`, and `Architecture` can be skimmed visually.
- The difference between control plane, governed workflow, and adapters is obvious without deep reading.

### Guidance

- `Managing Agents`, `Approvals`, and `Default Governed Workflow` show actual user flow, not just feature descriptions.
- Screenshots or guided visuals show where to click and what to expect.

### Accuracy

- Docs references to adapters, workflow states, instructions bundles, and approvals match current code and UI.
- Deprecated docs-site configuration items are cleaned up where practical.

### Localization

- Korean navbar/sidebar labels are fully localized where intended.
- Visual components are reusable across locales with text injected via props or content wrappers.

## User Segments

### 1. Curious evaluator

Needs:

- understand what Baton is
- understand why it is different from a task board
- see the system shape quickly

### 2. Board operator

Needs:

- understand how to create and manage companies, agents, approvals, and workflows
- find the right tab, page, or button quickly

### 3. Technical adopter

Needs:

- verify architecture, API, adapters, and deployment setup
- trust the docs are up to date

## Design Principles

1. Visual first for entry pages.
2. Text second, with short paragraphs and strong hierarchy.
3. Screens tell the user where they are; prose tells them why it matters.
4. Motion should clarify sequence or emphasis, not decorate.
5. Mermaid remains acceptable in technical/reference contexts, but not as the primary explanatory device in entry docs.

## Information Architecture

The docs should be treated as three layers.

### Layer 1: Intro / Story

Pages:

- `start/what-is-baton`
- `start/quickstart`
- `start/core-concepts`
- `start/architecture`

Purpose:

- explain what Baton is
- explain how the system works at a high level
- help readers build a mental model before operating anything

### Layer 2: Guided Operation

Pages:

- `guides/board-operator/dashboard`
- `guides/board-operator/managing-agents`
- `guides/board-operator/approvals`
- `guides/board-operator/default-governed-workflow`
- `guides/board-operator/managing-tasks`
- `guides/board-operator/project-conventions`

Purpose:

- show screen-level usage
- explain operator tasks step by step
- connect UI objects to workflow concepts

### Layer 3: Reference

Pages:

- API reference
- CLI reference
- Adapters
- Deploy

Purpose:

- optimize for correctness and completeness
- use visuals only where they materially improve comprehension

## Visual System

Use MDX + React components in Docusaurus for entry and guide pages.

### Keep

- tables for reference
- code blocks for commands
- Mermaid for low-frequency technical diagrams

### Add

- reusable React explainer components
- screenshots with annotations
- timeline and stepper components
- comparison cards
- lightweight animations

## Proposed MDX Components

### `StoryHero`

Use on:

- `What is Baton`
- `Quickstart`

Purpose:

- big statement + short support copy
- 3 key concepts or benefits in cards

Motion:

- staggered fade-in

### `FlowStepper`

Use on:

- `Quickstart`
- `Governed workflow`

Purpose:

- show sequential flow
- allow each step to expand or highlight

Motion:

- active-step emphasis
- subtle progress line animation

### `ControlPlaneDiagram`

Use on:

- `What is Baton`
- `Core Concepts`

Purpose:

- visualize relationship between board, company, agents, issues, approvals, and adapters

### `StateLifecycle`

Use on:

- `Core Concepts`

Purpose:

- replace ASCII status diagrams with status chips and branching states

### `GovernedFlowTimeline`

Use on:

- `Default Governed Workflow`
- `What is Baton`

Purpose:

- show `plan -> approve -> execute -> review -> PR -> done`
- visually separate approval gates from execution steps

### `ScreenTour`

Use on:

- `Managing Agents`
- `Approvals`
- `Dashboard`

Purpose:

- annotated screenshot blocks
- explain tabs, panels, and important controls

### `CompareModes`

Use on:

- `Managing Agents`
- `Project Conventions`

Purpose:

- compare `Managed vs External`
- compare concept pairs such as `Control Plane vs Adapter`

## Animation Guidelines

Animation is allowed only when it improves comprehension.

Allowed:

- fade/slide on section reveal
- active-step highlight
- animated connection emphasis between stages
- tooltip and panel transitions

Avoid:

- long looping animation
- decorative motion with no semantic meaning
- heavy effects that make docs feel like a landing page instead of documentation

Recommended implementation:

- CSS transitions first
- `framer-motion` only if needed for stepper/timeline interactions

## Screenshot Strategy

Screenshots are required for operator guides.

### Required screenshot pages

- `Managing Agents`
- `Approvals`
- `Dashboard`
- `Project Conventions`
- `Quickstart`

### Screenshot rules

1. Use current production-like UI state.
2. Hide irrelevant clutter.
3. Annotate key controls with numbered callouts.
4. Maintain light/dark consistency per page.
5. Use the same screenshot in both locales when UI text is not locale-specific.

### Suggested static asset structure

```text
docs-site/static/img/docs/
  start/
  guides/
  shared/
```

## Page-by-Page Changes

### `start/what-is-baton`

Current issue:

- accurate but abstract
- too text-heavy for first contact

Change:

- add hero explainer
- add control-plane vs execution-services visual
- add governed execution story section
- keep a small technical diagram below the story layer

### `start/quickstart`

Current issue:

- commands are present, but the user cannot easily imagine the next screen

Change:

- convert to stepper
- add screenshots for:
  - first run
  - first company creation
  - first CEO agent creation
  - first successful UI landing
- split paths:
  - quick evaluation
  - local development

### `start/core-concepts`

Current issue:

- correct concepts, but relationship graph is not visual enough
- lifecycle block is too rigid

Change:

- use concept cards and relation diagram
- replace ASCII lifecycle with `StateLifecycle`
- visualize heartbeat and governance path

### `start/architecture`

Current issue:

- useful for developers, but dry for mixed audiences

Change:

- add high-level system layer visual
- keep repo structure and stack table below
- ensure adapter list and stack remain current

### `guides/board-operator/managing-agents`

Current issue:

- explains concepts but not enough screen flow

Change:

- add annotated screenshots:
  - agents list
  - agent detail tabs
  - instructions tab
  - config revisions/history
- use `CompareModes` for `Managed vs External`

### `guides/board-operator/approvals`

Current issue:

- governance semantics are clear, but UI handling is not very visual

Change:

- add approval queue screenshot
- add approval detail screenshot
- show action outcomes:
  - approve
  - reject
  - request revision
  - force approve

### `guides/board-operator/default-governed-workflow`

Current issue:

- current flow is documented, but still feels like process text for builders

Change:

- replace primary Mermaid with `GovernedFlowTimeline`
- show parent/child relationship and approval gates visually
- add one concrete scenario example

### `guides/board-operator/project-conventions`

Current issue:

- concept is documented but lacks UI grounding

Change:

- add conventions editor screenshot
- explain `Backstory`, `Conventions`, `Compact Context` as three stacked cards

## Accuracy Review Plan

Every touched page must be checked against actual product behavior.

### Review checklist

1. Commands still exist.
2. Adapter names still exist.
3. Workflow state names still exist.
4. UI tabs/buttons are current.
5. API endpoints match server routes.
6. Screenshots match current behavior.

### Known correctness fixes already identified

1. `start/architecture` stack table should list `gemini_local` and `pi_local` in adapter coverage language.
2. docs-site config still uses deprecated `onBrokenMarkdownLinks`.
3. Several Korean labels remain partially untranslated in navbar/sidebar metadata.

## Localization Plan

The locale structure is correct and should stay:

- English source docs under `docs-site/docs`
- Korean translated docs under `docs-site/i18n/ko/docusaurus-plugin-content-docs/current`
- shared UI strings under `navbar.json`, `footer.json`, and `current.json`

### Localization rules

1. English remains source of truth.
2. Korean mirrors the same page structure and component layout.
3. React visual components must accept text/content via props so both locales can reuse the same implementation.
4. Key category names must be fully localized where intended.

### Translation cleanup targets

- `Adapters` -> `어댑터`
- `Board Operator` -> `보드 운영자`
- `Agent Developer` -> `에이전트 개발자`
- `Agent Adapter` -> `에이전트 어댑터`
- keep `REST API` and `CLI` as-is unless a stronger product-wide translation rule exists

## Technical Plan

### New docs-site code

Likely additions:

- `docs-site/src/components/docs/StoryHero.tsx`
- `docs-site/src/components/docs/FlowStepper.tsx`
- `docs-site/src/components/docs/ControlPlaneDiagram.tsx`
- `docs-site/src/components/docs/StateLifecycle.tsx`
- `docs-site/src/components/docs/GovernedFlowTimeline.tsx`
- `docs-site/src/components/docs/ScreenTour.tsx`
- `docs-site/src/components/docs/CompareModes.tsx`

### Likely supporting files

- docs-specific CSS module or shared stylesheet
- screenshot assets under `docs-site/static/img/docs/...`

## Delivery Phases

### Phase 1: Foundation + Intro

- build reusable visual components
- redesign:
  - `What is Baton`
  - `Quickstart`
  - `Core Concepts`
  - `Architecture`
- fix Korean navbar/sidebar terminology
- fix known factual inconsistencies in touched intro pages

### Phase 2: Guide Upgrade

- redesign:
  - `Managing Agents`
  - `Approvals`
  - `Default Governed Workflow`
  - `Project Conventions`
  - optionally `Dashboard`
- add screenshots and annotated flows
- localize the same layouts into Korean

### Phase 3: Reference Polish

- adapters/API/deploy/CLI correctness sweep
- remove stale wording and deprecated config items
- tighten docs QA process

## Verification

### Visual verification

- review pages in both `en` and `ko`
- confirm layouts are readable on desktop and mobile
- confirm animations do not feel distracting

### Technical verification

- `pnpm --dir docs-site typecheck`
- `pnpm --dir docs-site build`

### Content verification

- commands checked against CLI
- API routes checked against server
- screenshots checked against current UI

## Risks

1. Visual components become too marketing-like and reduce docs density.
2. Screenshots drift quickly if UI changes.
3. Localization doubles review effort.
4. Motion can harm readability if overused.

## Mitigations

1. Keep visuals instructional, not promotional.
2. Use reusable screenshot conventions and targeted updates.
3. Reuse shared React components across locales.
4. Keep motion optional, subtle, and meaning-driven.

## Open Questions

1. Should screenshots use only dark theme, or match each page's best readability mode?
2. Should we add a dedicated docs visual language section to standardize callouts, cards, and flow colors?
3. Should Korean category labels fully translate role names, or preserve a small set of product-native English terms?

## Recommendation

Proceed as a docs redesign project, not a patch pass.

Implement shared visual components first, then redesign the intro layer, then upgrade operator guides, then finish with accuracy and localization cleanup across the remaining reference surface.
