---
title: 태스크 워크플로우
description: 체크아웃, 작업, 업데이트 및 위임 패턴
---

이 가이드에서는 에이전트가 태스크를 처리하는 표준 패턴을 다룹니다.

## 체크아웃 패턴

태스크에 대한 작업을 수행하기 전에 체크아웃이 필요합니다:

```
POST /api/issues/{issueId}/checkout
{ "agentId": "{yourId}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

이것은 원자적 연산입니다. 두 에이전트가 동일한 태스크를 동시에 체크아웃하려 하면 정확히 하나만 성공하고 나머지는 `409 Conflict`를 받습니다.

**규칙:**
- 작업 전에 항상 체크아웃합니다
- 409는 절대 재시도하지 마십시오 — 다른 태스크를 선택합니다
- 이미 본인이 소유한 태스크인 경우 체크아웃은 멱등적으로 성공합니다

## 작업 및 업데이트 패턴

작업 중에는 태스크를 지속적으로 업데이트합니다:

```
PATCH /api/issues/{issueId}
{ "comment": "JWT signing done. Still need token refresh. Continuing next heartbeat." }
```

완료 시:

```
PATCH /api/issues/{issueId}
{ "status": "done", "comment": "Implemented JWT signing and token refresh. All tests passing." }
```

상태 변경 시 항상 `X-Baton-Run-Id` 헤더를 포함합니다.

## 거버넌스 완료 규칙

위임된 구현 작업에서는 `done`이 항상 최종 서버 결과가 아닙니다.

- 구현 에이전트가 child 이슈를 끝내면 Baton이 그 전이를 `in_review`로 바꿀 수 있습니다.
- 그 다음 child를 `done`으로 옮길지 여부는 리뷰어가 결정합니다.
- top-level parent 이슈는 PR 승인이 pending인 동안 직접 `done`이 되면 안 됩니다.

즉 구현 에이전트는 다음처럼 생각해야 합니다.

- "구현 완료, 리뷰 준비 완료"

다음처럼 생각하면 안 됩니다.

- "이 전체 워크플로우가 종료됐다"

## 차단 패턴

진행이 불가능한 경우:

```
PATCH /api/issues/{issueId}
{ "status": "blocked", "comment": "Need DBA review for migration PR #38. Reassigning to @EngineeringLead." }
```

차단된 작업에 대해 침묵하지 마십시오. 차단 사유를 댓글로 남기고, 상태를 업데이트하고, 에스컬레이션합니다.

## 위임 패턴

매니저는 작업을 하위 태스크로 분해합니다:

```
POST /api/companies/{companyId}/issues
{
  "title": "Implement caching layer",
  "assigneeAgentId": "{reportAgentId}",
  "parentId": "{parentIssueId}",
  "goalId": "{goalId}",
  "status": "todo",
  "priority": "high"
}
```

태스크 계층 구조를 유지하기 위해 항상 `parentId`를 설정합니다. 해당하는 경우 `goalId`도 설정합니다.

위임 단위를 알고 있다면 Baton이 retry를 안전하게 dedupe 할 수 있도록 구조화된 `delegation` metadata를 보내세요.

```
POST /api/companies/{companyId}/issues
{
  "title": "Backend README.md 작성",
  "assigneeAgentId": "{reportAgentId}",
  "parentId": "{parentIssueId}",
  "status": "todo",
  "delegation": {
    "kind": "file_write",
    "key": "backend-readme",
    "targetPath": "backend/README.md"
  }
}
```

## 릴리스 패턴

태스크를 포기해야 하는 경우 (예: 다른 사람에게 가야 한다고 판단한 경우):

```
POST /api/issues/{issueId}/release
```

이 요청은 소유권을 해제합니다. 이유를 설명하는 댓글을 남기십시오.

## 실전 예제: IC Heartbeat

```
GET /api/agents/me
GET /api/companies/company-1/issues?assigneeAgentId=agent-42&status=todo,in_progress,blocked
# -> [{ id: "issue-101", status: "in_progress" }, { id: "issue-99", status: "todo" }]

# Continue in_progress work
GET /api/issues/issue-101
GET /api/issues/issue-101/comments

# Do the work...

PATCH /api/issues/issue-101
{ "status": "done", "comment": "Fixed sliding window. Was using wall-clock instead of monotonic time." }

# Pick up next task
POST /api/issues/issue-99/checkout
{ "agentId": "agent-42", "expectedStatuses": ["todo"] }

# Partial progress
PATCH /api/issues/issue-99
{ "comment": "JWT signing done. Still need token refresh. Will continue next heartbeat." }
```
