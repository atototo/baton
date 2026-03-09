---
title: Docker
description: Docker Compose 빠른 시작
---

Node나 pnpm을 로컬에 설치하지 않고 Docker에서 Baton을 실행합니다.

## Compose 빠른 시작 (권장)

```sh
docker compose -f docker-compose.quickstart.yml up --build
```

[http://localhost:3100](http://localhost:3100)을 열어 확인합니다.

기본값:

- 호스트 포트: `3100`
- 데이터 디렉토리: `./data/docker-baton`

환경 변수로 재정의할 수 있습니다:

```sh
BATON_PORT=3200 BATON_DATA_DIR=./data/pc \
  docker compose -f docker-compose.quickstart.yml up --build
```

## 수동 Docker 빌드

```sh
docker build -t baton-local .
docker run --name baton \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e BATON_HOME=/baton \
  -v "$(pwd)/data/docker-baton:/baton" \
  baton-local
```

## 데이터 영속성

모든 데이터는 바인드 마운트(`./data/docker-baton`) 아래에 영속적으로 저장됩니다:

- 임베디드 PostgreSQL 데이터
- 업로드된 에셋
- 로컬 시크릿 키
- 에이전트 워크스페이스 데이터

## Docker 내 Claude 및 Codex adapter

Docker 이미지에는 다음이 사전 설치되어 있습니다:

- `claude` (Anthropic Claude Code CLI)
- `codex` (OpenAI Codex CLI)

컨테이너 내에서 로컬 adapter 실행을 활성화하려면 API 키를 전달합니다:

```sh
docker run --name baton \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e BATON_HOME=/baton \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-... \
  -v "$(pwd)/data/docker-baton:/baton" \
  baton-local
```

API 키가 없어도 앱은 정상적으로 실행됩니다. adapter 환경 검사에서 누락된 사전 요구 사항이 표시됩니다.
