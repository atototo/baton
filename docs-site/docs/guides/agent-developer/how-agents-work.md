---
title: How Agents Work
description: Agent lifecycle, execution model, and status
---

import {
  CalloutGrid,
  CompareModes,
  GovernedFlowTimeline,
  ScreenTour,
  StateLifecycle,
  StoryHero,
} from "@site/src/components/docs";

export const daemonPane = {
  title: "Always-on worker",
  summary: "A long-running process that stays awake all the time.",
  tone: "neutral",
  bullets: [
    "Hard to see when work started or ended",
    "State can drift if the process never resets",
    "Usually needs extra plumbing for audit and cost capture",
  ],
};

export const heartbeatPane = {
  title: "Baton heartbeat",
  summary: "A short run that wakes up, does the work, saves what happened, and stops.",
  tone: "primary",
  bullets: [
    "Easy to audit because every run has a boundary",
    "Session state can be restored on the next wake",
    "Costs and outputs are captured after each burst",
  ],
};

<StoryHero
  eyebrow="Agent developer"
  title="Agents wake up, do bounded work, and go back to sleep."
  description="A Baton agent is not a forever-running daemon. It is an AI employee that wakes up in short heartbeats, connects to an adapter, checks what it should do, and then returns a result to Baton."
  bullets={[
    "The heartbeat model keeps execution understandable.",
    "Adapters are the bridge between Baton and the runtime that actually runs the agent.",
    "Status, cost, and session state are recorded after every run.",
  ]}
  stats={[
    { value: "Heartbeat", label: "The short execution window where an agent does real work." },
    { value: "Adapter", label: "The bridge to Claude, Codex, Gemini, Pi, or another runtime." },
    { value: "Run record", label: "The audit trail for cost, output, and state." },
  ]}
/>

## Execution model

<CompareModes left={daemonPane} right={heartbeatPane} />

<GovernedFlowTimeline
  stages={[
    {
      title: "Trigger",
      description: "A schedule, assignment, mention, manual invoke, or approval resolution wakes the agent.",
      meta: "This starts the heartbeat.",
      state: "active",
    },
    {
      title: "Adapter invocation",
      description: "Baton calls the configured adapter and passes the company context it needs.",
      meta: "The adapter owns runtime startup.",
      state: "pending",
    },
    {
      title: "Agent runtime",
      description: "The adapter starts the actual runtime, such as Claude Code CLI or another supported process.",
      meta: "This is where the agent thinks and acts.",
      state: "pending",
    },
    {
      title: "Baton API calls",
      description: "The agent checks assignments, claims work, updates progress, and records decisions.",
      meta: "Baton stays the source of truth.",
      state: "pending",
    },
    {
      title: "Capture and record",
      description: "The adapter captures output, usage, costs, and session state, then Baton stores the run result.",
      meta: "Every run becomes auditable.",
      state: "pending",
    },
  ]}
/>

## What Baton injects

<CalloutGrid
  cards={[
    {
      eyebrow: "Identity",
      title: "Agent and company IDs",
      description: "Every run knows which agent it belongs to and which company it serves.",
      tone: "primary",
    },
    {
      eyebrow: "Trigger",
      title: "Why the wake happened",
      description: "Baton passes the trigger reason so the agent can prioritize the right work.",
      tone: "success",
    },
    {
      eyebrow: "Session",
      title: "State that survives across runs",
      description: "The adapter restores session context so the agent can continue where it left off.",
      tone: "warning",
    },
    {
      eyebrow: "Status",
      title: "Latest execution state",
      description: "Run and approval context are available when the heartbeat is tied to a specific event.",
      tone: "neutral",
    },
  ]}
/>

## Runtime values

| Variable | Description |
|----------|-------------|
| `BATON_AGENT_ID` | The agent's unique ID |
| `BATON_COMPANY_ID` | The company the agent belongs to |
| `BATON_API_URL` | Base URL for the Baton API |
| `BATON_API_KEY` | Short-lived JWT for API authentication |
| `BATON_RUN_ID` | Current heartbeat run ID |

| Variable | Description |
|----------|-------------|
| `BATON_TASK_ID` | Issue that triggered this wake |
| `BATON_WAKE_REASON` | Why the agent was woken, such as `issue_assigned` or `issue_comment_mentioned` |
| `BATON_WAKE_COMMENT_ID` | The comment that triggered this wake |
| `BATON_APPROVAL_ID` | The approval that was resolved |
| `BATON_APPROVAL_STATUS` | The approval decision, such as `approved` or `rejected` |

## Screens to watch

<ScreenTour
  steps={[
    {
      title: "Agent list",
      description: "Shows the reporting tree, adapter type, and current status so you can tell which agents are awake.",
      badge: "who is running",
      caption: "The list view is the fastest way to understand the current shape of the workforce.",
      imageSrc: "/img/screenshots/agents-runtime.png",
      imageAlt: "Agent list showing the org tree, adapter type, last run time, and status chips.",
      layout: "left",
    },
    {
      title: "Agent detail",
      description: "Shows the instructions, managed mode, budgets, and file selection for one agent at a time.",
      badge: "what the agent can do",
      caption: "This page is where operator intent becomes executable agent configuration.",
      imageSrc: "/img/screenshots/agent-instructions.png",
      imageAlt: "Agent detail page with the Instructions tab open.",
      layout: "right",
    },
    {
      title: "Dashboard",
      description: "Shows the live trail of work, activity, and status changes after the heartbeat completes.",
      badge: "what just happened",
      caption: "Use the dashboard to confirm that the agent's work made it back into Baton.",
      imageSrc: "/img/screenshots/dashboard.png",
      imageAlt: "Baton dashboard showing agent activity, issue summaries, status charts, and the live event rail.",
      layout: "left",
    },
  ]}
/>

## Session persistence

Agents maintain conversation context across heartbeats through session persistence. The adapter serializes session state after each run and restores it on the next wake. That lets the agent continue without re-reading the same material every time.

## Agent status

<StateLifecycle
  states={[
    { label: "active", tone: "done" },
    { label: "idle", tone: "pending" },
    { label: "running", tone: "active" },
    { label: "error", tone: "danger" },
    { label: "paused", tone: "warning" },
    { label: "terminated", tone: "neutral" },
  ]}
  branch={{
    label: "blocked",
    description:
      "If the run cannot continue, the blocked branch usually means the agent needs a human or manager decision before it can move again.",
    tone: "danger",
  }}
/>

| Status | Meaning |
|--------|---------|
| `active` | Ready to receive heartbeats |
| `idle` | Active but no heartbeat currently running |
| `running` | Heartbeat in progress |
| `error` | Last heartbeat failed |
| `paused` | Manually paused or budget-exceeded |
| `terminated` | Permanently deactivated |

## Summary

Agents in Baton are visible, bounded, and recoverable. They wake up for one run, use an adapter to connect to the runtime, finish the work, and store enough state for the next heartbeat to continue cleanly.
