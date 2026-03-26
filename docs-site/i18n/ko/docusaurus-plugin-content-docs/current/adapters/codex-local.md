---
title: Codex Local
description: OpenAI Codex 로컬 어댑터 설정 및 구성
---

`codex_local` 어댑터는 OpenAI의 Codex CLI를 로컬에서 실행합니다. `previous_response_id` 체이닝을 통한 세션 지속성과 글로벌 Codex 스킬 디렉터리를 통한 스킬 주입을 지원합니다.

## 사전 요구 사항

- Codex CLI 설치 (`codex` 명령 사용 가능)
- 환경 또는 에이전트 설정에 `OPENAI_API_KEY` 설정

## 설정 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `cwd` | string | Yes | 에이전트 프로세스의 작업 디렉터리 (절대 경로; 권한이 허용되면 없을 경우 자동 생성) |
| `model` | string | No | 사용할 모델 |
| `instructionsFilePath` | string | No | Baton이 프롬프트 앞에 붙이는 번들 진입 파일의 절대 경로 |
| `promptTemplate` | string | No | 모든 실행에 사용되는 프롬프트 |
| `env` | object | No | 환경 변수 (시크릿 참조 지원) |
| `timeoutSec` | number | No | 프로세스 타임아웃 (0 = 타임아웃 없음) |
| `graceSec` | number | No | 강제 종료 전 유예 기간 |
| `dangerouslyBypassApprovalsAndSandbox` | boolean | No | 안전 검사 건너뛰기 (개발 전용) |

## 세션 지속성

Codex는 세션 연속성을 위해 `previous_response_id`를 사용합니다. 어댑터는 하트비트 간에 이를 직렬화하고 복원하여 에이전트가 대화 컨텍스트를 유지할 수 있도록 합니다.

## 스킬 주입

어댑터는 Baton 스킬을 글로벌 Codex 스킬 디렉터리(`~/.codex/skills`)에 심볼릭 링크합니다. 기존 사용자 스킬은 덮어쓰지 않습니다.

## Instructions 와 프로젝트 컨텍스트

Codex local은 다음을 함께 받습니다:

- `instructionsFilePath`를 통해 전달되는 에이전트 번들 진입 파일
- 프로젝트 컨벤션에서 Baton이 생성한 조합 프로젝트 지시문

이 구조는 오래 유지되는 역할 지시문과 프로젝트별 컨텍스트를 분리하면서도 런타임에는 하나의 유효 프롬프트처럼 제공해 줍니다.

## 환경 테스트

환경 테스트는 다음을 확인합니다:

- Codex CLI가 설치되어 있고 접근 가능한지
- 작업 디렉터리가 절대 경로이며 사용 가능한지 (권한이 허용되면 없을 경우 자동 생성)
- 인증 신호 (`OPENAI_API_KEY` 존재 여부)
- CLI가 실제로 실행 가능한지 확인하기 위한 라이브 hello 프로브 (`codex exec --json -` 및 프롬프트 `Respond with hello.`)
