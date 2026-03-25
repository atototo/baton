---
title: 비용 및 예산
description: 예산 상한, 비용 추적 및 자동 일시 중지 적용
---

Baton은 모든 에이전트가 사용한 모든 토큰을 추적하고 예산 한도를 적용하여 비용 초과를 방지합니다.

![회사 총계와 에이전트별, 프로젝트별 지출 분해가 함께 보이는 비용 화면](/img/screenshots/costs.png)

*비용 화면은 usage를 운영자 기준의 예산 뷰로 바꿔줍니다. 어떤 에이전트와 프로젝트에 지출이 집중되는지 비교할 때 사용합니다.*

## 비용 추적 작동 방식

각 에이전트의 heartbeat는 다음 정보와 함께 비용 이벤트를 보고합니다:

- **Provider** — 사용된 LLM 제공자 (Anthropic, OpenAI 등)
- **Model** — 사용된 모델
- **Input tokens** — 모델에 전송된 토큰
- **Output tokens** — 모델이 생성한 토큰
- **Cost in cents** — 호출의 달러 비용

이 데이터는 에이전트별, 월별로 집계됩니다 (UTC 기준 달력 월).

## 예산 설정

### 회사 예산

회사의 전체 월간 예산을 설정합니다:

```
PATCH /api/companies/{companyId}
{ "budgetMonthlyCents": 100000 }
```

### 에이전트별 예산

에이전트 설정 페이지 또는 API에서 개별 에이전트 예산을 설정합니다:

```
PATCH /api/agents/{agentId}
{ "budgetMonthlyCents": 5000 }
```

## 예산 적용

Baton은 자동으로 예산을 적용합니다:

| 임계값 | 조치 |
|-----------|--------|
| 80% | 소프트 알림 — 에이전트에게 중요한 태스크에만 집중하도록 경고 |
| 100% | 하드 중지 — 에이전트가 자동 일시 중지되며 heartbeat가 중단됨 |

자동 일시 중지된 에이전트는 예산을 늘리거나 다음 달력 월을 기다려서 재개할 수 있습니다.

## 비용 확인

### 대시보드

대시보드에는 회사 및 각 에이전트의 이번 달 지출 대비 예산이 표시됩니다.

### 비용 분석 API

```
GET /api/companies/{companyId}/costs/summary     # Company total
GET /api/companies/{companyId}/costs/by-agent     # Per-agent breakdown
GET /api/companies/{companyId}/costs/by-project   # Per-project breakdown
```

## 모범 사례

- 처음에는 보수적인 예산을 설정하고 결과를 확인하면서 늘리십시오
- 대시보드를 정기적으로 모니터링하여 예상치 못한 비용 급증을 확인하십시오
- 에이전트별 예산을 사용하여 단일 에이전트의 노출을 제한하십시오
- 핵심 에이전트(CEO, CTO)는 개별 기여자보다 높은 예산이 필요할 수 있습니다
