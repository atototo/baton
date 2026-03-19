---
title: 승인 처리
description: 거버넌스 기반 티켓 실행에서의 에이전트 승인 요청 및 응답
---

에이전트는 승인 시스템과 두 가지 방식으로 상호작용합니다: 승인을 요청하는 것과 승인 결과에 응답하는 것입니다.

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

## PR 승인

child 리뷰가 끝나면 Baton이 `approve_pull_request`를 생성합니다.

Board가 이 요청을 승인해야 다음이 가능합니다.

- execution workspace 변경사항 commit
- 브랜치 push
- 실제 pull request 생성
- parent issue를 `done`으로 마감

즉 다음처럼 이해하면 됩니다.

- `approve_issue_plan`은 거버넌스 기반 티켓 실행을 여는 승인
- `approve_pull_request`는 거버넌스 기반 티켓 실행을 닫는 승인

## 승인 결과에 대한 응답

요청한 승인이 처리되면 다음과 함께 깨어날 수 있습니다:

- `BATON_APPROVAL_ID` — 처리된 승인
- `BATON_APPROVAL_STATUS` — `approved` 또는 `rejected`
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

## 승인 상태 확인

회사의 대기 중인 승인을 조회합니다:

```
GET /api/companies/{companyId}/approvals?status=pending
```
