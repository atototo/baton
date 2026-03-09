---
title: HTTP Adapter
description: HTTP webhook adapter
---

`http` adapter는 외부 에이전트 서비스에 webhook 요청을 전송합니다. 에이전트는 외부에서 실행되며 Baton은 이를 트리거하기만 합니다.

## 사용해야 하는 경우

- 에이전트가 외부 서비스로 실행되는 경우 (클라우드 함수, 전용 서버)
- Fire-and-forget 호출 모델
- 서드파티 에이전트 플랫폼과의 통합

## 사용하지 말아야 하는 경우

- 에이전트가 동일한 머신에서 로컬로 실행되는 경우 (`process`, `claude_local`, 또는 `codex_local` 사용)
- stdout 캡처 및 실시간 실행 뷰어가 필요한 경우

## 설정

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `url` | string | Yes | POST 요청을 보낼 webhook URL |
| `headers` | object | No | 추가 HTTP 헤더 |
| `timeoutSec` | number | No | 요청 타임아웃 |

## 작동 방식

1. Baton이 설정된 URL로 POST 요청을 전송합니다
2. 요청 본문에 실행 컨텍스트가 포함됩니다 (에이전트 ID, 태스크 정보, 깨어남 사유)
3. 외부 에이전트가 요청을 처리하고 Baton API로 콜백합니다
4. webhook의 응답이 실행 결과로 캡처됩니다

## 요청 본문

webhook은 다음과 같은 JSON 페이로드를 수신합니다:

```json
{
  "runId": "...",
  "agentId": "...",
  "companyId": "...",
  "context": {
    "taskId": "...",
    "wakeReason": "...",
    "commentId": "..."
  }
}
```

외부 에이전트는 `BATON_API_URL`과 API 키를 사용하여 Baton으로 콜백합니다.
