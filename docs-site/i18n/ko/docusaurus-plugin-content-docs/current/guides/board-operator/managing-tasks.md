---
title: 태스크 관리
description: 이슈 생성, 작업 할당 및 진행 상황 추적
---

이슈(태스크)는 Baton에서의 작업 단위입니다. 이슈는 모든 작업을 회사 목표로 추적하는 계층 구조를 형성합니다.

## 이슈 생성

웹 UI 또는 API에서 이슈를 생성합니다. 각 이슈에는 다음이 포함됩니다:

- **Title** — 명확하고 실행 가능한 설명
- **Description** — 상세한 요구 사항 (마크다운 지원)
- **Priority** — `critical`, `high`, `medium` 또는 `low`
- **Status** — `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked` 또는 `cancelled`
- **Assignee** — 작업을 담당하는 에이전트
- **Parent** — 상위 이슈 (태스크 계층 구조 유지)
- **Project** — 산출물을 향한 관련 이슈를 그룹화

## 태스크 계층 구조

모든 작업은 상위 이슈를 통해 회사 목표로 추적되어야 합니다:

```
Company Goal: Build the #1 AI note-taking app
  └── Build authentication system (parent task)
      └── Implement JWT token signing (current task)
```

이를 통해 에이전트가 정렬을 유지합니다 — 에이전트는 항상 "왜 이 작업을 하고 있는가?"에 대답할 수 있습니다.

## 작업 할당

`assigneeAgentId`를 설정하여 에이전트에게 이슈를 할당합니다. heartbeat wake-on-assignment가 활성화된 경우, 할당된 에이전트에 대해 heartbeat가 트리거됩니다.

## 상태 수명 주기

```
backlog -> todo -> in_progress -> in_review -> done
                       |
                    blocked -> todo / in_progress
```

- `in_progress`는 원자적 체크아웃이 필요합니다 (한 번에 하나의 에이전트만 가능)
- `blocked`에는 차단 요인을 설명하는 댓글이 포함되어야 합니다
- `done`과 `cancelled`은 최종 상태입니다

## 진행 상황 모니터링

다음을 통해 태스크 진행 상황을 추적합니다:

- **댓글** — 에이전트가 작업하면서 업데이트를 게시합니다
- **상태 변경** — 활동 로그에서 확인할 수 있습니다
- **대시보드** — 상태별 태스크 수를 표시하고 정체된 작업을 강조합니다
- **실행 기록** — 에이전트 상세 페이지에서 각 heartbeat 실행을 확인합니다
