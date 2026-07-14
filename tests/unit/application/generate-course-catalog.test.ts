import { describe, expect, it } from "vitest";

import { GenerateCourseCatalog } from "../../../src/application/use-cases/generate-course-catalog.js";
import { DefaultCourseIdGenerator } from "../../../src/domain/services/course-id-generator.js";
import { KoreanPeriodScheduleParser } from "../../../src/domain/services/schedule-parser.js";
import type { RawCourse } from "../../../src/application/ports/course-source.js";

const rawCourse = (overrides: Partial<RawCourse> = {}): RawCourse => ({
  category: "MAJOR",
  tab: "학과/전공",
  lectureType: "",
  passFail: false,
  courseCode: "SW1001",
  professors: ["홍길동"],
  majorNames: ["소프트웨어학과"],
  classTime: "월 1교시 09:00-09:50 (은혜관-2220-강의실)월 2교시 10:00-10:50 (은혜관-2220-강의실)",
  requirement: "전필",
  courseName: "소프트웨어개론",
  departmentName: "소프트웨어학과",
  capacity: 30,
  classNumber: "001",
  credits: 3,
  theoryHours: 3,
  practiceHours: 0,
  hours: 3,
  ...overrides,
});

describe("GenerateCourseCatalog", () => {
  it("maps raw courses and creates all filter groups", () => {
    const catalog = new GenerateCourseCatalog({
      idGenerator: new DefaultCourseIdGenerator(),
      scheduleParser: new KoreanPeriodScheduleParser(),
      now: () => new Date("2026-07-12T00:00:00.000Z"),
    }).execute({
      academicYear: 2026,
      semester: "SECOND",
      sourceUrl: "https://example.com/sap",
      rawCourses: [rawCourse(), rawCourse({ courseCode: "SW1002", classNumber: "002" })],
    });

    expect(catalog.meta).toMatchObject({ courseCount: 2, generatedAt: "2026-07-12T00:00:00.000Z" });
    expect(catalog.courses[0]).toMatchObject({
      id: "2026-second-sw1001-001-소프트웨어학과",
      categoryLabel: "학과/전공",
      schedule: { parseStatus: "PARSED" },
    });
    expect(catalog.filters.categories).toEqual([{ id: "MAJOR", label: "학과/전공", count: 2 }]);
    expect(catalog.filters.departments).toEqual([
      { id: "소프트웨어학과", label: "소프트웨어학과", count: 2 },
    ]);
    expect(catalog.filters.professors).toEqual([{ id: "홍길동", label: "홍길동", count: 2 }]);
    expect(catalog.filters.days).toEqual([{ id: "MONDAY", label: "월", count: 2 }]);
  });

  it("counts a day once per course even when the course meets twice that day", () => {
    const catalog = new GenerateCourseCatalog({
      idGenerator: new DefaultCourseIdGenerator(),
      scheduleParser: new KoreanPeriodScheduleParser(),
    }).execute({
      academicYear: 2026,
      semester: "SECOND",
      sourceUrl: "https://example.com/sap",
      rawCourses: [
        rawCourse({
          classTime:
            "월 1교시 09:00-09:50 (은혜관-2220-강의실)월 1교시 09:00-09:50 (기도관-1250-실습실)",
        }),
      ],
    });

    expect(catalog.courses[0]?.schedule.meetings).toHaveLength(2);
    expect(catalog.filters.days).toEqual([{ id: "MONDAY", label: "월", count: 1 }]);
  });

  it("rejects duplicate generated course IDs", () => {
    const generator = new GenerateCourseCatalog({
      idGenerator: new DefaultCourseIdGenerator(),
      scheduleParser: new KoreanPeriodScheduleParser(),
    });
    expect(() =>
      generator.execute({
        academicYear: 2026,
        semester: "SECOND",
        sourceUrl: "https://example.com/sap",
        rawCourses: [rawCourse(), rawCourse()],
      }),
    ).toThrow("강좌 ID는 중복될 수 없습니다");
  });
});
