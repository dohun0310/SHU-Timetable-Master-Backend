import request from "supertest";
import { describe, expect, it } from "vitest";

import { catalogSchema, type Course } from "../../src/domain/schemas/catalog-schema.js";
import { createApp } from "../../src/server/app.js";

const course = (overrides: Partial<Course> = {}): Course => ({
  id: "2026-second-sw1001-001-소프트웨어학과",
  academicYear: 2026,
  semester: "SECOND",
  category: "MAJOR",
  categoryLabel: "학과/전공",
  department: { id: "소프트웨어학과", name: "소프트웨어학과" },
  major: { id: "소프트웨어학과", name: "소프트웨어학과" },
  courseCode: "SW1001",
  classNumber: "001",
  name: "자료구조",
  professor: "홍길동",
  credits: 3,
  hours: 3,
  schedule: {
    raw: "월 1교시 09:00-09:50",
    parseStatus: "PARSED",
    meetings: [
      {
        day: "MONDAY",
        dayLabel: "월",
        startPeriod: 1,
        endPeriod: 3,
        startTime: "09:00",
        endTime: "11:50",
        location: "은혜관-2220",
      },
    ],
  },
  source: { tab: "학과/전공", collectedAt: "2026-07-12T00:00:00.000Z" },
  ...overrides,
});

const courses = [
  course(),
  course({
    id: "2026-second-ge70011-001-리나시타교양대학",
    category: "CORE_LIBERAL_ARTS",
    categoryLabel: "핵심교양",
    department: { id: "리나시타교양대학", name: "리나시타교양대학" },
    major: { id: "리나시타교양대학", name: "리나시타교양대학" },
    courseCode: "GE70011",
    name: "영어회화",
    professor: "김영희",
    credits: 2,
    hours: 2,
    schedule: {
      raw: "화 7교시 15:00-15:50",
      parseStatus: "PARSED",
      meetings: [
        {
          day: "TUESDAY",
          dayLabel: "화",
          startPeriod: 7,
          endPeriod: 8,
          startTime: "15:00",
          endTime: "16:50",
          location: null,
        },
      ],
    },
  }),
  course({
    id: "2026-second-ge61002-001-리나시타교양대학",
    category: "BASIC_LIBERAL_ARTS",
    categoryLabel: "기초교양",
    department: { id: "리나시타교양대학", name: "리나시타교양대학" },
    major: { id: "리나시타교양대학", name: "리나시타교양대학" },
    courseCode: "GE61002",
    name: "기독교의 이해",
    professor: "강성현",
    credits: 1,
    hours: 1,
    schedule: { raw: "", parseStatus: "NO_SCHEDULE", meetings: [] },
  }),
];

const catalog = catalogSchema.parse({
  meta: {
    academicYear: 2026,
    semester: "SECOND",
    generatedAt: "2026-07-12T00:00:00.000Z",
    source: "https://example.com/sap",
    courseCount: courses.length,
  },
  filters: {
    categories: [{ id: "MAJOR", label: "학과/전공", count: 1 }],
    departments: [{ id: "소프트웨어학과", label: "소프트웨어학과", count: 1 }],
    majors: [],
    professors: [{ id: "홍길동", label: "홍길동", count: 1 }],
    days: [{ id: "MONDAY", label: "월", count: 1 }],
  },
  courses,
});

const app = createApp({ catalog, corsOrigin: "https://timetable.example.com" });

describe("GET /api/courses", () => {
  it("returns a page of courses instead of the whole catalog", async () => {
    const response = await request(app).get("/api/courses").expect(200);

    expect(response.body).toMatchObject({ page: 1, size: 20, total: 3, totalPages: 1 });
    expect(response.body.courses).toHaveLength(3);
  });

  it("searches by keyword", async () => {
    const response = await request(app).get("/api/courses?q=자료구조").expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.courses[0].name).toBe("자료구조");
  });

  it("accepts a comma separated filter as multiple values", async () => {
    const response = await request(app)
      .get("/api/courses?category=CORE_LIBERAL_ARTS,BASIC_LIBERAL_ARTS")
      .expect(200);

    expect(response.body.total).toBe(2);
  });

  it("accepts a repeated filter as multiple values", async () => {
    const response = await request(app)
      .get("/api/courses?category=CORE_LIBERAL_ARTS&category=BASIC_LIBERAL_ARTS")
      .expect(200);

    expect(response.body.total).toBe(2);
  });

  it("filters by day and by time window", async () => {
    await request(app)
      .get("/api/courses?day=TUESDAY")
      .expect(200)
      .expect(({ body }) => expect(body.courses[0].name).toBe("영어회화"));

    await request(app)
      .get("/api/courses?endBefore=12:00")
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(2));
  });

  it("paginates", async () => {
    const response = await request(app).get("/api/courses?page=2&size=2").expect(200);

    expect(response.body).toMatchObject({ page: 2, size: 2, total: 3, totalPages: 2 });
    expect(response.body.courses).toHaveLength(1);
  });

  it("rejects an unknown category with 400", async () => {
    const response = await request(app).get("/api/courses?category=WRONG").expect(400);

    expect(response.body.error.message).toBeTruthy();
    expect(JSON.stringify(response.body.error)).toContain("category");
  });

  it("rejects a page size above the limit with 400", async () => {
    await request(app).get("/api/courses?size=101").expect(400);
  });

  it("rejects a non numeric page with 400", async () => {
    await request(app).get("/api/courses?page=abc").expect(400);
  });

  it("rejects a malformed time with 400", async () => {
    await request(app).get("/api/courses?startAfter=9시").expect(400);
  });

  it("caches responses and answers conditional requests", async () => {
    const first = await request(app).get("/api/courses").expect(200);

    expect(first.headers["cache-control"]).toContain("max-age=300");
    expect(first.headers.etag).toBeTruthy();

    await request(app)
      .get("/api/courses")
      .set("If-None-Match", first.headers.etag ?? "")
      .expect(304);
  });
});

describe("GET /api/courses/:id", () => {
  it("returns one course", async () => {
    const response = await request(app)
      .get("/api/courses/2026-second-ge70011-001-리나시타교양대학")
      .expect(200);

    expect(response.body).toMatchObject({ name: "영어회화", professor: "김영희" });
  });

  it("returns 404 for an unknown course", async () => {
    const response = await request(app).get("/api/courses/없는-강좌").expect(404);

    expect(response.body.error.message).toBeTruthy();
  });
});

describe("GET /api/meta", () => {
  it("serves the semester and the filter lists without any course", async () => {
    const response = await request(app).get("/api/meta").expect(200);

    expect(response.body.meta).toMatchObject({
      academicYear: 2026,
      semester: "SECOND",
      courseCount: 3,
    });
    expect(response.body.filters.days).toEqual([{ id: "MONDAY", label: "월", count: 1 }]);
    expect(response.body).not.toHaveProperty("courses");
  });
});

describe("GET /api/health", () => {
  it("reports health without caching", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.body).toEqual({ status: "ok", courseCount: 3 });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});

describe("removed full catalog endpoints", () => {
  it("no longer serves the whole catalog", async () => {
    await request(app).get("/api/catalog").expect(404);
    await request(app).get("/catalog.json").expect(404);
  });
});

describe("CORS", () => {
  it("allows the configured origin", async () => {
    const response = await request(app)
      .get("/api/courses")
      .set("Origin", "https://timetable.example.com")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe("https://timetable.example.com");
  });
});
