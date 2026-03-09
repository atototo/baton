---
title: 스토리지
description: 로컬 디스크 vs S3 호환 스토리지
---

Baton은 업로드된 파일(이슈 첨부 파일, 이미지)을 설정 가능한 스토리지 제공자를 사용하여 저장합니다.

## 로컬 디스크 (기본값)

파일은 다음 위치에 저장됩니다:

```
~/.baton/instances/default/data/storage
```

별도의 설정이 필요하지 않습니다. 로컬 개발 및 단일 머신 배포에 적합합니다.

## S3 호환 스토리지

프로덕션 또는 다중 노드 배포의 경우 S3 호환 오브젝트 스토리지(AWS S3, MinIO, Cloudflare R2 등)를 사용합니다.

CLI를 통해 설정합니다:

```sh
pnpm baton configure --section storage
```

## 설정

| 제공자 | 적합한 용도 |
|----------|----------|
| `local_disk` | 로컬 개발, 단일 머신 배포 |
| `s3` | 프로덕션, 다중 노드, 클라우드 배포 |

스토리지 설정은 인스턴스 설정 파일에 저장됩니다:

```
~/.baton/instances/default/config.json
```
