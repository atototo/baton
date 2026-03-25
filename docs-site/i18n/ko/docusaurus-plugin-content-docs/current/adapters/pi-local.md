---
title: Pi Local
description: Pi 로컬 adapter 설정 및 구성
---

`pi_local` adapter는 Pi coding agent를 로컬에서 실행합니다. provider/model 라우팅, 세션 재개, bundle 기반 instructions, Baton이 관리하는 프로젝트 컨텍스트 주입을 지원합니다.

## 사전 요구 사항

- Pi CLI 설치 (`pi` 명령 사용 가능)
- 설정된 Pi provider/model 환경

## 설정 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `cwd` | string | Yes | 에이전트 프로세스의 작업 디렉터리 (절대 경로; 권한이 허용되면 없을 경우 자동 생성) |
| `model` | string | Yes | `provider/model` 형식의 Pi 모델 ID |
| `instructionsFilePath` | string | No | Pi system prompt 뒤에 붙는 bundle entry file의 절대 경로 |
| `promptTemplate` | string | No | Pi에 전달되는 사용자 프롬프트 템플릿 |
| `thinking` | string | No | Thinking level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) |
| `command` | string | No | CLI 실행 파일 이름 (`pi` 기본값) |
| `env` | object | No | 환경 변수 (시크릿 참조 지원) |
| `timeoutSec` | number | No | 실행 타임아웃(초) |
| `graceSec` | number | No | 강제 종료 전 유예 시간 |

## 세션 지속성

Pi local은 Baton이 관리하는 세션을 저장하고 heartbeat 간에 `--session`으로 재개합니다.

## 도구 모델

Pi는 파일과 셸 작업을 위한 자체 로컬 도구 세트를 제공합니다. Baton은 실행을 오케스트레이션하고 로그, 상태, 사용량을 수집합니다.

## Instructions 와 프로젝트 컨텍스트

Pi local은 다음을 받습니다:

- `instructionsFilePath`를 통한 bundle entry file
- project conventions와 governance reminders에서 생성된 composed project instructions

이 구조로 재사용 가능한 역할 동작과 프로젝트별 컨텍스트를 분리할 수 있습니다.

## 환경 테스트

UI의 환경 테스트로 다음을 확인할 수 있습니다:

- Pi CLI 설치 여부
- 설정된 모델의 유효성
- 작업 디렉터리 사용 가능 여부
- CLI가 간단한 probe를 성공적으로 수행할 수 있는지
