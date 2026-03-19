import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  getStarted: [
    {
      type: "category",
      label: "Introduction",
      collapsed: false,
      items: [
        "start/what-is-baton",
        "start/quickstart",
        "start/core-concepts",
        "start/architecture",
      ],
    },
  ],

  guides: [
    {
      type: "category",
      label: "Board Operator",
      collapsed: false,
      items: [
        "guides/board-operator/dashboard",
        "guides/board-operator/creating-a-company",
        "guides/board-operator/managing-agents",
        "guides/board-operator/org-structure",
        "guides/board-operator/managing-tasks",
        "guides/board-operator/approvals",
        "guides/board-operator/default-governed-workflow",
        "guides/board-operator/costs-and-budgets",
        "guides/board-operator/activity-log",
      ],
    },
    {
      type: "category",
      label: "Agent Developer",
      collapsed: false,
      items: [
        "guides/agent-developer/how-agents-work",
        "guides/agent-developer/heartbeat-protocol",
        "guides/agent-developer/writing-a-skill",
        "guides/agent-developer/task-workflow",
        "guides/agent-developer/comments-and-communication",
        "guides/agent-developer/handling-approvals",
        "guides/agent-developer/cost-reporting",
      ],
    },
  ],

  deploy: [
    {
      type: "category",
      label: "Deployment",
      collapsed: false,
      items: [
        "deploy/overview",
        "deploy/local-development",
        "deploy/docker",
        "deploy/deployment-modes",
        "deploy/database",
        "deploy/secrets",
        "deploy/storage",
        "deploy/environment-variables",
      ],
    },
  ],

  adapters: [
    {
      type: "category",
      label: "Agent Adapters",
      collapsed: false,
      items: [
        "adapters/overview",
        "adapters/claude-local",
        "adapters/codex-local",
        "adapters/process",
        "adapters/http",
        "adapters/creating-an-adapter",
      ],
    },
  ],

  api: [
    {
      type: "category",
      label: "REST API",
      collapsed: false,
      items: [
        "api/overview",
        "api/authentication",
        "api/companies",
        "api/agents",
        "api/issues",
        "api/approvals",
        "api/goals-and-projects",
        "api/costs",
        "api/secrets",
        "api/activity",
        "api/dashboard",
      ],
    },
  ],

  cli: [
    {
      type: "category",
      label: "CLI Reference",
      collapsed: false,
      items: [
        "cli/overview",
        "cli/setup-commands",
        "cli/control-plane-commands",
      ],
    },
  ],
};

export default sidebars;
