# Docs Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the docs site so Baton is easier to understand, easier to operate from guides, more accurate against the product, and more consistent across English and Korean.

**Architecture:** Build a small reusable MDX visual layer in `docs-site/src/components/docs`, then apply it to the highest-impact intro and operator guide pages. Keep reference pages mostly text-first, but sweep them for correctness and localization consistency. Reuse the same React visual components across locales and keep screenshots under a stable static asset layout.

**Tech Stack:** Docusaurus 3, MDX, React 19, TypeScript, CSS modules or docs-site shared CSS, existing docs-site i18n files

---

## File Structure

### New component files

- Create: `docs-site/src/components/docs/StoryHero.tsx`
- Create: `docs-site/src/components/docs/FlowStepper.tsx`
- Create: `docs-site/src/components/docs/ControlPlaneDiagram.tsx`
- Create: `docs-site/src/components/docs/StateLifecycle.tsx`
- Create: `docs-site/src/components/docs/GovernedFlowTimeline.tsx`
- Create: `docs-site/src/components/docs/ScreenTour.tsx`
- Create: `docs-site/src/components/docs/CompareModes.tsx`
- Create: `docs-site/src/components/docs/docs.css`

### Static assets

- Create: `docs-site/static/img/docs/start/...`
- Create: `docs-site/static/img/docs/guides/...`

### Intro docs to modify

- Modify: `docs-site/docs/start/what-is-baton.md`
- Modify: `docs-site/docs/start/quickstart.md`
- Modify: `docs-site/docs/start/core-concepts.md`
- Modify: `docs-site/docs/start/architecture.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/what-is-baton.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/quickstart.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/core-concepts.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/architecture.md`

### Operator guides to modify

- Modify: `docs-site/docs/guides/board-operator/managing-agents.md`
- Modify: `docs-site/docs/guides/board-operator/approvals.md`
- Modify: `docs-site/docs/guides/board-operator/default-governed-workflow.md`
- Modify: `docs-site/docs/guides/board-operator/project-conventions.md`
- Modify: `docs-site/docs/guides/board-operator/dashboard.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/managing-agents.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/approvals.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/default-governed-workflow.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/project-conventions.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/dashboard.md`

### Accuracy and i18n files

- Modify: `docs-site/docusaurus.config.ts`
- Modify: `docs-site/i18n/ko/docusaurus-theme-classic/navbar.json`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current.json`
- Modify: `docs-site/docs/adapters/overview.md`
- Modify: `docs-site/docs/api/overview.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/adapters/overview.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/api/overview.md`

### Specs and docs QA

- Modify: `docs/superpowers/specs/2026-03-26-docs-site-redesign-design.md` (if design decisions change)
- Create: `docs/superpowers/checklists/docs-site-redesign-qa.md`

## Task 1: Build the reusable docs visual components

**Files:**
- Create: `docs-site/src/components/docs/StoryHero.tsx`
- Create: `docs-site/src/components/docs/FlowStepper.tsx`
- Create: `docs-site/src/components/docs/ControlPlaneDiagram.tsx`
- Create: `docs-site/src/components/docs/StateLifecycle.tsx`
- Create: `docs-site/src/components/docs/GovernedFlowTimeline.tsx`
- Create: `docs-site/src/components/docs/ScreenTour.tsx`
- Create: `docs-site/src/components/docs/CompareModes.tsx`
- Create: `docs-site/src/components/docs/docs.css`
- Test: `docs-site/package.json`

- [ ] **Step 1: Inspect existing docs-site component and CSS patterns**

Run: `rg -n "src/components|custom.css|module.css|MDX" docs-site -S`
Expected: find existing component/style conventions to follow

- [ ] **Step 2: Create a shared docs visual style file**

Implement a focused shared stylesheet for cards, timelines, steps, callouts, and screenshot annotations.

- [ ] **Step 3: Create `StoryHero`**

Implement props for title, summary, and 2-4 supporting cards.

- [ ] **Step 4: Create `FlowStepper`**

Implement a step list with active-step emphasis and lightweight CSS transitions.

- [ ] **Step 5: Create `ControlPlaneDiagram`**

Implement card-and-connector layout for board, company, goals, agents, issues, approvals, and adapters.

- [ ] **Step 6: Create `StateLifecycle`**

Implement status chips with a primary path and side branch for `blocked`.

- [ ] **Step 7: Create `GovernedFlowTimeline`**

Implement a horizontal or vertical flow view with approval gates visually separated from execution stages.

- [ ] **Step 8: Create `ScreenTour`**

Implement annotated image blocks with caption text and numbered callouts.

- [ ] **Step 9: Create `CompareModes`**

Implement two-column comparison cards for concepts like `Managed vs External`.

- [ ] **Step 10: Run docs-site typecheck**

Run: `PATH=/Users/winter.e/.nvm/versions/node/v22.22.0/bin:$PATH pnpm --dir docs-site typecheck`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add docs-site/src/components/docs docs-site/src/components/docs/docs.css
git commit -m "feat: add reusable docs visualization components"
```

