import { describe, expect, it } from "vitest";

import { catalogSchema } from "../../../src/domain/schemas/catalog-schema.js";

const course = {
  id: "2026-second-cse101-01-computer-engineering",
  academicYear: 2026,
  semester: "SECOND",
  category: "MAJOR",
  categoryLabel: "전공",
  department: { id: "computer-engineering", name: "컴퓨터공학과" },
  majors: [],
  courseCode: "CSE101",
  classNumber: "01",
  name: "프로그래밍기초",
  professors: ["홍길동"],
  credits: 3,
  hours: 3,
  schedule: {
    raw: "월 1-2",
    parseStatus: "PARSED",
    meetings: [
      {
        day: "MONDAY",
        dayLabel: "월",
        startPeriod: 1,
        endPeriod: 2,
        startTime: null,
        endTime: null,
        location: null,
      },
    ],
  },
  source: { tab: "학과별", collectedAt: "2026-07-11T00:00:00.000Z" },
};

const catalog = {
  meta: {
    academicYear: 2026,
    semester: "SECOND",
    generatedAt: "2026-07-11T00:00:00.000Z",
    source: "https://stins.shinhan.ac.kr/",
    courseCount: 1,
  },
  filters: {
    categories: [{ id: "MAJOR", label: "전공", count: 1 }],
    departments: [{ id: "computer-engineering", label: "컴퓨터공학과", count: 1 }],
    majors: [],
    professors: [{ id: "홍길동", label: "홍길동", count: 1 }],
    days: [{ id: "MONDAY", label: "월", count: 1 }],
  },
  courses: [course],
};

describe("catalogSchema", () => {
  it("accepts a frontend-friendly course catalog", () => {
    expect(catalogSchema.parse(catalog)).toEqual(catalog);
  });

  it("rejects duplicate course identifiers", () => {
    const result = catalogSchema.safeParse({
      ...catalog,
      meta: { ...catalog.meta, courseCount: 2 },
      courses: [course, course],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("강좌 ID는 중복될 수 없습니다.");
    }
  });

  it("rejects a courseCount that differs from courses length", () => {
    expect(
      catalogSchema.safeParse({
        ...catalog,
        meta: { ...catalog.meta, courseCount: 2 },
      }).success,
    ).toBe(false);
  });
});
