---
title: Cursor Local
description: Cursor CLI 로컬 adapter 설정 및 구성
---

`cursor` adapter는 Cursor Agent CLI를 로컬에서 실행합니다. 재개 가능한 세션, 스킬 주입, 구조화된 스트림 출력을 지원합니다.

## 사전 요구 사항

- Cursor CLI 설치 (`agent` 명령 사용 가능)
- 환경에서 필요하다면 동작하는 Cursor 계정/세션

## 설정 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `cwd` | string | Yes | 에이전트 프로세스의 작업 디렉터리 (절대 경로; 권한이 허용되면 없을 경우 자동 생성) |
| `model` | string | No | Cursor 모델 ID (`auto` 기본값) |
| `mode` | string | No | `--mode`로 전달되는 Cursor 실행 모드 (`plan` 또는 `ask`) |
| `instructionsFilePath` | string | No | Baton이 실행 프롬프트 앞에 붙이는 bundle entry file의 절대 경로 |
| `promptTemplate` | string | No | 모든 실행에 사용되는 프롬프트 |
| `command` | string | No | CLI 실행 파일 이름 (`agent` 기본값) |
| `extraArgs` | string[] | No | 추가 CLI 인자 |
| `env` | object | No | 환경 변수 |
| `timeoutSec` | number | No | 프로세스 타임아웃 |
| `graceSec` | number | No | 강제 종료 전 유예 기간 |

## 세션 지속성

Cursor는 저장된 세션의 cwd가 현재 cwd와 일치할 때 `--resume`으로 세션을 재개합니다.

## 스킬 주입

Baton은 누락된 경우 `~/.cursor/skills`에 로컬 스킬을 자동 주입하여 Cursor가 로컬 실행에서 Baton 스킬을 발견할 수 있게 합니다.

## Instructions 와 프로젝트 컨텍스트

Cursor local은 다음을 받습니다:

- `instructionsFilePath`를 통해 전달되는 에이전트 bundle entry file
- project conventions와 governance reminders에서 Baton이 생성한 composed project instructions

이 구조는 재사용 가능한 역할 동작과 프로젝트별 컨텍스트를 분리하면서도 하나의 유효한 런타임 프롬프트처럼 제공합니다.

## 실행 메모

Baton은 Cursor를 구조화된 stream output으로 실행하고 프롬프트를 stdin으로 전달합니다. 또한 `extraArgs`에 `--trust`, `--yolo`, `-f` 중 하나가 이미 없으면 `--yolo`를 자동 추가합니다.

## 환경 테스트

환경 테스트는 다음을 확인합니다:

- Cursor CLI가 설치되어 있고 접근 가능한지
- 작업 디렉터리가 절대 경로이며 사용 가능한지 (권한이 허용되면 없을 경우 자동 생성)
- Cursor가 필요로 한다면 인증 또는 로그인 상태가 가능한지
- CLI가 실제로 실행 가능한지 확인하기 위한 라이브 hello probe (`agent -p --output-format stream-json --verbose` 및 프롬프트 `Respond with hello.`)