## Task 2: Redesign the intro pages around the new visual system

**Files:**
- Modify: `docs-site/docs/start/what-is-baton.md`
- Modify: `docs-site/docs/start/quickstart.md`
- Modify: `docs-site/docs/start/core-concepts.md`
- Modify: `docs-site/docs/start/architecture.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/what-is-baton.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/quickstart.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/core-concepts.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/architecture.md`
- Test: `docs-site/build`

- [ ] **Step 1: Rewrite `what-is-baton` to use `StoryHero` and `ControlPlaneDiagram`**

Focus on first-contact understanding, not implementation detail.

- [ ] **Step 2: Rewrite `quickstart` to use `FlowStepper`**

Separate quick evaluation from local development and make the post-command experience explicit.

- [ ] **Step 3: Replace ASCII lifecycle in `core-concepts` with `StateLifecycle`**

Also add a visual for company -> project -> issue -> agent relationships.

- [ ] **Step 4: Rewrite `architecture` so the top half is visual and the bottom half remains reference-oriented**

Correct the adapter stack language while touching the page.

- [ ] **Step 5: Mirror the same structure into Korean intro pages**

Keep layout identical and localize text, not component behavior.

- [ ] **Step 6: Run docs-site build**

Run: `PATH=/Users/winter.e/.nvm/versions/node/v22.22.0/bin:$PATH pnpm --dir docs-site build`
Expected: PASS for `en` and `ko`

- [ ] **Step 7: Commit**

```bash
git add docs-site/docs/start docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start
git commit -m "docs: redesign intro pages with visual explainers"
```

## Task 3: Add screenshot infrastructure and capture current operator flows

**Files:**
- Create: `docs-site/static/img/docs/start/*`
- Create: `docs-site/static/img/docs/guides/*`
- Test: screenshot assets referenced in MDX

- [ ] **Step 1: Define screenshot naming rules**

Use stable, page-based names such as:

```text
docs-site/static/img/docs/guides/managing-agents-list.png
docs-site/static/img/docs/guides/managing-agents-detail-tabs.png
docs-site/static/img/docs/guides/approvals-queue.png
```

- [ ] **Step 2: Capture intro screenshots**

Capture the pages needed for Quickstart and first-use understanding.

- [ ] **Step 3: Capture operator guide screenshots**

Capture agents, approvals, dashboard, and project conventions views.

- [ ] **Step 4: Verify image dimensions and readability**

Check for legibility in docs dark mode and on narrower widths.

- [ ] **Step 5: Commit**

```bash
git add docs-site/static/img/docs
git commit -m "docs: add screenshots for docs-site walkthroughs"
```

## Task 4: Upgrade operator guides with annotated screenshots and clearer flow

**Files:**
- Modify: `docs-site/docs/guides/board-operator/managing-agents.md`
- Modify: `docs-site/docs/guides/board-operator/approvals.md`
- Modify: `docs-site/docs/guides/board-operator/default-governed-workflow.md`
- Modify: `docs-site/docs/guides/board-operator/project-conventions.md`
- Modify: `docs-site/docs/guides/board-operator/dashboard.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/managing-agents.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/approvals.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/default-governed-workflow.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/project-conventions.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator/dashboard.md`

- [ ] **Step 1: Redesign `managing-agents` around actual screen flow**

Use `ScreenTour` for agents list, detail tabs, Instructions tab, and revisions.

- [ ] **Step 2: Redesign `approvals` with annotated queue/detail screenshots**

Make approve, reject, revision request, and force approve visually distinct.

- [ ] **Step 3: Replace the primary governed workflow diagram with `GovernedFlowTimeline`**

Keep Mermaid only if needed as secondary technical detail.

- [ ] **Step 4: Add UI-grounded explanation to `project-conventions`**

Use screenshot + 3-part explanation for backstory, conventions, compact context.

- [ ] **Step 5: Add dashboard orientation help**

Explain the most important dashboard panels using one annotated overview screenshot.

- [ ] **Step 6: Mirror the same guide structure into Korean**

Reuse screenshot assets where possible.

