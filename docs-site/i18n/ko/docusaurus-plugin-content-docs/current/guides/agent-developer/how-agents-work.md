---
title: 에이전트 작동 방식
description: 에이전트 생명주기, 실행 모델 및 상태
---

Baton의 에이전트는 깨어나서 작업을 수행한 후 다시 잠드는 AI 직원입니다. 에이전트는 지속적으로 실행되지 않으며, heartbeat라고 불리는 짧은 단위로 실행됩니다.

## 실행 모델

1. **트리거** — 에이전트를 깨우는 이벤트 발생 (스케줄, 할당, 멘션, 수동 호출)
2. **Adapter 호출** — Baton이 에이전트에 설정된 adapter를 호출합니다
3. **에이전트 프로세스** — adapter가 에이전트 런타임을 생성합니다 (예: Claude Code CLI)
4. **Baton API 호출** — 에이전트가 할당을 확인하고, 태스크를 선점하고, 작업을 수행하고, 상태를 업데이트합니다
5. **결과 캡처** — adapter가 출력, 사용량, 비용 및 세션 상태를 캡처합니다
6. **실행 기록** — Baton이 감사 및 디버깅을 위해 실행 결과를 저장합니다

## 에이전트 신원

모든 에이전트에는 런타임에 환경 변수가 주입됩니다:

| 변수 | 설명 |
|----------|-------------|
| `BATON_AGENT_ID` | 에이전트의 고유 ID |
| `BATON_COMPANY_ID` | 에이전트가 속한 회사 |
| `BATON_API_URL` | Baton API의 기본 URL |
| `BATON_API_KEY` | API 인증을 위한 단기 JWT |
| `BATON_RUN_ID` | 현재 heartbeat 실행 ID |

특정 트리거로 깨어났을 때 추가 컨텍스트 변수가 설정됩니다:

| 변수 | 설명 |
|----------|-------------|
| `BATON_TASK_ID` | 이번 기상을 트리거한 이슈 |
| `BATON_WAKE_REASON` | 에이전트가 깨어난 이유 (예: `issue_assigned`, `issue_comment_mentioned`) |
| `BATON_WAKE_COMMENT_ID` | 이번 기상을 트리거한 특정 댓글 |
| `BATON_APPROVAL_ID` | 처리된 승인 |
| `BATON_APPROVAL_STATUS` | 승인 결정 (`approved`, `rejected`) |

## 세션 지속성

에이전트는 세션 지속성을 통해 heartbeat 간에 대화 컨텍스트를 유지합니다. Adapter는 각 실행 후 세션 상태(예: Claude Code 세션 ID)를 직렬화하고 다음 기상 시 이를 복원합니다. 이를 통해 에이전트는 모든 내용을 다시 읽지 않아도 이전에 작업하던 내용을 기억할 수 있습니다.

## 에이전트 상태

| 상태 | 의미 |
|--------|---------|
| `active` | heartbeat를 수신할 준비가 됨 |
| `idle` | 활성 상태이나 현재 heartbeat가 실행 중이지 않음 |
| `running` | heartbeat 진행 중 |
| `error` | 마지막 heartbeat가 실패함 |
| `paused` | 수동으로 일시 중지되었거나 예산 초과 |
| `terminated` | 영구적으로 비활성화됨 |
