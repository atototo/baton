---
title: 승인
description: 계획, 리뷰, PR에 대한 거버넌스 흐름
---

Baton에는 인간 Board Operator가 주요 의사 결정을 통제할 수 있도록 하는 승인 게이트가 포함되어 있습니다.

기본 거버넌스 기반 티켓 흐름에서 승인은 단순 기록이 아니라 실제 실행 게이트 역할을 합니다.

- `approve_issue_plan`은 거버넌스 기반 티켓 실행을 여는 승인입니다
- `approve_pull_request`는 거버넌스 기반 티켓 실행을 닫는 승인입니다

## 승인 유형

### 에이전트 채용

에이전트(일반적으로 관리자 또는 CEO)가 새로운 부하 직원을 채용하려면 채용 요청을 제출합니다. 이 요청은 승인 대기열에 `hire_agent` 승인으로 표시됩니다.

승인에는 제안된 에이전트의 이름, 역할, 역량, adapter 설정 및 예산이 포함됩니다.

### CEO 전략

CEO의 초기 전략 계획은 CEO가 태스크를 `in_progress`로 이동하기 전에 Board 승인이 필요합니다. 이를 통해 회사 방향에 대한 인간의 승인을 보장합니다.

### 이슈 계획 승인

리더는 구현 위임이 시작되기 전에 `approve_issue_plan`을 사용합니다.

이 승인에는 다음이 포함됩니다.

- ticket key
- 실행 브랜치
- base branch
- 프로젝트 workspace
- source repo 경로

이 승인을 통과하면 티켓 execution workspace가 준비되고 child 구현 작업이 진행될 수 있습니다.

### PR 승인

리더는 child 리뷰가 끝난 뒤 `approve_pull_request`를 사용합니다.

이 승인을 통과하면 Baton이 실제 git 부수 효과를 수행합니다.

- execution workspace에서 commit
- origin으로 push
- GitHub PR 생성
- parent 이슈 종료

## 승인 워크플로

```
pending -> approved
        -> rejected
        -> cancelled
        -> revision_requested -> resubmitted -> pending
```

1. 에이전트가 승인 요청을 생성합니다
2. 승인 대기열에 표시됩니다 (UI의 Approvals 페이지)
3. 요청 세부 사항 및 연결된 이슈를 검토합니다
4. 다음을 수행할 수 있습니다:
   - **승인** — 작업이 진행됩니다
   - **거부** — 작업이 거부됩니다
   - **수정 요청** — 에이전트에게 수정 후 재제출을 요청합니다

기본 프로젝트 흐름은 [거버넌스 기반 티켓 실행 흐름](/guides/board-operator/default-governed-workflow) 문서를 참고하세요.

## Board가 실제로 승인하는 것

`approve_issue_plan`에서는 다음을 승인합니다.

- 어떤 ticket 기준으로 실행할지
- 어떤 branch/base branch를 사용할지
- 어떤 project workspace를 사용할지
- 구현이 planning 단계에서 ticket worktree 단계로 넘어가도 되는지

`approve_pull_request`에서는 다음을 승인합니다.

- 최종 리뷰 handoff
- 실제 commit과 push
- 실제 GitHub pull request 생성
- parent 이슈의 최종 종료

## 승인 검토

Approvals 페이지에서 모든 대기 중인 승인을 확인할 수 있습니다. 각 승인에는 다음이 표시됩니다:

- 누가 요청했으며 그 이유
- 연결된 이슈 (요청에 대한 맥락)
- 전체 페이로드 (예: 채용에 대한 제안된 에이전트 설정)

## Board 재정 권한

Board Operator로서 다음 작업도 수행할 수 있습니다:

- 언제든지 에이전트를 일시 중지하거나 재개
- 에이전트를 종료 (되돌릴 수 없음)
- 다른 에이전트에게 태스크 재할당
- 예산 한도 재정의
- 에이전트를 직접 생성 (승인 흐름 우회)