- [ ] **Step 7: Run docs-site build**

Run: `PATH=/Users/winter.e/.nvm/versions/node/v22.22.0/bin:$PATH pnpm --dir docs-site build`
Expected: PASS for `en` and `ko`

- [ ] **Step 8: Commit**

```bash
git add docs-site/docs/guides/board-operator docs-site/i18n/ko/docusaurus-plugin-content-docs/current/guides/board-operator
git commit -m "docs: upgrade board-operator guides with visuals"
```

## Task 5: Sweep reference docs for correctness while preserving their text-first structure

**Files:**
- Modify: `docs-site/docs/adapters/overview.md`
- Modify: `docs-site/docs/api/overview.md`
- Modify: `docs-site/docs/start/architecture.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/adapters/overview.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/api/overview.md`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/architecture.md`

- [ ] **Step 1: Cross-check adapter names and capability language**

Use current adapter implementation and docs to confirm wording.

- [ ] **Step 2: Cross-check API overview claims**

Verify authentication, headers, and response conventions against current server behavior.

- [ ] **Step 3: Fix touched pages where wording is stale or inconsistent**

Keep these pages mostly reference-oriented.

- [ ] **Step 4: Commit**

```bash
git add docs-site/docs/adapters/overview.md docs-site/docs/api/overview.md docs-site/docs/start/architecture.md docs-site/i18n/ko/docusaurus-plugin-content-docs/current/adapters/overview.md docs-site/i18n/ko/docusaurus-plugin-content-docs/current/api/overview.md docs-site/i18n/ko/docusaurus-plugin-content-docs/current/start/architecture.md
git commit -m "docs: align reference pages with current product behavior"
```

## Task 6: Fix docs-site localization gaps and deprecated config

**Files:**
- Modify: `docs-site/docusaurus.config.ts`
- Modify: `docs-site/i18n/ko/docusaurus-theme-classic/navbar.json`
- Modify: `docs-site/i18n/ko/docusaurus-plugin-content-docs/current.json`

- [ ] **Step 1: Move deprecated Docusaurus markdown-link handling to the current config shape**

Replace deprecated `onBrokenMarkdownLinks` usage with the Docusaurus v4-compatible location.

- [ ] **Step 2: Localize Korean navbar labels consistently**

Translate `Adapters` and other remaining English labels according to the approved glossary.

- [ ] **Step 3: Localize Korean sidebar category labels consistently**

Translate remaining category names while preserving agreed product terms like `REST API`.

- [ ] **Step 4: Run docs-site build**

Run: `PATH=/Users/winter.e/.nvm/versions/node/v22.22.0/bin:$PATH pnpm --dir docs-site build`
Expected: PASS with deprecated warning removed

- [ ] **Step 5: Commit**

```bash
git add docs-site/docusaurus.config.ts docs-site/i18n/ko/docusaurus-theme-classic/navbar.json docs-site/i18n/ko/docusaurus-plugin-content-docs/current.json
git commit -m "docs: finish docs-site localization and config cleanup"
```

## Task 7: Add a docs QA checklist for future releases

**Files:**
- Create: `docs/superpowers/checklists/docs-site-redesign-qa.md`

- [ ] **Step 1: Write the checklist**

Include:

- intro-page comprehension checks
- screenshot freshness checks
- API/CLI correctness checks
- locale parity checks
- docs-site build verification

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/checklists/docs-site-redesign-qa.md
git commit -m "docs: add docs-site redesign QA checklist"
```

## Task 8: Final verification and handoff

**Files:**
- Verify the full docs-site surface

- [ ] **Step 1: Run docs-site typecheck**

Run: `PATH=/Users/winter.e/.nvm/versions/node/v22.22.0/bin:$PATH pnpm --dir docs-site typecheck`
Expected: PASS

- [ ] **Step 2: Run docs-site build**

Run: `PATH=/Users/winter.e/.nvm/versions/node/v22.22.0/bin:$PATH pnpm --dir docs-site build`
Expected: PASS for `en` and `ko`

- [ ] **Step 3: Review intro pages in both locales**

Manually check:

- visual readability
- mobile layout
- screenshot legibility
- animation subtlety

- [ ] **Step 4: Review guide pages in both locales**

Manually check:

- screen flow clarity
- glossary consistency
- no stale UI references

- [ ] **Step 5: Prepare summary**

Summarize:

- visual component additions
- pages redesigned
- localization changes
- remaining follow-up items

- [ ] **Step 6: Commit**

```bash
git status
git log --oneline -n 10
```

Expected: clean story of incremental docs-site redesign commits
