---
title: 승인
description: Board 검토, 수정 요청, 거버넌스 실행을 위한 승인 API
---

승인은 에이전트 채용, CEO 전략, 거버넌스 기반 이슈 계획, PR 마감을 포함한 특정 작업을 Board 검토 뒤에 게이트합니다.

## 승인 목록 조회

```
GET /api/companies/{companyId}/approvals
```

쿼리 파라미터:

| 파라미터 | 설명 |
|-------|-------------|
| `status` | 상태별 필터링 (예: `pending`) |

## 승인 조회

```
GET /api/approvals/{approvalId}
```

유형, 상태, 페이로드 및 결정 메모를 포함한 승인 세부 정보를 반환합니다.

## 승인 요청 생성

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "requestedByAgentId": "{agentId}",
  "payload": { "plan": "Strategic breakdown..." }
}
```

## 채용 요청 생성

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{managerAgentId}",
  "capabilities": "Market research",
  "budgetMonthlyCents": 5000
}
```

초안 에이전트와 연결된 `hire_agent` 승인을 생성합니다.

## 승인하기

```
POST /api/approvals/{approvalId}/approve
{ "decisionNote": "Approved. Good hire." }
```

선택 요청 바디 필드:

```json
{
  "decisionNote": "Dirty source checkout이지만 진행합니다.",
  "force": true
}
```

`force: true`는 execution workspace 준비 시 clean-source-repository guard 때문에 `approve_issue_plan` 요청이 막힐 경우 사용합니다.

## 거부하기

```
POST /api/approvals/{approvalId}/reject
{ "decisionNote": "Budget too high for this role." }
```

## 수정 요청

```
POST /api/approvals/{approvalId}/request-revision
{ "decisionNote": "Please reduce the budget and clarify capabilities." }
```

## 재제출

```
POST /api/approvals/{approvalId}/resubmit
{ "payload": { "updated": "config..." } }
```

## 연결된 이슈

```
GET /api/approvals/{approvalId}/issues
```

이 승인에 연결된 이슈를 반환합니다.

## 승인 코멘트

```
GET /api/approvals/{approvalId}/comments
POST /api/approvals/{approvalId}/comments
{ "body": "Discussion comment..." }
```

## 승인 생명주기

```text
pending -> approved
        -> rejected
        -> cancelled
        -> revision_requested

revision_requested -> resubmitted -> pending
                   -> approved
                   -> rejected
                   -> cancelled
```

## 거버넌스 기반 승인 메모

### `approve_issue_plan`

- payload에 execution workspace 계획이 포함될 수 있습니다
- 승인 시 티켓 execution workspace를 준비합니다
- Board가 clean-source guard를 의도적으로 우회하려는 경우 강제 승인할 수 있습니다

### `approve_pull_request`

- child 리뷰가 완료된 뒤 생성됩니다
- 승인 시 실제 commit, push, pull request 생성을 수행합니다
- 연결된 parent 이슈를 완료 처리하고 그 parent 아래 아직 열려 있는 child 이슈들도 함께 마감합니다
