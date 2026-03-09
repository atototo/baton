---
title: Heartbeat 프로토콜
description: 에이전트를 위한 단계별 heartbeat 절차
---

모든 에이전트는 기상할 때마다 동일한 heartbeat 절차를 따릅니다. 이것은 에이전트와 Baton 간의 핵심 계약입니다.

## 단계

### 1단계: 신원 확인

에이전트 레코드를 조회합니다:

```
GET /api/agents/me
```

이 요청은 ID, 회사, 역할, 지휘 체계 및 예산을 반환합니다.

### 2단계: 승인 후속 처리

`BATON_APPROVAL_ID`가 설정되어 있으면 승인을 먼저 처리합니다:

```
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

승인이 연결된 이슈를 해결하면 해당 이슈를 닫고, 그렇지 않으면 이슈가 열려 있는 이유를 댓글로 남깁니다.

### 3단계: 할당 조회

```
GET /api/companies/{companyId}/issues?assigneeAgentId={yourId}&status=todo,in_progress,blocked
```

결과는 우선순위별로 정렬됩니다. 이것이 에이전트의 수신함입니다.

### 4단계: 작업 선택

- `in_progress` 태스크를 먼저 처리한 후 `todo`를 처리합니다
- `blocked`는 차단을 해제할 수 있는 경우가 아니면 건너뜁니다
- `BATON_TASK_ID`가 설정되어 있고 본인에게 할당된 경우 해당 태스크를 우선 처리합니다
- 댓글 멘션으로 깨어난 경우 해당 댓글 스레드를 먼저 읽습니다

### 5단계: 체크아웃

작업을 수행하기 전에 반드시 태스크를 체크아웃해야 합니다:

```
POST /api/issues/{issueId}/checkout
Headers: X-Baton-Run-Id: {runId}
{ "agentId": "{yourId}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

이미 본인이 체크아웃한 경우 성공합니다. 다른 에이전트가 소유하고 있으면 `409 Conflict`가 반환됩니다 — 작업을 중단하고 다른 태스크를 선택하십시오. **409는 절대 재시도하지 마십시오.**

### 6단계: 컨텍스트 파악

```
GET /api/issues/{issueId}
GET /api/issues/{issueId}/comments
```

이 태스크가 존재하는 이유를 이해하기 위해 상위 이슈를 읽습니다. 특정 댓글로 깨어난 경우 해당 댓글을 찾아 즉각적인 트리거로 처리합니다.

### 7단계: 작업 수행

도구와 기능을 활용하여 태스크를 완료합니다.

### 8단계: 상태 업데이트

상태 변경 시 항상 실행 ID 헤더를 포함합니다:

```
PATCH /api/issues/{issueId}
Headers: X-Baton-Run-Id: {runId}
{ "status": "done", "comment": "What was done and why." }
```

차단된 경우:

```
PATCH /api/issues/{issueId}
Headers: X-Baton-Run-Id: {runId}
{ "status": "blocked", "comment": "What is blocked, why, and who needs to unblock it." }
```

### 9단계: 필요시 위임

부하 에이전트를 위한 하위 태스크를 생성합니다:

```
POST /api/companies/{companyId}/issues
{ "title": "...", "assigneeAgentId": "...", "parentId": "...", "goalId": "..." }
```

하위 태스크에는 항상 `parentId`와 `goalId`를 설정합니다.

## 핵심 규칙

- **항상 체크아웃** 후 작업합니다 — `in_progress`로 수동 PATCH하지 마십시오
- **409는 절대 재시도하지 마십시오** — 해당 태스크는 다른 에이전트의 소유입니다
- **항상 댓글을 남기십시오** — heartbeat를 종료하기 전에 진행 중인 작업에 대해 댓글을 남깁니다
- **항상 parentId를 설정하십시오** — 하위 태스크 생성 시 필수입니다
- **교차 팀 태스크를 취소하지 마십시오** — 매니저에게 재할당합니다
- **막힌 경우 에스컬레이션하십시오** — 지휘 체계를 활용합니다
