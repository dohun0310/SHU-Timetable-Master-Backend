# SHU Timetable Master Backend

신한대학교 시간표 마법사가 사용하는 학기별 강좌 카탈로그 수집기와 읽기 전용 Express API입니다.

SAP 강좌 조회 페이지를 빌드 시점에 Playwright로 수집해 `generated/catalog.json`을 만들고, 운영 서버는 검증된 JSON을 메모리에 한 번 로드해 제공합니다. 서버 실행 중에는 SAP에 접근하지 않습니다.

## 요구 환경

- Node.js 24 이상
- Corepack 및 Yarn 4
- 로컬 수집 시 Playwright Chromium
- 컨테이너 실행 시 Docker

## 설치

```bash
corepack enable
yarn install --immutable
yarn playwright:install
cp .env.example .env
```

## 환경 변수

| 변수                   | 기본값                   | 설명                                  |
| ---------------------- | ------------------------ | ------------------------------------- |
| `TARGET_ACADEMIC_YEAR` | 없음                     | 수집 대상 학년도(2000 이상의 정수)    |
| `TARGET_SEMESTER`      | 없음                     | `FIRST`, `SECOND`, `SUMMER`, `WINTER` |
| `SAP_COURSE_URL`       | 없음                     | 신한대학교 SAP 강좌 조회 URL          |
| `PLAYWRIGHT_HEADLESS`  | `true`                   | `false`이면 브라우저 UI 표시          |
| `CATALOG_PATH`         | `generated/catalog.json` | 서버가 시작 시 읽을 카탈로그 경로     |
| `PORT`                 | `3000`                   | API 서버 포트                         |
| `CORS_ORIGIN`          | `*`                      | 허용할 프론트엔드 Origin              |

## 데이터 생성과 빌드

### 온라인 빌드

```bash
yarn build
```

다음 작업을 순서대로 수행합니다.

1. SAP에서 대상 학기의 강좌 전체 수집
2. 카탈로그 조립 및 Zod 검증
3. `generated/catalog.json` 원자적 저장
4. TypeScript 서버 빌드

수집 또는 검증에 실패하면 기존의 정상 `catalog.json`은 보존됩니다.

JSON만 다시 생성하려면 다음을 실행합니다.

```bash
yarn catalog:generate
```

### 오프라인 빌드

이미 정상적인 `generated/catalog.json`이 있을 때 SAP 수집 없이 서버만 빌드합니다.

```bash
yarn build:offline
```

## 로컬 서버 실행

```bash
yarn build:offline
yarn start
```

기본 주소는 `http://localhost:3000`입니다.

### API

| 메서드 | 경로            | 설명                           |
| ------ | --------------- | ------------------------------ |
| `GET`  | `/api/catalog`  | 전체 카탈로그 JSON             |
| `GET`  | `/catalog.json` | 동일 카탈로그의 정적 호환 경로 |
| `GET`  | `/api/health`   | 서버 및 로드된 강좌 수 확인    |

카탈로그 응답은 strong ETag와 `Cache-Control`을 제공하며 조건부 요청 시 `304 Not Modified`를 반환합니다.

## 품질 검사

```bash
yarn lint
yarn typecheck
yarn test
yarn format:check
```

## Docker

Docker 이미지 빌드 중에는 SAP 크롤링을 수행하지 않습니다. 호스트에서 카탈로그를 먼저 생성한 뒤 이미지에 포함합니다.

### 데이터 생성 후 이미지 빌드

```bash
yarn docker:build
```

`yarn docker:build`는 호스트에서 `catalog:generate`를 실행한 후 이미지를 빌드합니다.

이미 생성된 JSON을 사용하려면 다음을 실행합니다.

```bash
yarn docker:build:offline
```

### 컨테이너 실행

```bash
docker run --rm \
  --name shu-timetable-master-backend \
  -p 3000:3000 \
  -e CORS_ORIGIN=https://your-frontend.example.com \
  shu-timetable-master-backend
```

확인:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/catalog
```

이미지는 다단계 빌드를 사용하고 비 root `node` 사용자로 실행됩니다. Docker healthcheck는 `/api/health`를 확인합니다.

### 외부 카탈로그 마운트

이미지를 다시 만들지 않고 JSON만 교체하려면 읽기 전용으로 마운트할 수 있습니다.

```bash
docker run --rm \
  -p 3000:3000 \
  -v "$PWD/generated/catalog.json:/app/generated/catalog.json:ro" \
  shu-timetable-master-backend
```

JSON이 없거나 스키마에 맞지 않으면 서버는 명확한 오류와 함께 시작하지 않습니다.

## 데이터 갱신 절차

1. `.env`에서 대상 학년도와 학기를 변경합니다.
2. `yarn catalog:generate`를 실행합니다.
3. 생성된 JSON의 `meta.courseCount`와 표본 강좌를 확인합니다.
4. `yarn test && yarn build:offline`을 실행합니다.
5. Docker 운영 시 `yarn docker:build:offline`으로 이미지를 다시 빌드하고 교체합니다.

`generated/catalog.json`은 수집 결과물이므로 Git에서 제외됩니다.
