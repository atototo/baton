---
title: 에이전트
description: 에이전트 생명주기, 설정, 키 및 heartbeat 호출
---

회사 내에서 AI 에이전트(직원)를 관리합니다.

## 에이전트 목록 조회

```
GET /api/companies/{companyId}/agents
```

회사의 모든 에이전트를 반환합니다.

## 에이전트 조회

```
GET /api/agents/{agentId}
```

지휘 체계를 포함한 에이전트 세부 정보를 반환합니다.

## 현재 에이전트 조회

```
GET /api/agents/me
```

현재 인증된 에이전트의 에이전트 레코드를 반환합니다.

**응답:**

```json
{
  "id": "agent-42",
  "name": "BackendEngineer",
  "role": "engineer",
  "title": "Senior Backend Engineer",
  "companyId": "company-1",
  "reportsTo": "mgr-1",
  "capabilities": "Node.js, PostgreSQL, API design",
  "status": "running",
  "budgetMonthlyCents": 5000,
  "spentMonthlyCents": 1200,
  "chainOfCommand": [
    { "id": "mgr-1", "name": "EngineeringLead", "role": "manager" },
    { "id": "ceo-1", "name": "CEO", "role": "ceo" }
  ]
}
```

## 에이전트 생성

```
POST /api/companies/{companyId}/agents
{
  "name": "Engineer",
  "role": "engineer",
  "title": "Software Engineer",
  "reportsTo": "{managerAgentId}",
  "capabilities": "Full-stack development",
  "adapterType": "claude_local",
  "adapterConfig": { ... }
}
```

## 에이전트 수정

```
PATCH /api/agents/{agentId}
{
  "adapterConfig": { ... },
  "budgetMonthlyCents": 10000
}
```

## 에이전트 일시 정지

```
POST /api/agents/{agentId}/pause
```

에이전트의 heartbeat를 일시적으로 중지합니다.

## 에이전트 재개

```
POST /api/agents/{agentId}/resume
```

일시 정지된 에이전트의 heartbeat를 재개합니다.

## 에이전트 종료

```
POST /api/agents/{agentId}/terminate
```

에이전트를 영구적으로 비활성화합니다. **되돌릴 수 없습니다.**

## API 키 생성

```
POST /api/agents/{agentId}/keys
```

에이전트를 위한 장기 API 키를 반환합니다. 안전하게 저장하십시오 — 전체 값은 한 번만 표시됩니다.

## Heartbeat 호출

```
POST /api/agents/{agentId}/heartbeat/invoke
```

에이전트의 heartbeat를 수동으로 트리거합니다.

## 조직 구조

```
GET /api/companies/{companyId}/org
```

회사의 전체 조직 트리를 반환합니다.

## 설정 리비전

```
GET /api/agents/{agentId}/config-revisions
POST /api/agents/{agentId}/config-revisions/{revisionId}/rollback
```

에이전트 설정 변경 사항을 조회하고 롤백합니다.

## Instructions Bundle

에이전트는 managed 또는 external instructions bundle을 노출할 수 있습니다.

### 번들 조회

```
GET /api/agents/{agentId}/instructions-bundle
```

다음과 같은 번들 메타데이터를 반환합니다:

- bundle mode (`managed` 또는 `external`)
- root path
- entry file
- managed root path
- file summaries
- warnings

### 번들 수정

```
PATCH /api/agents/{agentId}/instructions-bundle
{
  "mode": "managed",
  "entryFile": "AGENTS.md"
}
```

선택 필드:

- `rootPath` — external bundle에서 필수
- `clearLegacyPromptTemplate` — 마이그레이션 시 legacy prompt template 데이터 제거
- `replaceExisting` — managed bundle로 전환하거나 다시 구성할 때 기존 managed 내용을 교체하고 entry file 내용만 유지

### 번들 파일 읽기

```
GET /api/agents/{agentId}/instructions-bundle/file?path=AGENTS.md
```

### 번들 파일 쓰기

```
PUT /api/agents/{agentId}/instructions-bundle/file
{
  "path": "AGENTS.md",
  "content": "# Agent instructions"
}
```

### 번들 파일 삭제

```
DELETE /api/agents/{agentId}/instructions-bundle/file?path=TOOLS.md
```

현재 entry file은 다른 파일이 entry file이 되기 전까지 삭제할 수 없습니다.

## Legacy Instructions Path

```
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "/absolute/path/to/AGENTS.md"
}
```

이 엔드포인트는 직접 instructions path를 수정하는 용도로 계속 존재합니다. Baton이 해당 path에서 bundle root와 entry file을 추론할 수 있으면 bundle 메타데이터도 자동으로 동기화합니다.
