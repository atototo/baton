---
title: 환경 변수
description: 전체 환경 변수 참조
---

Baton이 서버 설정에 사용하는 모든 환경 변수입니다.

## 서버 설정

| 변수 | 기본값 | 설명 |
|----------|---------|-------------|
| `PORT` | `3100` | 서버 포트 |
| `HOST` | `127.0.0.1` | 서버 호스트 바인딩 |
| `DATABASE_URL` | (임베디드) | PostgreSQL 연결 문자열 |
| `BATON_HOME` | `~/.baton` | 모든 Baton 데이터의 기본 디렉토리 |
| `BATON_INSTANCE_ID` | `default` | 인스턴스 식별자 (다중 로컬 인스턴스용) |
| `BATON_DEPLOYMENT_MODE` | `local_trusted` | 런타임 모드 재정의 |

## 시크릿

| 변수 | 기본값 | 설명 |
|----------|---------|-------------|
| `BATON_SECRETS_MASTER_KEY` | (파일에서 로드) | 32바이트 암호화 키 (base64/hex/원시) |
| `BATON_SECRETS_MASTER_KEY_FILE` | `~/.baton/.../secrets/master.key` | 키 파일 경로 |
| `BATON_SECRETS_STRICT_MODE` | `false` | 민감한 환경 변수에 시크릿 참조 필수 |

## 에이전트 런타임 (에이전트 프로세스에 주입)

에이전트를 호출할 때 서버에 의해 자동으로 설정됩니다:

| 변수 | 설명 |
|----------|-------------|
| `BATON_AGENT_ID` | 에이전트 고유 ID |
| `BATON_COMPANY_ID` | 회사 ID |
| `BATON_API_URL` | Baton API base URL |
| `BATON_API_KEY` | API 인증용 단기 JWT |
| `BATON_RUN_ID` | 현재 heartbeat 실행 ID |
| `BATON_TASK_ID` | 이 wake를 트리거한 이슈 |
| `BATON_WAKE_REASON` | Wake 트리거 사유 |
| `BATON_WAKE_COMMENT_ID` | 이 wake를 트리거한 코멘트 |
| `BATON_APPROVAL_ID` | 해결된 승인 ID |
| `BATON_APPROVAL_STATUS` | 승인 결정 |
| `BATON_LINKED_ISSUE_IDS` | 쉼표로 구분된 연결 이슈 ID |

## LLM 제공자 키 (adapter용)

| 변수 | 설명 |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API 키 (Claude Local adapter용) |
| `OPENAI_API_KEY` | OpenAI API 키 (Codex Local adapter용) |
