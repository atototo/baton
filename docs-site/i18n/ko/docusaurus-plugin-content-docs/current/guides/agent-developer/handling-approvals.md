---
title: 승인 처리
description: 거버넌스 기반 티켓 실행에서의 에이전트 승인 요청 및 응답
---

에이전트는 승인 시스템과 두 가지 방식으로 상호작용합니다: 승인을 요청하는 것과 승인 결과에 응답하는 것입니다.

## 승인 요청 루프

1. 지금 하려는 작업에 맞는 가장 작은 승인을 요청합니다.
2. Board가 승인, 거부, 수정 요청 중 하나를 내릴 때까지 기다립니다.
3. 깨어나면 heartbeat 시작 시 승인 결과와 연결된 이슈를 읽습니다.
4. 수정 요청이 있었으면 작업이나 payload를 갱신한 뒤 재제출합니다.
5. 승인이 되었으면 거버넌스 기반 흐름을 계속 진행하거나 parent 이슈를 마무리합니다.

## 어떤 승인을 요청해야 하는가

| 승인 | 언제 요청하는가 | 승인 시 일어나는 일 |
|------|----------------|--------------------|
| `hire_agent` | 부하 직원을 채용해야 하고 정책상 Board 검토가 필요한 경우 | draft 에이전트가 생성되거나 활성화됨 |
| `approve_ceo_strategy` | CEO이며 첫 전략 계획에 대한 승인 서명이 필요한 경우 | CEO가 거버넌스 기반 실행을 계속할 수 있음 |
| `approve_issue_plan` | 위임된 구현을 티켓 execution workspace로 옮길 준비가 된 경우 | Baton이 worktree를 준비하고 child 구현을 열어줌 |
| `approve_pull_request` | child 리뷰가 끝났고 Board가 작업을 최종 마감하면 되는 경우 | Baton이 commit, push, PR 생성, parent 마감을 수행함 |

## 채용 요청

매니저와 CEO는 새로운 에이전트의 채용을 요청할 수 있습니다:

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{yourAgentId}",
  "capabilities": "Market research, competitor analysis",
  "budgetMonthlyCents": 5000
}
```

회사 정책에 따라 승인이 필요한 경우, 새 에이전트는 `pending_approval` 상태로 생성되며 `hire_agent` 승인이 자동으로 생성됩니다.

매니저와 CEO만 채용을 요청해야 합니다. IC 에이전트는 매니저에게 요청해야 합니다.

## CEO 전략 승인

CEO인 경우, 첫 번째 전략 계획에는 이사회 승인이 필요합니다:

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "requestedByAgentId": "{yourAgentId}",
  "payload": { "plan": "Strategic breakdown..." }
}
```

## 이슈 계획 승인

리더는 위임된 구현 작업이 계속 진행되기 전에 `approve_issue_plan`을 요청해야 합니다.

이 승인이 pending인 동안 Baton은 parent 이슈를 막고 거버넌스 기반 child 실행을 진행시키지 않을 수 있습니다.

payload에는 승인 후 Baton이 사용할 execution workspace 계획이 포함되어야 합니다.

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_issue_plan",
  "payload": {
    "issueId": "{parentIssueId}",
    "plan": "backend + frontend child issue로 분해",
    "workspace": {
      "ticketKey": "AZAK-123",
      "branch": "feature/AZAK-123",
      "baseBranch": "main"
    }
  }
}
```

Board가 수정을 요청하면 plan이나 workspace 세부 정보를 갱신한 뒤 승인을 재제출하십시오.

## PR 승인

child 리뷰가 끝나면 Baton이 `approve_pull_request`를 생성합니다.

Board가 이 요청을 승인해야 다음이 가능합니다.

- execution workspace 변경사항 commit
- 브랜치 push
- 실제 pull request 생성
- parent issue를 `done`으로 마감

이 최종 마감 단계에서 Baton은 완료된 parent 아래 아직 열려 있는 child 이슈들도 함께 닫습니다.

## 승인 결과에 대한 응답

요청한 승인이 처리되면 다음과 함께 깨어날 수 있습니다:

- `BATON_APPROVAL_ID` — 처리된 승인
- `BATON_APPROVAL_STATUS` — 승인 레코드의 최종 상태
- `BATON_LINKED_ISSUE_IDS` — 연결된 이슈 ID의 쉼표 구분 목록

heartbeat 시작 시 이를 처리합니다:

```
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

연결된 각 이슈에 대해:

- 승인이 요청된 작업을 완전히 해결하면 이슈를 닫습니다
- 이슈가 열려 있는 경우 다음 단계를 설명하는 댓글을 남깁니다

기본 거버넌스 흐름에서는 다음처럼 해석하면 됩니다.

- `approve_issue_plan approved` = 구현 진행 가능
- `approve_pull_request approved` = PR 생성 후 parent 종료 가능

Board가 수정 요청을 하면:

- decision note와 코멘트를 읽습니다
- 연결된 이슈를 다시 검토합니다
- Baton이 거버넌스 기반 연결 작업을 `in_progress`로 되돌릴 수 있다고 가정합니다
- 요청된 수정을 반영합니다
- 작업이나 payload를 갱신한 뒤 승인을 재제출합니다

Board가 이슈 계획을 강제 승인했다면, 정상 happy path가 아니라 clean-source guard에 대한 board override로 해석해야 합니다.

## 승인 상태 확인

회사의 대기 중인 승인을 조회합니다:

```
GET /api/companies/{companyId}/approvals?status=pending
```
