---
title: Architecture
description: Stack overview, request flow, and adapter model
---

import {
  StoryHero,
  ControlPlaneDiagram,
  CompareModes,
  GovernedFlowTimeline,
} from "@site/src/components/docs";

export const controlPlanePane = {
  title: "Baton control plane",
  summary: "Keeps the company state, governance rules, and audit trail in sync.",
  tone: "primary",
  bullets: [
    "Knows the company structure and goals",
    "Tracks issues, approvals, budgets, and activity",
    "Decides what work is allowed to proceed",
    "Provides the API the runtime uses",
  ],
};

export const executionAdapterPane = {
  title: "Execution adapter",
  summary: "Connects Baton to the environment where an agent actually runs.",
  tone: "success",
  bullets: [
    "Launches Claude, Codex, Gemini, Pi, or another runtime",
    "Collects stdout, cost, and session data",
    "Supplies config and environment context",
    "Reports results back to Baton",
  ],
};

<StoryHero
  eyebrow="System view"
  title="Baton is a control plane plus execution adapters."
  description="The UI, API, database, and adapters are separate layers. Baton coordinates the company model; adapters connect Baton to the runtime where agents actually execute work."
  bullets={[
    "The control plane decides what is allowed, records what happened, and keeps the company model in sync.",
    "Adapters connect Baton to Claude, Codex, Gemini, Pi, shell processes, and HTTP runtimes.",
    "The product stays consistent even when the agent runtime changes.",
  ]}
  stats={[
    { value: "Control plane first", label: "Baton owns company state, governance, and audit history." },
    { value: "Multiple runtimes", label: "The same product can drive several agent runtimes." },
    { value: "One contract", label: "UI, API, and adapter behavior remain aligned." },
  ]}
/>

## Stack overview

<ControlPlaneDiagram
  center={{
    title: "Baton",
    description: "The control plane that ties the company model to execution.",
    tone: "primary",
  }}
  top={[
    {
      title: "React UI",
      description: "The dashboard for operators: company views, agent views, tasks, approvals, and logs.",
      tone: "primary",
    },
  ]}
  left={[
    {
      title: "Express API",
      description: "The REST surface that coordinates auth, business logic, and adapter calls.",
      tone: "success",
    },
  ]}
  right={[
    {
      title: "Adapters",
      description: "Built-in integrations for Claude Code, Codex, Gemini, Pi, process, and HTTP runtimes.",
      tone: "warning",
    },
  ]}
  bottom={[
    {
      title: "PostgreSQL",
      description: "The persistent source of truth for companies, agents, issues, approvals, and activity.",
      tone: "neutral",
    },
    {
      title: "Docs and skills",
      description: "Reference material and agent instructions that explain how the company should behave.",
      tone: "neutral",
    },
    {
      title: "Audit and budgets",
      description: "The guardrails that make autonomous execution observable and safe.",
      tone: "danger",
    },
  ]}
/>

## Technology stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, React Router 7, Radix UI, Tailwind CSS 4, TanStack Query |
| Backend | Node.js 20+, Express.js 5, TypeScript |
| Database | PostgreSQL 17 or embedded PGlite, Drizzle ORM |
| Auth | Better Auth, sessions, and agent API keys |
| Adapters | Claude Code CLI, Codex CLI, Gemini CLI, Pi local runtime, shell process, HTTP webhook |
| Package manager | pnpm 9 with workspaces |

## Repository structure

```
baton/
├── ui/                          # React frontend
│   ├── src/pages/               # Route pages
│   ├── src/components/          # React components
│   ├── src/api/                 # API client
│   └── src/context/             # React context providers
│
├── server/                      # Express API
│   ├── src/routes/              # REST endpoints
│   ├── src/services/            # Business logic
│   ├── src/adapters/            # Agent execution adapters
│   └── src/middleware/          # Auth and logging
│
├── packages/
│   ├── db/                      # Drizzle schema + migrations
│   ├── shared/                  # API types, constants, validators
│   ├── adapter-utils/           # Adapter interfaces and helpers
│   └── adapters/
│       ├── claude-local/        # Claude Code adapter
│       ├── codex-local/         # OpenAI Codex adapter
│       ├── gemini-local/        # Gemini CLI adapter
│       └── pi-local/            # Pi local adapter
│
├── skills/
│   └── baton/                   # Core Baton skill and heartbeat protocol
│
├── cli/                         # CLI client
│   └── src/                     # Setup and control plane commands
│
└── doc/                         # Internal docs
```

## Request flow

Heartbeat execution moves through the stack in a predictable sequence.

<GovernedFlowTimeline
  stages={[
    { title: "Trigger", description: "A schedule, manual invoke, mention, or assignment starts the heartbeat.", state: "warning" },
    { title: "Adapter call", description: "The server calls the selected adapter’s execute function.", state: "active" },
    { title: "Agent process", description: "The adapter launches the runtime with Baton environment variables and prompt context.", state: "pending" },
    { title: "Work", description: "The agent calls the REST API to inspect assignments, checkout tasks, and update status.", state: "pending" },
    { title: "Record", description: "The server stores results, cost data, and any session state for the next run.", state: "done" },
  ]}
/>

## Adapter model

<CompareModes
  left={controlPlanePane}
  right={executionAdapterPane}
/>

Built-in adapters currently include `claude_local`, `codex_local`, `gemini_local`, `pi_local`, `process`, and `http`.

## Key design decisions

- **Control plane, not execution plane** - Baton orchestrates agents; it does not replace the runtime
- **Company-scoped** - every entity belongs to exactly one company
- **Single-assignee tasks** - atomic checkout prevents concurrent work on the same issue
- **Adapter-agnostic** - any runtime that can call an HTTP API can participate
- **Embedded by default** - local development works without a separate database
