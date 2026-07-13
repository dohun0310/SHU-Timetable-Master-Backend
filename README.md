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

| 메서드 | 경로                       | 설명                        |
| ------ | -------------------------- | --------------------------- |
| `GET`  | `/api/courses`             | 강좌 검색·필터·페이지네이션 |
| `GET`  | `/api/courses/:id`         | 강좌 단건 조회              |
| `GET`  | `/api/meta`                | 학기 정보와 필터 목록       |
| `POST` | `/api/timetables/generate` | 시간표 조합 자동 생성       |
| `GET`  | `/api/health`              | 서버 및 로드된 강좌 수 확인 |

조회 응답은 strong ETag와 `Cache-Control`을 제공하며 조건부 요청 시 `304 Not Modified`를 반환합니다.

#### `GET /api/courses`

| Query        | 예시               | 설명                                                |
| ------------ | ------------------ | --------------------------------------------------- |
| `q`          | `자료구조`         | 강좌명·과목코드·교수 부분 일치 (공백·대소문자 무시) |
| `category`   | `MAJOR,TEACHING`   | 강좌 분류                                           |
| `department` | `소프트웨어학과`   | 학과                                                |
| `major`      | `소프트웨어학과`   | 전공                                                |
| `professor`  | `홍길동`           | 교수                                                |
| `day`        | `MONDAY,WEDNESDAY` | 해당 요일에 수업이 있는 강좌                        |
| `startAfter` | `10:00`            | 모든 수업이 이 시각 이후에 시작                     |
| `endBefore`  | `18:00`            | 모든 수업이 이 시각 이전에 종료                     |
| `minCredits` | `3`                | 최소 학점                                           |
| `maxCredits` | `3`                | 최대 학점                                           |
| `page`       | `2`                | 페이지 번호, 1부터 시작 (기본 `1`)                  |
| `size`       | `50`               | 페이지 크기, 최대 `100` (기본 `20`)                 |
| `sort`       | `credits`          | `name` 또는 `credits` (기본 `name`)                 |

같은 필터에 값을 여러 개 주면 OR로, 서로 다른 필터는 AND로 묶입니다. 값이 여러 개일 때는 `?day=MONDAY,TUESDAY`와 `?day=MONDAY&day=TUESDAY`를 모두 지원합니다.

강의시간이 없는 강좌는 `day` 필터에서는 제외되지만, `startAfter`·`endBefore`에서는 어떤 시간대와도 부딪히지 않으므로 남습니다.

```bash
curl "http://localhost:3000/api/courses?q=자료구조&day=MONDAY&size=5"
```

```json
{
  "page": 1,
  "size": 5,
  "total": 2,
  "totalPages": 1,
  "courses": [{ "id": "…", "name": "자료구조", "schedule": { "meetings": [] } }]
}
```

잘못된 query는 `400`과 함께 어떤 값이 틀렸는지 알려줍니다.

```json
{
  "error": {
    "message": "잘못된 검색 조건입니다.",
    "details": [{ "field": "size", "message": "Too big: expected number to be <=100" }]
  }
}
```

#### `POST /api/timetables/generate`

듣고 싶은 과목을 **바구니(basket)** 단위로 담아 보내면, 각 바구니에서 강좌를 하나씩 골라 시간이 겹치지 않으면서 제약을 만족하는 시간표 조합을 만들어 돌려줍니다.

바구니 하나가 "듣고 싶은 과목 하나"입니다. 같은 과목의 여러 분반을 한 바구니에 담으면 그중 하나만 시간표에 들어갑니다. `required`가 `false`인 바구니는 비워질 수 있습니다.

```bash
curl -X POST http://localhost:3000/api/timetables/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "baskets": [
      { "label": "자료구조", "courseIds": ["…-001", "…-002"] },
      { "label": "교양", "required": false, "courseIds": ["…", "…"] }
    ],
    "constraints": {
      "freeDays": ["FRIDAY"],
      "avoidBefore": "10:00",
      "avoidAfter": "18:00",
      "credits": { "min": 15, "max": 18 }
    },
    "limit": 20
  }'
```

| 필드                      | 기본값 | 설명                                       |
| ------------------------- | ------ | ------------------------------------------ |
| `baskets`                 | 필수   | 최대 20개. 바구니마다 강좌 후보 최대 100개 |
| `baskets[].required`      | `true` | `false`면 이 바구니는 비워질 수 있음       |
| `constraints.freeDays`    | 없음   | 이 요일에는 수업이 하나도 없어야 함        |
| `constraints.avoidBefore` | 없음   | 모든 수업이 이 시각 이후에 시작            |
| `constraints.avoidAfter`  | 없음   | 모든 수업이 이 시각 이전에 종료            |
| `constraints.credits`     | 없음   | 총 학점의 `min`·`max`                      |
| `limit`                   | `20`   | 돌려줄 시간표 최대 개수, 최대 `100`        |

```json
{
  "count": 7,
  "truncated": false,
  "timetables": [
    {
      "courses": [{ "id": "…", "name": "자료구조" }],
      "totalCredits": 17,
      "days": ["MONDAY", "WEDNESDAY"],
      "freeDays": ["TUESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
    }
  ]
}
```

후보가 많아 조합이 폭발하면 탐색을 중간에 끊고 `truncated`를 `true`로 알립니다. 이때 `count`개는 유효한 시간표이지만 더 있을 수 있습니다.

충돌 판정은 **교시**를 기준으로 합니다. 강의시간이 없는 강좌(사이버 강의 등)는 어떤 강좌와도 겹치지 않으므로 항상 조합에 들어갑니다.

강의시간을 온전히 알 수 없는 강좌(`PARTIALLY_PARSED`·`UNPARSED`)는 충돌을 판정할 수 없으므로 `400`으로 거부합니다. 잘못된 시간표를 조용히 만들어 주지 않기 위함입니다.

```json
{
  "error": {
    "message": "강의시간을 온전히 알 수 없어 시간표를 만들 수 없는 강좌가 있습니다: 드론프로젝트실습-캡스톤디자인",
    "details": [{ "id": "…", "name": "드론프로젝트실습-캡스톤디자인" }]
  }
}
```

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
curl "http://localhost:3000/api/courses?size=1"
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
