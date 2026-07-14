import { describe, expect, it } from "vitest";

import {
  SearchCourses,
  type CourseQuery,
} from "../../../src/application/use-cases/search-courses.js";
import { catalogSchema, type Course } from "../../../src/domain/schemas/catalog-schema.js";

const meeting = (
  day: Course["schedule"]["meetings"][number]["day"],
  dayLabel: string,
  startPeriod: number,
  endPeriod: number,
  startTime: string,
  endTime: string,
) => ({ day, dayLabel, startPeriod, endPeriod, startTime, endTime, location: "은혜관-2220" });

const course = (overrides: Partial<Course> = {}): Course => ({
  id: "2026-second-sw1001-001-소프트웨어학과",
  academicYear: 2026,
  semester: "SECOND",
  category: "MAJOR",
  categoryLabel: "학과/전공",
  department: { id: "소프트웨어학과", name: "소프트웨어학과" },
  majors: [{ id: "소프트웨어학과", name: "소프트웨어학과" }],
  courseCode: "SW1001",
  classNumber: "001",
  name: "자료구조",
  professors: ["홍길동"],
  credits: 3,
  hours: 3,
  schedule: {
    raw: "월 1교시 09:00-09:50",
    parseStatus: "PARSED",
    meetings: [meeting("MONDAY", "월", 1, 3, "09:00", "11:50")],
  },
  source: { tab: "학과/전공", collectedAt: "2026-07-12T00:00:00.000Z" },
  ...overrides,
});

const dataStructures002 = course({
  id: "2026-second-sw1001-002-소프트웨어학과",
  classNumber: "002",
  professors: ["김영희"],
  schedule: {
    raw: "화 5교시 13:00-13:50",
    parseStatus: "PARSED",
    meetings: [meeting("TUESDAY", "화", 5, 7, "13:00", "15:50")],
  },
});

const cyberCourse = course({
  id: "2026-second-ge61002-001-리나시타교양대학",
  category: "BASIC_LIBERAL_ARTS",
  categoryLabel: "기초교양",
  department: { id: "리나시타교양대학", name: "리나시타교양대학" },
  majors: [{ id: "리나시타교양대학", name: "리나시타교양대학" }],
  courseCode: "GE61002",
  name: "기독교의 이해",
  professors: ["강성현"],
  credits: 1,
  hours: 1,
  schedule: { raw: "", parseStatus: "NO_SCHEDULE", meetings: [] },
});

const englishConversation = course({
  id: "2026-second-ge70011-001-리나시타교양대학",
  category: "CORE_LIBERAL_ARTS",
  categoryLabel: "핵심교양",
  department: { id: "리나시타교양대학", name: "리나시타교양대학" },
  majors: [{ id: "리나시타교양대학", name: "리나시타교양대학" }],
  courseCode: "GE70011",
  name: "영어회화",
  professors: ["John Kim"],
  credits: 2,
  hours: 2,
  schedule: {
    raw: "월 7교시 15:00-15:50",
    parseStatus: "PARSED",
    meetings: [meeting("MONDAY", "월", 7, 8, "15:00", "16:50")],
  },
});

const courses = [course(), dataStructures002, cyberCourse, englishConversation];

const catalogOf = (of: Course[]) =>
  catalogSchema.parse({
    meta: {
      academicYear: 2026,
      semester: "SECOND",
      generatedAt: "2026-07-12T00:00:00.000Z",
      source: "https://example.com/sap",
      courseCount: of.length,
    },
    filters: { categories: [], departments: [], majors: [], professors: [], days: [] },
    courses: of,
  });

const catalog = catalogOf(courses);

const search = new SearchCourses(catalog);
const query = (overrides: Partial<CourseQuery> = {}): CourseQuery => ({
  page: 1,
  size: 20,
  sort: "name",
  ...overrides,
});

const namesOf = (result: { courses: Course[] }) => result.courses.map((found) => found.name);
const idsOf = (result: { courses: Course[] }) => result.courses.map((found) => found.id);

