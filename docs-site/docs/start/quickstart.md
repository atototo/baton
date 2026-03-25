---
title: Quickstart
description: Get Baton running in minutes
---

import {
  StoryHero,
  FlowStepper,
  ScreenTour,
  CompareModes,
} from "@site/src/components/docs";

export const quickEvalPane = {
  title: "Quick evaluation",
  summary: "Best when you want to understand Baton right away.",
  tone: "success",
  bullets: [
    "Run the onboard command",
    "Open the UI and explore the company model",
    "Use the first setup to understand the product shape",
  ],
};

export const localDevPane = {
  title: "Local development",
  summary: "Best when you want to change code, docs, or both.",
  tone: "primary",
  bullets: [
    "Install dependencies",
    "Start the dev server",
    "Use the embedded database during development",
  ],
};

<StoryHero
  eyebrow="Quick start"
  title="Get Baton running locally in under 5 minutes."
  description="The goal of the first run is not only to boot the app. It is to make Baton understandable: what it manages, where to click, and what the first visible company state looks like."
  bullets={[
    "Use the quick path if you just want to see Baton working.",
    "Use the local development path if you want to edit the codebase.",
    "Baton uses an embedded PostgreSQL instance by default, so you do not need an external database to begin.",
  ]}
  stats={[
    { value: "5 minutes", label: "Rough time to get to a visible Baton UI." },
    { value: "1 command", label: "The quickest path starts with onboard and a local run." },
    { value: "0 setup drift", label: "The UI and runtime use the same local defaults." },
  ]}
/>

## Choose your path

<CompareModes
  left={quickEvalPane}
  right={localDevPane}
/>

## Quick start

<FlowStepper
  steps={[
    {
      title: "Onboard",
      description: "Run `npx baton onboard --yes` to walk through setup and generate the initial configuration.",
      meta: "recommended if you want to evaluate Baton before editing code",
      state: "active",
    },
    {
      title: "Start the app",
      description: "Use `pnpm dev` to boot the API server and UI at `http://localhost:3100`.",
      meta: "no external database required",
      state: "pending",
    },
    {
      title: "Open the company view",
      description: "Create your first company, then open the company page to see agents, goals, budgets, and work in one place.",
      meta: "the UI is the control surface, not just a dashboard",
      state: "pending",
    },
    {
      title: "Create the first agent",
      description: "Add a CEO agent and connect its adapter so Baton can start orchestrating real heartbeat runs.",
      meta: "after this, you can grow the org chart and begin assigning work",
      state: "pending",
    },
  ]}
/>

## What the first screens should tell you

<ScreenTour
  steps={[
    {
      title: "Company overview",
      description: "Shows the top-level company, its goal, and the shape of the team.",
      badge: "look here first",
      caption: "The company name, goal, and org chart should be the first things you notice.",
      layout: "left",
    },
    {
      title: "Agent detail",
      description: "Shows one agent at a time so you can understand its adapter, instructions, and current state.",
      badge: "managed vs external",
      caption: "The selected entry file matters because it determines what Baton keeps in managed mode.",
      layout: "right",
    },
    {
      title: "Run and heartbeat flow",
      description: "Shows what happened during the most recent execution so operators can understand runtime behavior.",
      badge: "watch the run",
      caption: "This is where you confirm that the control plane and the agent runtime are actually moving together.",
      layout: "left",
    },
  ]}
/>

## Local development

Prerequisites: Node.js 20+ and pnpm 9+.

```sh
pnpm install
pnpm dev
```

This starts the API server and UI at [http://localhost:3100](http://localhost:3100).

No external database is required. Baton uses an embedded PostgreSQL instance by default.

## One-command bootstrap

```sh
pnpm baton run
```

This auto-onboards if config is missing, runs health checks with auto-repair, and starts the server.

## What comes next

After Baton is running, the next useful actions are:

1. Create your first company in the web UI
2. Define a company goal
3. Create a CEO agent and configure its adapter
4. Add more agents and shape the org chart
5. Set budgets and assign initial tasks
6. Let the first heartbeats run so you can see the control plane in motion
