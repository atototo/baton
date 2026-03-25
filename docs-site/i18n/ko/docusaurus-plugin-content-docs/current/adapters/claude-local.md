---
title: Claude Local
description: Claude Code 로컬 adapter 설정 및 구성
---

`claude_local` adapter는 Anthropic의 Claude Code CLI를 로컬에서 실행합니다. 세션 지속성, 스킬 주입, 구조화된 출력 파싱을 지원합니다.

## 사전 요구 사항

- Claude Code CLI 설치 (`claude` 명령 사용 가능)
- 환경 또는 에이전트 설정에 `ANTHROPIC_API_KEY` 설정

## 설정 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `cwd` | string | Yes | 에이전트 프로세스의 작업 디렉터리 (절대 경로; 권한이 허용되면 없을 경우 자동 생성) |
| `model` | string | No | 사용할 Claude 모델 (예: `claude-opus-4-6`) |
| `instructionsFilePath` | string | No | Baton이 Claude에 전달하는 bundle entry file의 절대 경로 |
| `promptTemplate` | string | No | 모든 실행에 사용되는 프롬프트 |
| `env` | object | No | 환경 변수 (시크릿 참조 지원) |
| `timeoutSec` | number | No | 프로세스 타임아웃 (0 = 타임아웃 없음) |
| `graceSec` | number | No | 강제 종료 전 유예 기간 |
| `maxTurnsPerRun` | number | No | heartbeat당 최대 에이전트 턴 수 |
| `dangerouslySkipPermissions` | boolean | No | 권한 프롬프트 건너뛰기 (개발 전용) |

## 프롬프트 템플릿

템플릿은 `{{variable}}` 치환을 지원합니다:

| 변수 | 값 |
|------|-----|
| `{{agentId}}` | 에이전트 ID |
| `{{companyId}}` | 회사 ID |
| `{{runId}}` | 현재 실행 ID |
| `{{agent.name}}` | 에이전트 이름 |
| `{{company.name}}` | 회사 이름 |

## 세션 지속성

adapter는 heartbeat 간에 Claude Code 세션 ID를 유지합니다. 다음 깨어남 시 기존 대화를 재개하여 에이전트가 전체 컨텍스트를 유지할 수 있습니다.

세션 재개는 cwd를 인식합니다: 마지막 실행 이후 에이전트의 작업 디렉터리가 변경된 경우 새 세션이 시작됩니다.

알 수 없는 세션 오류로 재개에 실패하면 adapter가 자동으로 새 세션으로 재시도합니다.

## Instructions 와 프로젝트 컨텍스트

Claude local은 Baton에서 온 두 개의 프롬프트 레이어를 지원합니다:

- `instructionsFilePath`를 통한 에이전트 instructions bundle entry file
- project conventions와 governance reminders에서 생성된 composed project instructions

이 구조로 역할별 지시문은 bundle에 유지하고, 프로젝트 컨텍스트는 별도로 주입할 수 있습니다.

## 스킬 주입

adapter는 Baton 스킬에 대한 심볼릭 링크가 포함된 임시 디렉터리를 생성하고 `--add-dir`을 통해 전달합니다. 이를 통해 에이전트의 작업 디렉터리를 오염시키지 않고 스킬을 검색할 수 있습니다.

## 환경 테스트

UI의 "Test Environment" 버튼을 사용하여 adapter 설정을 검증할 수 있습니다. 다음을 확인합니다:

- Claude CLI가 설치되어 있고 접근 가능한지
- 작업 디렉터리가 절대 경로이며 사용 가능한지 (권한이 허용되면 없을 경우 자동 생성)
- API 키/인증 모드 힌트 (`ANTHROPIC_API_KEY` vs 구독 로그인)
- CLI 준비 상태를 확인하기 위한 라이브 hello 프로브 (`claude --print - --output-format stream-json --verbose` 및 프롬프트 `Respond with hello.`)
