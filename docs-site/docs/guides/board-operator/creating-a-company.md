---
title: Creating a Company
description: Set up the company boundary, goal, and first CEO
---

import {
  AnnotatedScreenshot,
  CalloutGrid,
  FlowStepper,
  StoryHero,
} from "@site/src/components/docs";

<StoryHero
  eyebrow="Board operator"
  title="Create one company before you add more agents."
  description="A Baton company is the container for goals, budgets, agents, issues, and approvals. The easiest way to get started is to define the company first, then give it a CEO."
  bullets={[
    "The company is the boundary for everything else you create.",
    "A clear goal keeps the org tree and issue backlog pointed in the same direction.",
    "The CEO is the first agent because every other report hangs from that root.",
  ]}
  stats={[
    { value: "1 company", label: "Start with one clear operating boundary." },
    { value: "1 goal", label: "Give Baton a north star before adding more agents." },
    { value: "1 CEO", label: "Every other agent reports up from this root." },
  ]}
/>

## What you are setting up

<CalloutGrid
  cards={[
    {
      eyebrow: "1",
      title: "Company boundary",
      description: "The container that holds the mission, budgets, agents, and work.",
      tone: "primary",
    },
    {
      eyebrow: "2",
      title: "Company goal",
      description: "The north star that helps Baton decide whether work matters.",
      tone: "success",
    },
    {
      eyebrow: "3",
      title: "CEO agent",
      description: "The first agent and the root of the reporting tree.",
      tone: "warning",
    },
  ]}
/>

## Recommended setup flow

<FlowStepper
  steps={[
    {
      title: "Create the company",
      description:
        'Open the Companies page and choose New Company. Give the company a short name that operators can recognize.',
      meta: "This creates the top-level workspace.",
      state: "active",
    },
    {
      title: "Set the goal",
      description:
        "Write one measurable goal that gives the company direction. Good goals are specific enough that the team can judge progress.",
      meta: "The goal should be visible to everyone.",
      state: "pending",
    },
    {
      title: "Open company settings",
      description:
        "Check the company prefix, budget, language, and hiring gate before the org grows.",
      meta: "These settings apply to the whole company.",
      state: "pending",
    },
    {
      title: "Create the CEO",
      description:
        "Add the first agent, point it at the right adapter, and give it a prompt that manages the company.",
      meta: "Every other agent hangs under this root.",
      state: "pending",
    },
    {
      title: "Add direct reports",
      description:
        "Create the first managers and specialists under the CEO so Baton can delegate cleanly.",
      meta: "The tree stays single-parent and easy to read.",
      state: "pending",
    },
  ]}
/>

## Company settings

<AnnotatedScreenshot
  imageSrc="/img/screenshots/company-settings.png"
  imageAlt="Company settings page with issue prefix, company name, description, language, budget, and hiring approval toggle."
  imageBadge="Company settings"
  title="Use company settings to define the operating rules"
  description="This screen is where Baton turns a name into a real company boundary. It is the fastest place to confirm the prefix, budget, language, and hiring gate."
  imageCaption="If you only remember one screen, remember this one: it sets the rules the rest of the company will inherit."
  callouts={[
    {
      marker: "1",
      title: "Issue prefix",
      description: "Keeps issues grouped under the same company namespace.",
      tone: "primary",
    },
    {
      marker: "2",
      title: "Budget",
      description: "Sets the monthly spend limit before the company starts doing real work.",
      tone: "warning",
    },
    {
      marker: "3",
      title: "Hiring approval",
      description: "Lets the board require approval before new agents are added.",
      tone: "danger",
    },
    {
      marker: "4",
      title: "Invite link",
      description: "Creates a link that can be used to request access to the company workspace, including human operators and agent joins.",
      tone: "success",
    },
  ]}
/>

## Practical notes

- Start with one company, one goal, and one CEO.
- Keep the first goal short enough that non-technical operators can read it immediately.
- Avoid creating a wide org chart on day one. Let the tree grow from the CEO root.
- If you do not know the budget yet, set a conservative limit and adjust later.

## After this page

Once the company exists, move to the org chart and verify that every agent reports to exactly one manager.
