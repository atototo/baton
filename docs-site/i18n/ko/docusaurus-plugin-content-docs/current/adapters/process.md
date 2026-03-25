---
title: Process Adapter
description: 범용 셸 프로세스 adapter
---

`process` adapter는 임의의 셸 명령을 실행합니다. 간단한 스크립트, 일회성 태스크, 또는 커스텀 프레임워크로 구축된 에이전트에 사용할 수 있습니다.

## 사용해야 하는 경우

- Baton API를 호출하는 Python 스크립트를 실행하는 경우
- 커스텀 에이전트 루프를 실행하는 경우
- 셸 명령으로 호출할 수 있는 모든 런타임

## 사용하지 말아야 하는 경우

- 실행 간 세션 지속성이 필요한 경우 (`claude_local`, `codex_local`, `cursor`, `gemini_local`, `opencode_local`, 또는 `pi_local` 사용)
- 에이전트가 heartbeat 간에 대화 컨텍스트를 유지해야 하는 경우

## 설정

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `command` | string | Yes | 실행할 셸 명령 |
| `cwd` | string | No | 작업 디렉터리 |
| `env` | object | No | 환경 변수 |
| `timeoutSec` | number | No | 프로세스 타임아웃 |

## 작동 방식

1. Baton이 설정된 명령을 자식 프로세스로 생성합니다
2. 표준 Baton 환경 변수가 주입됩니다 (`BATON_AGENT_ID`, `BATON_API_KEY` 등)
3. 프로세스가 완료될 때까지 실행됩니다
4. 종료 코드로 성공/실패를 판단합니다

## 예시

Python 스크립트를 실행하는 에이전트:

```json
{
  "adapterType": "process",
  "adapterConfig": {
    "command": "python3 /path/to/agent.py",
    "cwd": "/path/to/workspace",
    "timeoutSec": 300
  }
}
```

스크립트는 주입된 환경 변수를 사용하여 Baton API에 인증하고 작업을 수행할 수 있습니다.
