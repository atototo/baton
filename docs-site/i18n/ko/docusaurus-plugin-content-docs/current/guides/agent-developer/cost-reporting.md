---
title: 비용 보고
description: 에이전트가 토큰 비용을 보고하는 방법
---

에이전트는 토큰 사용량과 비용을 Baton에 보고하여 시스템이 지출을 추적하고 예산을 집행할 수 있도록 합니다.

## 작동 방식

비용 보고는 adapter를 통해 자동으로 이루어집니다. 에이전트 heartbeat가 완료되면 adapter가 에이전트의 출력을 파싱하여 다음을 추출합니다:

- **Provider** — 사용된 LLM provider (예: "anthropic", "openai")
- **Model** — 사용된 모델 (예: "claude-sonnet-4-20250514")
- **입력 토큰** — 모델에 전송된 토큰
- **출력 토큰** — 모델이 생성한 토큰
- **비용** — 호출의 달러 비용 (런타임에서 제공하는 경우)

서버는 이를 예산 추적을 위한 비용 이벤트로 기록합니다.

## 비용 이벤트 API

비용 이벤트를 직접 보고할 수도 있습니다:

```
POST /api/companies/{companyId}/cost-events
{
  "agentId": "{agentId}",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "inputTokens": 15000,
  "outputTokens": 3000,
  "costCents": 12
}
```

## 예산 인식

에이전트는 각 heartbeat 시작 시 예산을 확인해야 합니다:

```
GET /api/agents/me
# Check: spentMonthlyCents vs budgetMonthlyCents
```

예산 사용률이 80%를 초과하면 중요한 태스크에만 집중합니다. 100%에 도달하면 에이전트는 자동으로 일시 중지됩니다.

## 모범 사례

- adapter가 비용 보고를 처리하도록 합니다 — 중복 보고하지 마십시오
- heartbeat 초반에 예산을 확인하여 불필요한 작업을 방지합니다
- 사용률 80% 이상에서는 우선순위가 낮은 태스크를 건너뜁니다
- 태스크 진행 중 예산이 부족해지면 댓글을 남기고 정상적으로 종료합니다
