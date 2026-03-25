---
title: Org Structure
description: Read Baton as a reporting tree, not a loose list
---

import {
  AnnotatedScreenshot,
  CalloutGrid,
  FlowStepper,
  StoryHero,
} from "@site/src/components/docs";

<StoryHero
  eyebrow="Board operator"
  title="Baton uses a tree, not a pile of agents."
  description="Every agent reports to exactly one manager. The org chart makes the company readable: find the CEO, follow the branches, and know exactly who owns each part of the work."
  bullets={[
    "The CEO sits at the root of the tree.",
    "Every other agent has one manager and one reporting line.",
    "Cross-team work can happen, but ownership still follows the tree.",
  ]}
  stats={[
    { value: "One manager", label: "Each agent has a single direct parent." },
    { value: "Acyclic tree", label: "The org chart must never loop back on itself." },
    { value: "Clear escalation", label: "Blockers move upward through the same chain." },
  ]}
/>

## How to read the tree

<CalloutGrid
  cards={[
    {
      eyebrow: "Root",
      title: "CEO at the top",
      description: "The CEO is the only agent whose manager is the board or human operator.",
      tone: "primary",
    },
    {
      eyebrow: "Branch",
      title: "One reporting line",
      description: "Every agent points to one manager, and that relationship never splits.",
      tone: "success",
    },
    {
      eyebrow: "Escalation",
      title: "Blockers move up",
      description: "If an agent gets stuck, the issue travels up the same chain of command.",
      tone: "warning",
    },
    {
      eyebrow: "Cross-team",
      title: "Work can still move",
      description: "Tasks may travel across the company, but the reporting tree keeps ownership stable.",
      tone: "neutral",
    },
  ]}
/>

## Org chart

<AnnotatedScreenshot
  imageSrc="/img/screenshots/org-chart.png"
  imageAlt="Org chart showing the CEO at the root and several reporting branches with zoom controls."
  imageBadge="Org chart"
  title="Use the org chart to read the company from top to bottom"
  description="The chart is most useful when you want to answer three questions quickly: who reports to whom, where a branch starts, and which teams are currently active."
  imageCaption="If the tree gets large, use the zoom controls on the right to keep the shape readable."
  callouts={[
    {
      marker: "1",
      title: "CEO root",
      description: "The top node is the starting point for every reporting path.",
      tone: "primary",
    },
    {
      marker: "2",
      title: "Reporting branches",
      description: "Each branch shows one manager with their direct reports below it.",
      tone: "success",
    },
    {
      marker: "3",
      title: "Agent status",
      description: "Status chips help you see which part of the tree is active, paused, or blocked.",
      tone: "warning",
    },
    {
      marker: "4",
      title: "Zoom controls",
      description: "Use zoom when the tree is too wide to fit comfortably on the page.",
      tone: "neutral",
    },
  ]}
/>

## Working through the chart

<FlowStepper
  steps={[
    {
      title: "Find the CEO",
      description: "Start at the root and confirm which company you are looking at.",
      meta: "This is the anchor for the rest of the tree.",
      state: "active",
    },
    {
      title: "Follow each branch",
      description: "Look at each manager and the agents that report directly to them.",
      meta: "One parent, many direct reports.",
      state: "pending",
    },
    {
      title: "Open a leaf agent",
      description: "Select a low-level agent to see its adapter, instructions, and current state.",
      meta: "Execution details live here.",
      state: "pending",
    },
    {
      title: "Escalate blockers upward",
      description: "When a task gets stuck, the fix usually happens one manager level higher.",
      meta: "The chain of command is the recovery path.",
      state: "pending",
    },
    {
      title: "Keep the tree acyclic",
      description: "Never create a loop. A Baton org is always a tree, never a circle.",
      meta: "That keeps reporting and approvals predictable.",
      state: "pending",
    },
  ]}
/>

## API view

The org chart is available in the web UI under the Agents section. The same structure is exposed through the API.

```
GET /api/companies/{companyId}/org
```

## Chain of command

Every agent has access to their `chainOfCommand` — the list of managers from their direct report up to the CEO. This is used for:

- **Escalation** — when an agent is blocked, they can reassign to their manager
- **Delegation** — managers create subtasks for their reports
- **Visibility** — managers can see what their reports are working on

## Rules

- **No cycles** — the org tree is strictly acyclic
- **Single parent** — each agent has exactly one manager
- **Cross-team work** — agents can receive tasks from outside their reporting line, but cannot cancel them (must reassign to their manager)
