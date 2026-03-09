---
title: Skill 작성하기
description: SKILL.md 형식 및 모범 사례
---

Skill은 에이전트가 heartbeat 동안 호출할 수 있는 재사용 가능한 지침입니다. 에이전트에게 특정 태스크를 수행하는 방법을 알려주는 마크다운 파일입니다.

## Skill 구조

Skill은 YAML frontmatter가 포함된 `SKILL.md` 파일을 가진 디렉토리입니다:

```
skills/
└── my-skill/
    ├── SKILL.md          # Main skill document
    └── references/       # Optional supporting files
        └── examples.md
```

## SKILL.md 형식

```markdown
---
name: my-skill
description: >
  Short description of what this skill does and when to use it.
  This acts as routing logic — the agent reads this to decide
  whether to load the full skill content.
---

# My Skill

Detailed instructions for the agent...
```

### Frontmatter 필드

- **name** — skill의 고유 식별자 (kebab-case)
- **description** — 에이전트에게 이 skill을 언제 사용할지 알려주는 라우팅 설명. 마케팅 문구가 아닌 결정 로직으로 작성합니다.

## 런타임에서 Skill이 작동하는 방식

1. 에이전트가 컨텍스트에서 skill 메타데이터(name + description)를 확인합니다
2. 에이전트가 현재 태스크에 해당 skill이 관련 있는지 판단합니다
3. 관련이 있으면 에이전트가 전체 SKILL.md 내용을 로드합니다
4. 에이전트가 skill의 지침을 따릅니다

이를 통해 기본 프롬프트를 작게 유지할 수 있습니다 — 전체 skill 내용은 필요할 때만 로드됩니다.

## 모범 사례

- **설명을 라우팅 로직으로 작성하십시오** — "사용해야 할 때"와 "사용하지 말아야 할 때"에 대한 안내를 포함합니다
- **구체적이고 실행 가능하게 작성하십시오** — 에이전트가 모호함 없이 skill을 따를 수 있어야 합니다
- **코드 예제를 포함하십시오** — 구체적인 API 호출과 명령어 예제가 산문보다 더 신뢰할 수 있습니다
- **Skill을 집중적으로 유지하십시오** — 하나의 skill에 하나의 관심사만 다룹니다; 관련 없는 절차를 결합하지 마십시오
- **참조 파일을 절제하여 사용하십시오** — 메인 SKILL.md를 비대하게 만들지 말고 보조 세부사항은 `references/`에 배치합니다

## Skill 주입

Adapter는 에이전트 런타임에서 skill을 검색 가능하게 만드는 역할을 담당합니다. `claude_local` adapter는 심볼릭 링크와 `--add-dir`을 사용하는 임시 디렉토리를 활용합니다. `codex_local` adapter는 글로벌 skills 디렉토리를 사용합니다. 자세한 내용은 [Adapter 생성하기](/adapters/creating-an-adapter) 가이드를 참조하십시오.
