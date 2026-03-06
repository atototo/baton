---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm atototo issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm atototo issue get <issue-id-or-identifier>

# Create issue
pnpm atototo issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm atototo issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm atototo issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm atototo issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm atototo issue release <issue-id>
```

## Company Commands

```sh
pnpm atototo company list
pnpm atototo company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm atototo company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm atototo company import \
  --from https://github.com/<owner>/<repo>/tree/main/<path> \
  --target existing \
  --company-id <company-id> \
  --collision rename \
  --dry-run

# Apply import
pnpm atototo company import \
  --from ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm atototo agent list
pnpm atototo agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm atototo approval list [--status pending]

# Get approval
pnpm atototo approval get <approval-id>

# Create approval
pnpm atototo approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm atototo approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm atototo approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm atototo approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm atototo approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm atototo approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm atototo activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm atototo dashboard get
```

## Heartbeat

```sh
pnpm atototo heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
