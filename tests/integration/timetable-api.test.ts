import request from "supertest";
import { describe, expect, it } from "vitest";

import { catalogSchema, type Course } from "../../src/domain/schemas/catalog-schema.js";
import type { CourseMeeting, Weekday } from "../../src/domain/value-objects/course-schedule.js";
import { createApp } from "../../src/server/app.js";

const dayLabels: Record<Weekday, string> = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일",
};

const meeting = (day: Weekday, startPeriod: number, endPeriod: number): CourseMeeting => ({
  day,
  dayLabel: dayLabels[day],
  startPeriod,
  endPeriod,
  startTime: `${String(8 + startPeriod).padStart(2, "0")}:00`,
  endTime: `${String(8 + endPeriod).padStart(2, "0")}:50`,
  location: null,
});

const course = (
  id: string,
  name: string,
  credits: number,
  meetings: CourseMeeting[],
  overrides: Partial<Course> = {},
): Course => ({
  id,
  academicYear: 2026,
  semester: "SECOND",
  category: "MAJOR",
  categoryLabel: "학과/전공",
  department: null,
  major: null,
  courseCode: id.toUpperCase(),
  classNumber: "001",
  name,
  professor: null,
  credits,
  hours: credits,
  schedule: {
    raw: meetings.length > 0 ? "raw" : "",
    parseStatus: meetings.length > 0 ? "PARSED" : "NO_SCHEDULE",
    meetings,
  },
  source: { tab: "학과/전공", collectedAt: "2026-07-12T00:00:00.000Z" },
  ...overrides,
});

const courses = [
  course("ds-001", "자료구조", 3, [meeting("MONDAY", 1, 3)]),
  course("ds-002", "자료구조", 3, [meeting("MONDAY", 5, 7)]),
  course("algo-001", "알고리즘", 3, [meeting("MONDAY", 2, 4)]),
  course("algo-002", "알고리즘", 3, [meeting("TUESDAY", 1, 3)]),
  course("liberal-001", "교양", 2, [meeting("FRIDAY", 1, 2)]),
  course("chapel-001", "채플", 1, []),
  course("drone-001", "드론실습", 3, [], {
    schedule: { raw: "금 8", parseStatus: "PARTIALLY_PARSED", meetings: [] },
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
  filters: { categories: [], departments: [], majors: [], professors: [], days: [] },
  courses,
});

const app = createApp({ catalog, corsOrigin: "*" });
const generate = (body: object) => request(app).post("/api/timetables/generate").send(body);

describe("POST /api/timetables/generate", () => {
  it("builds every timetable that has no conflict", async () => {
    const response = await generate({
      baskets: [
        { label: "자료구조", courseIds: ["ds-001", "ds-002"] },
        { label: "알고리즘", courseIds: ["algo-001", "algo-002"] },
      ],
    }).expect(200);

    // ds-001(월 1-3)과 algo-001(월 2-4)만 겹친다. 나머지 세 조합이 남는다.
    expect(response.body.count).toBe(3);
    expect(response.body.truncated).toBe(false);
    for (const timetable of response.body.timetables) {
      expect(timetable.courses).toHaveLength(2);
      expect(timetable.totalCredits).toBe(6);
    }
  });

  it("leaves an optional basket empty when nothing fits", async () => {
    const response = await generate({
      baskets: [
        { label: "자료구조", courseIds: ["ds-001"] },
        { label: "알고리즘", required: false, courseIds: ["algo-001"] },
      ],
    }).expect(200);

    expect(response.body.count).toBe(1);
    expect(response.body.timetables[0].courses).toHaveLength(1);
    expect(response.body.timetables[0].courses[0].id).toBe("ds-001");
  });

  it("honours a free day", async () => {
    const response = await generate({
      baskets: [{ label: "교양", courseIds: ["liberal-001"] }],
      constraints: { freeDays: ["FRIDAY"] },
    }).expect(200);

    expect(response.body.count).toBe(0);
  });

  it("honours the time window and the credit range", async () => {
    const response = await generate({
      baskets: [{ label: "자료구조", courseIds: ["ds-001", "ds-002"] }],
      constraints: { avoidBefore: "12:00", credits: { min: 3, max: 3 } },
    }).expect(200);

    expect(response.body.count).toBe(1);
    expect(response.body.timetables[0].courses[0].id).toBe("ds-002");
  });

  it("reports the days used and left free", async () => {
    const response = await generate({
      baskets: [{ label: "자료구조", courseIds: ["ds-001"] }],
    }).expect(200);

    expect(response.body.timetables[0].days).toEqual(["MONDAY"]);
    expect(response.body.timetables[0].freeDays).toContain("FRIDAY");
  });

  it("keeps a course that has no class time", async () => {
    const response = await generate({
      baskets: [
        { label: "자료구조", courseIds: ["ds-001"] },
        { label: "채플", courseIds: ["chapel-001"] },
      ],
    }).expect(200);

    expect(response.body.count).toBe(1);
    expect(response.body.timetables[0].totalCredits).toBe(4);
  });

  it("says the result was cut short when it hits the limit", async () => {
    const response = await generate({
      baskets: [
        { label: "자료구조", courseIds: ["ds-001", "ds-002"] },
        { label: "알고리즘", courseIds: ["algo-001", "algo-002"] },
      ],
      limit: 1,
    }).expect(200);

    expect(response.body.count).toBe(1);
    expect(response.body.truncated).toBe(true);
  });

  it("refuses a course whose class time is not fully known", async () => {
    const response = await generate({
      baskets: [{ label: "드론", courseIds: ["drone-001"] }],
    }).expect(400);

    expect(response.body.error.message).toContain("드론실습");
  });

  it("rejects an unknown course id", async () => {
    const response = await generate({
      baskets: [{ label: "없음", courseIds: ["no-such-course"] }],
    }).expect(400);

    expect(response.body.error.message).toContain("no-such-course");
  });

  it("rejects a body with no basket", async () => {
    await generate({ baskets: [] }).expect(400);
  });

  it("rejects a basket with no course", async () => {
    await generate({ baskets: [{ label: "빈 바구니", courseIds: [] }] }).expect(400);
  });

  it("rejects a malformed constraint", async () => {
    const response = await generate({
      baskets: [{ label: "자료구조", courseIds: ["ds-001"] }],
      constraints: { avoidBefore: "9시" },
    }).expect(400);

    expect(JSON.stringify(response.body.error)).toContain("avoidBefore");
  });

  it("rejects a limit above the maximum", async () => {
    await generate({
      baskets: [{ label: "자료구조", courseIds: ["ds-001"] }],
      limit: 101,
    }).expect(400);
  });

  it("rejects a malformed JSON body with 400 rather than 500", async () => {
    await request(app)
      .post("/api/timetables/generate")
      .set("Content-Type", "application/json")
      .send("{ this is not json }")
      .expect(400);
  });

  it("does not cache a generated timetable", async () => {
    const response = await generate({
      baskets: [{ label: "자료구조", courseIds: ["ds-001"] }],
    }).expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
