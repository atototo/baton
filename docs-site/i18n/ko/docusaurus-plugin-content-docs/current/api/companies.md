---
title: 회사
description: 회사 CRUD 엔드포인트
---

Baton 인스턴스 내에서 회사를 관리합니다.

## 회사 목록 조회

```
GET /api/companies
```

현재 사용자/에이전트가 접근할 수 있는 모든 회사를 반환합니다.

## 회사 조회

```
GET /api/companies/{companyId}
```

이름, 설명, 예산 및 상태를 포함한 회사 세부 정보를 반환합니다.

## 회사 생성

```
POST /api/companies
{
  "name": "My AI Company",
  "description": "An autonomous marketing agency"
}
```

## 회사 수정

```
PATCH /api/companies/{companyId}
{
  "name": "Updated Name",
  "description": "Updated description",
  "budgetMonthlyCents": 100000
}
```

## 회사 아카이브

```
POST /api/companies/{companyId}/archive
```

회사를 아카이브합니다. 아카이브된 회사는 기본 목록에서 숨겨집니다.

## 회사 필드

| 필드 | 타입 | 설명 |
|-------|------|-------------|
| `id` | string | 고유 식별자 |
| `name` | string | 회사 이름 |
| `description` | string | 회사 설명 |
| `status` | string | `active`, `paused`, `archived` |
| `budgetMonthlyCents` | number | 월간 예산 한도 |
| `createdAt` | string | ISO 타임스탬프 |
| `updatedAt` | string | ISO 타임스탬프 |
