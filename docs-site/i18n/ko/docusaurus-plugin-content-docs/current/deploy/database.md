---
title: 데이터베이스
description: 임베디드 PGlite vs Docker Postgres vs 호스팅
---

Baton은 Drizzle ORM을 통해 PostgreSQL을 사용합니다. 데이터베이스를 실행하는 세 가지 방법이 있습니다.

## 1. 임베디드 PostgreSQL (기본값)

설정이 필요 없습니다. `DATABASE_URL`을 설정하지 않으면 서버가 자동으로 임베디드 PostgreSQL 인스턴스를 시작합니다.

```sh
pnpm dev
```

최초 시작 시 서버는:

1. 스토리지용 `~/.baton/instances/default/db/` 디렉토리를 생성합니다
2. `baton` 데이터베이스가 존재하는지 확인합니다
3. 마이그레이션을 자동으로 실행합니다
4. 요청 처리를 시작합니다

데이터는 재시작 후에도 유지됩니다. 초기화하려면: `rm -rf ~/.baton/instances/default/db`.

Docker 빠른 시작도 기본적으로 임베디드 PostgreSQL을 사용합니다.

## 2. 로컬 PostgreSQL (Docker)

로컬에서 전체 PostgreSQL 서버를 사용하려면:

```sh
docker compose up -d
```

이 명령은 `localhost:5432`에서 PostgreSQL 17을 시작합니다. 연결 문자열을 설정합니다:

```sh
cp .env.example .env
# DATABASE_URL=postgres://baton:baton@localhost:5432/baton
```

스키마를 푸시합니다:

```sh
DATABASE_URL=postgres://baton:baton@localhost:5432/baton \
  npx drizzle-kit push
```

## 3. 호스팅 PostgreSQL (Supabase)

프로덕션 환경에서는 [Supabase](https://supabase.com/)와 같은 호스팅 제공자를 사용합니다.

1. [database.new](https://database.new)에서 프로젝트를 생성합니다
2. Project Settings > Database에서 연결 문자열을 복사합니다
3. `.env` 파일에 `DATABASE_URL`을 설정합니다

마이그레이션에는 **직접 연결** (포트 5432)을, 애플리케이션에는 **풀링 연결** (포트 6543)을 사용합니다.

커넥션 풀링을 사용하는 경우 prepared statement를 비활성화합니다:

```ts
// packages/db/src/client.ts
export function createDb(url: string) {
  const sql = postgres(url, { prepare: false });
  return drizzlePg(sql, { schema });
}
```

## 모드 간 전환

| `DATABASE_URL` | 모드 |
|----------------|------|
| 설정하지 않음 | 임베디드 PostgreSQL |
| `postgres://...localhost...` | 로컬 Docker PostgreSQL |
| `postgres://...supabase.com...` | 호스팅 Supabase |

Drizzle 스키마(`packages/db/src/schema/`)는 모드에 관계없이 동일합니다.