describe("SearchCourses", () => {
  it("returns every course when no filter is given", () => {
    const result = search.execute(query());

    expect(result.total).toBe(4);
    expect(result.courses).toHaveLength(4);
  });

  it("matches a keyword against the course name", () => {
    expect(namesOf(search.execute(query({ keyword: "자료" })))).toEqual(["자료구조", "자료구조"]);
  });

  it("matches a keyword against the course code and the professor", () => {
    expect(namesOf(search.execute(query({ keyword: "ge70011" })))).toEqual(["영어회화"]);
    expect(namesOf(search.execute(query({ keyword: "김영희" })))).toEqual(["자료구조"]);
  });

  it("ignores spaces and letter case in a keyword", () => {
    expect(namesOf(search.execute(query({ keyword: "  john kim " })))).toEqual(["영어회화"]);
  });

  it("filters by category", () => {
    expect(namesOf(search.execute(query({ categories: ["CORE_LIBERAL_ARTS"] })))).toEqual([
      "영어회화",
    ]);
  });

  it("treats multiple values of one filter as OR", () => {
    expect(
      namesOf(search.execute(query({ categories: ["CORE_LIBERAL_ARTS", "BASIC_LIBERAL_ARTS"] }))),
    ).toEqual(["기독교의 이해", "영어회화"]);
  });

  it("treats different filters as AND", () => {
    const result = search.execute(
      query({ categories: ["MAJOR"], departmentIds: ["리나시타교양대학"] }),
    );

    expect(result.total).toBe(0);
  });

  it("filters by department and professor", () => {
    expect(namesOf(search.execute(query({ departmentIds: ["소프트웨어학과"] })))).toHaveLength(2);
    expect(namesOf(search.execute(query({ professors: ["홍길동"] })))).toEqual(["자료구조"]);
  });

  it("keeps a course that meets on any requested day", () => {
    expect(idsOf(search.execute(query({ days: ["TUESDAY"] })))).toEqual([
      "2026-second-sw1001-002-소프트웨어학과",
    ]);
    expect(namesOf(search.execute(query({ days: ["MONDAY"] })))).toEqual(["영어회화", "자료구조"]);
  });

  it("excludes a course without meetings from a day filter", () => {
    expect(namesOf(search.execute(query({ days: ["MONDAY", "TUESDAY"] })))).not.toContain(
      "기독교의 이해",
    );
  });

  it("keeps only courses whose every meeting starts at or after startAfter", () => {
    expect(namesOf(search.execute(query({ startAfter: "13:00" })))).toEqual([
      "기독교의 이해",
      "영어회화",
      "자료구조",
    ]);
  });

  it("keeps only courses whose every meeting ends at or before endBefore", () => {
    expect(namesOf(search.execute(query({ endBefore: "12:00" })))).toEqual([
      "기독교의 이해",
      "자료구조",
    ]);
  });

  it("keeps a course without meetings under a time filter because it never conflicts", () => {
    expect(namesOf(search.execute(query({ startAfter: "23:00" })))).toEqual(["기독교의 이해"]);
  });

  it("filters by credit range inclusively", () => {
    expect(namesOf(search.execute(query({ minCredits: 2, maxCredits: 2 })))).toEqual(["영어회화"]);
    expect(search.execute(query({ minCredits: 3 })).total).toBe(2);
  });

  it("sorts by name and breaks ties by id so pages stay stable", () => {
    expect(idsOf(search.execute(query({ keyword: "자료구조" })))).toEqual([
      "2026-second-sw1001-001-소프트웨어학과",
      "2026-second-sw1001-002-소프트웨어학과",
    ]);
  });

  it("sorts by credits", () => {
    expect(namesOf(search.execute(query({ sort: "credits" })))).toEqual([
      "기독교의 이해",
      "영어회화",
      "자료구조",
      "자료구조",
    ]);
  });

  it("paginates and reports the total across all pages", () => {
    const first = search.execute(query({ size: 3, page: 1 }));
    const second = search.execute(query({ size: 3, page: 2 }));

    expect(first).toMatchObject({ page: 1, size: 3, total: 4, totalPages: 2 });
    expect(first.courses).toHaveLength(3);
    expect(second.courses).toHaveLength(1);
    expect(idsOf(first)).not.toContain(idsOf(second)[0]);
  });

  it("returns an empty page beyond the last page", () => {
    const result = search.execute(query({ size: 3, page: 9 }));

    expect(result.courses).toEqual([]);
    expect(result).toMatchObject({ total: 4, totalPages: 2 });
  });

  it("reports one total page when nothing matches", () => {
    expect(search.execute(query({ keyword: "없는강좌" }))).toMatchObject({
      total: 0,
      totalPages: 0,
      courses: [],
    });
  });

  it("finds a course by id", () => {
    expect(search.findById("2026-second-ge70011-001-리나시타교양대학")?.name).toBe("영어회화");
    expect(search.findById("없는-id")).toBeUndefined();
  });
});
