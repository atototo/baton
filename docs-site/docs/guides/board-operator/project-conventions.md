---
title: Project Conventions
description: Manage project backstory, coding conventions, and compact context
---

Project conventions let Baton inject project-specific context into agent runs without forcing every agent prompt to duplicate the same rules.

## What It Stores

Each project can store three related prompt layers:

- **Backstory** — high-level project context, goals, and domain framing
- **Conventions** — full markdown guidance such as stack, file structure, API patterns, or review rules
- **Compact Context** — a generated short summary Baton can inject during heartbeats by default

## Why It Exists

Project conventions solve a common problem in agent teams:

- agent role prompts should stay reusable
- project-specific coding rules should live with the project
- runtime prompt size should stay bounded

Instead of rewriting long `AGENTS.md` files per project, Baton composes:

1. the agent's bundle instructions
2. the project's conventions layer
3. governance reminders

## Compact Context

Compact context is the short runtime-friendly version of your project conventions.

When present, Baton prefers compact context over the full conventions markdown for heartbeat injection.

This keeps token usage under control while preserving the full conventions document for operator editing and future reference.

## How It Is Used At Runtime

For supported local adapters, Baton composes supplementary project instructions during heartbeat execution:

- backstory
- compact context if available, otherwise full conventions
- critical governance reminders

The composed instructions are injected alongside the agent's own instructions bundle.

## Typical Workflow

1. Open a project detail page
2. Write or paste the project backstory
3. Write the full project conventions in markdown
4. Generate compact context
5. Re-generate the compact version whenever the full conventions change materially

## Relationship To Agent Instructions

Project conventions do **not** replace the agent's instructions bundle.

Use project conventions for shared project knowledge such as:

- tech stack
- architecture rules
- directory layout
- coding standards
- domain terminology

Use the agent bundle for role-specific behavior such as:

- leader planning behavior
- reviewer rules
- implementation boundaries
- tool use patterns

## API Endpoints

```
GET /api/projects/{projectId}/conventions
PUT /api/projects/{projectId}/conventions
PATCH /api/projects/{projectId}/conventions
POST /api/projects/{projectId}/conventions/compact
```

See [Goals and Projects API](/api/goals-and-projects) for endpoint details.
