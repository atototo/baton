---
title: OpenCode Local
description: OpenCode 로컬 adapter 설정 및 구성
---

`opencode_local` adapter는 OpenCode를 로컬에서 실행합니다. provider/model 라우팅, 세션 재개, Baton의 prompt composition을 지원합니다.

## 사전 요구 사항

- OpenCode CLI 설치 (`opencode` 명령 사용 가능)
- 설정된 OpenCode provider/model 환경

## 설정 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `cwd` | string | Yes | 에이전트 프로세스의 작업 디렉터리 (절대 경로; 권한이 허용되면 없을 경우 자동 생성) |
| `model` | string | No | `provider/model` 형식의 OpenCode 모델 ID (`openai/gpt-5.2-codex` 기본값) |
| `variant` | string | No | `--variant`로 전달되는 provider별 reasoning/profile variant |
| `instructionsFilePath` | string | No | Baton이 실행 프롬프트 앞에 붙이는 bundle entry file의 절대 경로 |
| `promptTemplate` | string | No | 모든 실행에 사용되는 프롬프트 |
| `command` | string | No | CLI 실행 파일 이름 (`opencode` 기본값) |
| `extraArgs` | string[] | No | 추가 CLI 인자 |
| `env` | object | No | 환경 변수 |
| `timeoutSec` | number | No | 프로세스 타임아웃 |
| `graceSec` | number | No | 강제 종료 전 유예 기간 |

## 세션 지속성

OpenCode는 저장된 세션의 cwd가 현재 cwd와 일치할 때 `--session`으로 세션을 재개합니다.

## Instructions 와 프로젝트 컨텍스트

OpenCode local은 다음을 받습니다:

- `instructionsFilePath`를 통해 전달되는 에이전트 bundle entry file
- project conventions와 governance reminders에서 Baton이 생성한 composed project instructions

이 구조는 재사용 가능한 역할 동작과 프로젝트별 컨텍스트를 분리하면서도 하나의 유효한 런타임 프롬프트처럼 제공합니다.

## 환경 테스트

환경 테스트는 다음을 확인합니다:

- OpenCode CLI가 설치되어 있고 접근 가능한지
- 설정된 모델이 유효한지
- 작업 디렉터리가 절대 경로이며 사용 가능한지 (권한이 허용되면 없을 경우 자동 생성)
- CLI가 실제로 실행 가능한지 확인하기 위한 라이브 hello probe (`opencode run --format json ...` 및 프롬프트 `Respond with hello.`)
