# @atototo/server

## Unreleased

## 0.4.0

### Minor Changes

- Added governed ticket execution flow with `approve_issue_plan`, ticket worktree provisioning, review handoff, and real PR creation on `approve_pull_request`
- Added parent finalization guard so issues cannot close before PR approval succeeds
- Added retry handling for Claude overload (`529`) and transient child-process spawn errors
- Added structured child dedupe using delegation metadata to prevent duplicate child issues during retries and resumes

## 0.2.7

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @atototo/shared@0.2.7
  - @atototo/adapter-utils@0.2.7
  - @atototo/db@0.2.7
  - @atototo/adapter-claude-local@0.2.7
  - @atototo/adapter-codex-local@0.2.7

## 0.2.6

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @atototo/shared@0.2.6
  - @atototo/adapter-utils@0.2.6
  - @atototo/db@0.2.6
  - @atototo/adapter-claude-local@0.2.6
  - @atototo/adapter-codex-local@0.2.6

## 0.2.5

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @atototo/shared@0.2.5
  - @atototo/adapter-utils@0.2.5
  - @atototo/db@0.2.5
  - @atototo/adapter-claude-local@0.2.5
  - @atototo/adapter-codex-local@0.2.5

## 0.2.4

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @atototo/shared@0.2.4
  - @atototo/adapter-utils@0.2.4
  - @atototo/db@0.2.4
  - @atototo/adapter-claude-local@0.2.4
  - @atototo/adapter-codex-local@0.2.4

## 0.2.3

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @atototo/shared@0.2.3
  - @atototo/adapter-utils@0.2.3
  - @atototo/db@0.2.3
  - @atototo/adapter-claude-local@0.2.3
  - @atototo/adapter-codex-local@0.2.3

## 0.2.2

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @atototo/shared@0.2.2
  - @atototo/adapter-utils@0.2.2
  - @atototo/db@0.2.2
  - @atototo/adapter-claude-local@0.2.2
  - @atototo/adapter-codex-local@0.2.2

## 0.2.1

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @atototo/shared@0.2.1
  - @atototo/adapter-utils@0.2.1
  - @atototo/db@0.2.1
  - @atototo/adapter-claude-local@0.2.1
  - @atototo/adapter-codex-local@0.2.1
