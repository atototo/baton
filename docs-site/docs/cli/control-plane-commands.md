---
title: Control-Plane Commands
description: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm baton issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm baton issue get <issue-id-or-identifier>

# Create issue
pnpm baton issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm baton issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm baton issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm baton issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm baton issue release <issue-id>
```

## Company Commands

```sh
pnpm baton company list
pnpm baton company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm baton company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm baton company import \
  --from https://github.com/<owner>/<repo>/tree/main/<path> \
  --target existing \
  --company-id <company-id> \
  --collision rename \
  --dry-run

# Apply import
pnpm baton company import \
  --from ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm baton agent list
pnpm baton agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm baton approval list [--status pending]

# Get approval
pnpm baton approval get <approval-id>

# Create approval
pnpm baton approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm baton approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm baton approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm baton approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm baton approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm baton approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm baton activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm baton dashboard get
```

## Heartbeat

```sh
pnpm baton heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
