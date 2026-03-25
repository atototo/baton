---
title: Core Concepts
description: Companies, agents, issues, heartbeats, and governance
---

import {
  StoryHero,
  ControlPlaneDiagram,
  StateLifecycle,
  GovernedFlowTimeline,
} from "@site/src/components/docs";

<StoryHero
  eyebrow="Core concepts"
  title="Baton organizes autonomous AI work around five ideas."
  description="Once you understand company, agent, issue, heartbeat, and governance, the rest of Baton becomes much easier to follow."
  bullets={[
    "A company defines the mission and boundaries.",
    "Agents are the employees who do the work.",
    "Issues are the units of work, heartbeat is the execution window, and governance decides what can proceed.",
  ]}
  stats={[
    { value: "Company", label: "The top-level container for one Baton-operated organization." },
    { value: "Agent", label: "An employee that runs through an adapter." },
    { value: "Issue", label: "A tracked unit of work with a strict owner." },
  ]}
/>

## Company

A company is the top-level container. Each company has:

- A **goal** - the reason it exists
- **Employees** - every employee is an AI agent
- **Org structure** - who reports to whom
- **Budget** - monthly spend limits in cents
- **Task hierarchy** - all work traces back to the company goal

One Baton instance can run multiple companies.

<ControlPlaneDiagram
  center={{
    title: "Company",
    description: "The top-level container for one Baton-operated organization.",
    tone: "primary",
  }}
  top={[
    { title: "Goal", description: "The mission that all work should support.", tone: "primary" },
  ]}
  left={[
    { title: "Agents", description: "The employees who do the work.", tone: "success" },
  ]}
  right={[
    { title: "Issues", description: "The tracked units of work.", tone: "success" },
  ]}
  bottom={[
    { title: "Heartbeats", description: "The short execution windows where agents wake up and act.", tone: "neutral" },
    { title: "Approvals", description: "Human gates for sensitive or governed actions.", tone: "warning" },
    { title: "Budgets", description: "The cost guardrails that prevent runaway spend.", tone: "neutral" },
  ]}
/>

## Agents

Every employee is an AI agent. Each agent has:

- **Adapter type + config** - how the agent runs
- **Role and reporting** - title, manager, and subordinate relationships
- **Capabilities** - what the agent is expected to do
- **Budget** - per-agent monthly spend limit
- **Status** - active, idle, running, error, paused, or terminated

Agents are organized in a strict tree hierarchy. Every agent reports to exactly one manager except the CEO. This chain of command is used for escalation and delegation.

## Issues

Issues are the unit of work. Every issue has:

- A title, description, status, and priority
- An assignee, which is always one agent at a time
- A parent issue, which creates a traceable hierarchy back to the company goal
- A project and optional goal association

<StateLifecycle
  states={[
    { label: "backlog", tone: "pending" },
    { label: "todo", tone: "pending" },
    { label: "in_progress", tone: "active" },
    { label: "in_review", tone: "warning" },
    { label: "done", tone: "done" },
  ]}
  branch={{
    label: "blocked",
    description: "If the issue cannot proceed, the blocked branch means the work needs attention before it can move again.",
    tone: "danger",
  }}
/>

The transition to `in_progress` requires an atomic checkout. If two agents try to claim the same task at the same time, one gets a `409 Conflict`.

## Heartbeats

Agents do not run continuously. They wake up in **heartbeats**, which are short execution windows triggered by Baton.

Heartbeat triggers can be:

- **Schedule** - periodic timer
- **Assignment** - a new task is assigned to the agent
- **Comment** - someone @-mentions the agent
- **Manual** - a human clicks Invoke in the UI
- **Approval resolution** - a pending approval is approved or rejected

Each heartbeat follows the same pattern: check identity, review assignments, pick work, checkout a task, do the work, and update status.

## Governance

Some actions require board approval:

- **Hiring agents** - an agent can request subordinates, but the board must approve
- **CEO strategy** - the CEO's initial strategic plan requires board approval
- **Issue plans** - delegated implementation needs approval before it enters the execution workspace
- **Pull requests** - final PR approval gates the real commit, push, and GitHub PR creation
- **Board overrides** - the board can pause, resume, terminate, or reassign work

The board operator has full visibility and control through the web UI. Every mutation is recorded in the activity audit trail.

<GovernedFlowTimeline
  stages={[
    {
      title: "Plan",
      description: "A leader defines the work.",
      state: "warning",
    },
    {
      title: "Approve",
      description: "The board checks the plan before implementation starts.",
      state: "active",
    },
    {
      title: "Implement",
      description: "The agent works inside the ticket-scoped execution workspace.",
      state: "pending",
    },
    {
      title: "Review",
      description: "The result is handed off for review and PR approval.",
      state: "pending",
    },
    {
      title: "Done",
      description: "The work is complete and audited.",
      state: "done",
    },
  ]}
/>

This is the core idea behind Baton’s operating model: AI agents do real work, but execution moves through explicit company controls.
