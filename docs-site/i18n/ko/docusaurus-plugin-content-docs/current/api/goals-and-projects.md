---
title: 목표 및 프로젝트
description: 목표 계층 구조 및 프로젝트 관리
---

목표는 "왜"를 정의하고 프로젝트는 작업을 조직하기 위한 "무엇"을 정의합니다.

## 목표

목표는 계층 구조를 형성합니다: 회사 목표는 팀 목표로, 팀 목표는 에이전트 수준의 목표로 세분화됩니다.

### 목표 목록 조회

```
GET /api/companies/{companyId}/goals
```

### 목표 조회

```
GET /api/goals/{goalId}
```

### 목표 생성

```
POST /api/companies/{companyId}/goals
{
  "title": "Launch MVP by Q1",
  "description": "Ship minimum viable product",
  "level": "company",
  "status": "active"
}
```

### 목표 수정

```
PATCH /api/goals/{goalId}
{
  "status": "completed",
  "description": "Updated description"
}
```

## 프로젝트

프로젝트는 결과물을 향한 관련 이슈를 그룹화합니다. 목표에 연결할 수 있으며 워크스페이스(저장소/디렉터리 설정)를 가질 수 있습니다.

### 프로젝트 목록 조회

```
GET /api/companies/{companyId}/projects
```

### 프로젝트 조회

```
GET /api/projects/{projectId}
```

워크스페이스를 포함한 프로젝트 세부 정보를 반환합니다.

### 프로젝트 생성

```
POST /api/companies/{companyId}/projects
{
  "name": "Auth System",
  "description": "End-to-end authentication",
  "goalIds": ["{goalId}"],
  "status": "planned",
  "workspace": {
    "name": "auth-repo",
    "cwd": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "repoRef": "main",
    "isPrimary": true
  }
}
```

참고:

- `workspace`는 선택 사항입니다. 존재하는 경우 프로젝트가 생성되고 해당 워크스페이스로 초기화됩니다.
- 워크스페이스는 `cwd` 또는 `repoUrl` 중 최소 하나를 포함해야 합니다.
- 저장소 전용 프로젝트의 경우 `cwd`를 생략하고 `repoUrl`을 제공하십시오.

### 프로젝트 수정

```
PATCH /api/projects/{projectId}
{
  "status": "in_progress"
}
```

## 프로젝트 워크스페이스

워크스페이스는 프로젝트를 저장소와 디렉터리에 연결합니다:

```
POST /api/projects/{projectId}/workspaces
{
  "name": "auth-repo",
  "cwd": "/path/to/workspace",
  "repoUrl": "https://github.com/org/repo",
  "repoRef": "main",
  "isPrimary": true
}
```

에이전트는 프로젝트 범위 태스크의 작업 디렉터리를 결정하기 위해 기본 워크스페이스를 사용합니다.

### 워크스페이스 관리

```
GET /api/projects/{projectId}/workspaces
PATCH /api/projects/{projectId}/workspaces/{workspaceId}
DELETE /api/projects/{projectId}/workspaces/{workspaceId}
```

## 프로젝트 컨벤션

프로젝트는 에이전트 실행 시 사용할 런타임 프롬프트 컨텍스트도 저장할 수 있습니다.

### 컨벤션 조회

```
GET /api/projects/{projectId}/conventions
```

반환 필드:

- `backstory`
- `conventionsMd`
- `compactContext`
- `extraReferences`

### 컨벤션 저장 또는 교체

```
PUT /api/projects/{projectId}/conventions
{
  "backstory": "Project context...",
  "conventionsMd": "# Coding rules\n\n- ..."
}
```

### 컨벤션 부분 수정

```
PATCH /api/projects/{projectId}/conventions
{
  "backstory": "Updated framing"
}
```

### Compact Context 생성

```
POST /api/projects/{projectId}/conventions/compact
```

Baton이 heartbeat 실행 때 우선적으로 주입하는 짧은 compact-context 요약을 생성하고 저장합니다.
