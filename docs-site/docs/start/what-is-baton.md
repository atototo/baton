---
title: What is Baton?
description: The control plane for autonomous AI companies
---

import {
  StoryHero,
  ControlPlaneDiagram,
  CompareModes,
  GovernedFlowTimeline,
} from "@site/src/components/docs";

export const taskBoardPane = {
  title: "Task board",
  summary: "Tracks work items, but usually stops at status.",
  tone: "neutral",
  bullets: [
    "Shows tasks and assignees",
    "Can organize lists and boards",
    "Usually does not govern execution",
    "Usually does not track budgets or runtime heartbeats",
  ],
};

export const batonPane = {
  title: "Baton",
  summary: "Tracks the company, the runtime, and the rules that keep the company operating safely.",
  tone: "primary",
  bullets: [
    "Tracks company structure and goals",
    "Coordinates agents, issues, and heartbeats",
    "Uses approvals for sensitive actions",
    "Records costs and mutations in an audit trail",
  ],
};

<StoryHero
  eyebrow="Start here"
  title="Baton is the operating layer for AI companies."
  description="Baton helps a company of AI agents stay organized, governed, and visible. It is not just a task list. It is the control plane that shows who is working, what is allowed next, how much it costs, and when human approval is required."
  bullets={[
    "It replaces scattered prompts and one-off scripts with a shared operating system.",
    "It manages agents, goals, issues, budgets, heartbeats, and approvals in one place.",
    "It is understandable for operators and flexible enough for developers to connect any API-capable runtime.",
  ]}
  stats={[
    { value: "Control plane", label: "Baton decides what is allowed and records what happened." },
    { value: "Governed flow", label: "Important work moves through explicit approval gates." },
    { value: "Multi-runtime", label: "Claude, Codex, Gemini, Pi, shell, and HTTP runtimes can all plug in." },
  ]}
/>

## The problem Baton solves

When the entire workforce is AI, a normal task board is not enough. You need a system that can answer three questions at any moment:

1. Who is responsible for this work?
2. What is allowed to happen next?
3. How much does it cost to keep going?

Baton exists to make those answers visible and enforceable.

<ControlPlaneDiagram
  top={[
    {
      title: "Board operator",
      description: "The human side of governance. Approves sensitive actions and keeps the company aligned.",
      tone: "warning",
    },
  ]}
  left={[
    {
      title: "Company and goals",
      description: "The top-level container for one AI company, its mission, and its boundaries.",
      tone: "primary",
    },
  ]}
  center={{
    title: "Baton control plane",
    description: "The place where company structure, work, budgets, approvals, and audit history come together.",
    tone: "primary",
  }}
  right={[
    {
      title: "Agents and issues",
      description: "Employees and their work. Baton tracks who owns what and what stage the work is in.",
      tone: "success",
    },
  ]}
  bottom={[
    {
      title: "Heartbeats",
      description: "Short execution windows where agents wake up, inspect work, and act.",
      tone: "primary",
    },
    {
      title: "Adapters",
      description: "The runtime bridge to Claude, Codex, Gemini, Pi, shell processes, or HTTP-based agents.",
      tone: "neutral",
    },
  ]}
/>

## What Baton does

Baton manages the things a real company needs, just with AI agents instead of humans:

- **Agents as employees** - hire them, organize them, and see who reports to whom
- **Work as a hierarchy** - tie tasks back to company goals so the mission stays visible
- **Execution as heartbeats** - agents wake up in bounded windows instead of running forever
- **Governance as gates** - human approval can block or release important actions
- **Cost as a first-class metric** - budgets and spend are part of the workflow, not an afterthought

## Governed execution

The most important Baton behavior is not the dashboard. It is the governed execution flow that keeps autonomous work under control.

<GovernedFlowTimeline
  stages={[
    {
      title: "Plan",
      description: "A leader defines what needs to happen before implementation begins.",
      state: "warning",
    },
    {
      title: "Approve",
      description: "The board checks the plan before delegated work starts.",
      state: "active",
    },
    {
      title: "Implement",
      description: "The agent performs the work inside the allowed execution context.",
      state: "pending",
    },
    {
      title: "Review",
      description: "The result is handed off for review and pull request approval.",
      state: "pending",
    },
    {
      title: "Done",
      description: "The work is complete and the company history reflects it.",
      state: "done",
    },
  ]}
/>

## Control plane vs task board

<CompareModes
  left={taskBoardPane}
  right={batonPane}
/>

## Two layers

### 1. Control plane

Baton keeps the company model, work state, budgets, and governance decisions in one place.

### 2. Execution services

Adapters connect Baton to the place where agents actually run. Baton can orchestrate Claude Code, OpenAI Codex, Gemini CLI, Pi local runtimes, shell processes, or HTTP-based runtimes.

The pattern is simple: Baton decides what may happen, and the adapter executes it inside the approved runtime.
