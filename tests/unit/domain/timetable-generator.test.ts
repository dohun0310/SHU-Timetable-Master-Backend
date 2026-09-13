import { describe, expect, it } from "vitest";

import type { Course } from "../../../src/domain/schemas/catalog-schema.js";
import { TimetableConflictDetector } from "../../../src/domain/services/timetable-conflict-detector.js";
import {
  TimetableGenerator,
  UnschedulableCourseError,
  type TimetableBasket,
  type TimetableConstraints,
} from "../../../src/domain/services/timetable-generator.js";
import type { CourseMeeting, Weekday } from "../../../src/domain/value-objects/course-schedule.js";

const dayLabels: Record<Weekday, string> = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일",
};

// 실제 카탈로그와 같은 규칙. 1교시 09:00~09:50, 2교시 10:00~10:50 …
const startOf = (period: number) => `${String(8 + period).padStart(2, "0")}:00`;
const endOf = (period: number) => `${String(8 + period).padStart(2, "0")}:50`;

const meeting = (day: Weekday, startPeriod: number, endPeriod: number): CourseMeeting => ({
  day,
  dayLabel: dayLabels[day],
  startPeriod,
  endPeriod,
  startTime: startOf(startPeriod),
  endTime: endOf(endPeriod),
  location: null,
});

let sequence = 0;

const course = (name: string, credits: number, meetings: CourseMeeting[]): Course => {
  sequence += 1;
  return {
    id: `${name}-${sequence}`,
    academicYear: 2026,
    semester: "SECOND",
    category: "MAJOR",
    categoryLabel: "학과/전공",
    department: null,
    majors: [],
    courseCode: `C${sequence}`,
    classNumber: "001",
    name,
    professors: [],
    credits,
    hours: credits,
    schedule: {
      raw: meetings.length > 0 ? "raw" : "",
      parseStatus: meetings.length > 0 ? "PARSED" : "NO_SCHEDULE",
      meetings,
    },
    source: { tab: "학과/전공", collectedAt: "2026-07-12T00:00:00.000Z" },
  };
};

const unschedulable = (name: string): Course => ({
  ...course(name, 3, []),
  schedule: { raw: "금 8", parseStatus: "PARTIALLY_PARSED", meetings: [] },
});

const basket = (label: string, courses: Course[], required = true): TimetableBasket => ({
  label,
  required,
  courses,
});

const generator = new TimetableGenerator(new TimetableConflictDetector());

const generate = (
  baskets: TimetableBasket[],
  options: { constraints?: TimetableConstraints; limit?: number } = {},
) => generator.generate({ baskets, limit: options.limit ?? 20, constraints: options.constraints });

const namesOf = (timetable: { courses: Course[] }) =>
  timetable.courses.map((found) => found.name).sort();

describe("TimetableGenerator", () => {
  it("picks exactly one course from every required basket", () => {
    const result = generate([
      basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
      basket("알고리즘", [course("알고리즘", 3, [meeting("TUESDAY", 1, 3)])]),
    ]);

    expect(result.count).toBe(1);
    expect(result.truncated).toBe(false);
    expect(namesOf(result.timetables[0]!)).toEqual(["알고리즘", "자료구조"]);
  });

  it("builds one timetable per combination of class sections", () => {
    const result = generate([
      basket("자료구조", [
        course("자료구조", 3, [meeting("MONDAY", 1, 3)]),
        course("자료구조", 3, [meeting("MONDAY", 5, 7)]),
      ]),
      basket("알고리즘", [
        course("알고리즘", 3, [meeting("TUESDAY", 1, 3)]),
        course("알고리즘", 3, [meeting("TUESDAY", 5, 7)]),
      ]),
    ]);

    expect(result.count).toBe(4);
  });

  it("never puts two conflicting courses in one timetable", () => {
    const result = generate([
      basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
      basket("알고리즘", [
        course("알고리즘", 3, [meeting("MONDAY", 2, 4)]),
        course("알고리즘", 3, [meeting("MONDAY", 4, 6)]),
      ]),
    ]);

    expect(result.count).toBe(1);
    expect(result.timetables[0]?.courses[1]?.schedule.meetings[0]?.startPeriod).toBe(4);
  });

  it("reports no timetable when required courses always collide", () => {
    const result = generate([
      basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
      basket("알고리즘", [course("알고리즘", 3, [meeting("MONDAY", 1, 3)])]),
    ]);

    expect(result).toMatchObject({ count: 0, truncated: false, timetables: [] });
  });

  it("may leave an optional basket empty", () => {
    const result = generate([
      basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
      basket("교양", [course("교양", 2, [meeting("MONDAY", 2, 4)])], false),
    ]);

    expect(result.count).toBe(1);
    expect(namesOf(result.timetables[0]!)).toEqual(["자료구조"]);
  });

  it("prefers filling an optional basket when it fits", () => {
    const result = generate([
      basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
      basket("교양", [course("교양", 2, [meeting("TUESDAY", 1, 2)])], false),
    ]);

    expect(result.count).toBe(2);
    expect(namesOf(result.timetables[0]!)).toEqual(["교양", "자료구조"]);
    expect(namesOf(result.timetables[1]!)).toEqual(["자료구조"]);
  });

  it("keeps a course with no meetings because it never conflicts", () => {
    const result = generate([
      basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
      basket("채플", [course("채플", 1, [])]),
    ]);

    expect(result.count).toBe(1);
    expect(namesOf(result.timetables[0]!)).toEqual(["자료구조", "채플"]);
  });

  it("drops every timetable that uses a day the student wants free", () => {
    const result = generate(
      [
        basket("자료구조", [
          course("자료구조", 3, [meeting("FRIDAY", 1, 3)]),
          course("자료구조", 3, [meeting("MONDAY", 1, 3)]),
        ]),
      ],
      { constraints: { freeDays: ["FRIDAY"] } },
    );

    expect(result.count).toBe(1);
    expect(result.timetables[0]?.courses[0]?.schedule.meetings[0]?.day).toBe("MONDAY");
  });

  it("drops a timetable that starts before avoidBefore", () => {
    const result = generate(
      [
        basket("자료구조", [
          course("자료구조", 3, [meeting("MONDAY", 1, 3)]),
          course("자료구조", 3, [meeting("MONDAY", 5, 7)]),
        ]),
      ],
      { constraints: { avoidBefore: "12:00" } },
    );

    expect(result.count).toBe(1);
    expect(result.timetables[0]?.courses[0]?.schedule.meetings[0]?.startPeriod).toBe(5);
  });

  it("drops a timetable that ends after avoidAfter", () => {
    const result = generate(
      [
        basket("자료구조", [
          course("자료구조", 3, [meeting("MONDAY", 1, 3)]),
          course("자료구조", 3, [meeting("MONDAY", 8, 10)]),
        ]),
      ],
      { constraints: { avoidAfter: "13:00" } },
    );

    expect(result.count).toBe(1);
    expect(result.timetables[0]?.courses[0]?.schedule.meetings[0]?.startPeriod).toBe(1);
  });

  it("keeps a course with no meetings under a time constraint", () => {
    const result = generate([basket("채플", [course("채플", 1, [])])], {
      constraints: { avoidBefore: "23:00", freeDays: ["MONDAY"] },
    });

    expect(result.count).toBe(1);
  });

  it("keeps only timetables inside the credit range", () => {
    const result = generate(
      [
        basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
        basket("교양", [course("교양", 2, [meeting("TUESDAY", 1, 2)])], false),
      ],
      { constraints: { minCredits: 5 } },
    );

    expect(result.count).toBe(1);
    expect(result.timetables[0]?.totalCredits).toBe(5);
  });

  it("rejects a timetable above the maximum credits", () => {
    const result = generate(
      [
        basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
        basket("교양", [course("교양", 2, [meeting("TUESDAY", 1, 2)])], false),
      ],
      { constraints: { maxCredits: 3 } },
    );

    expect(result.count).toBe(1);
    expect(result.timetables[0]?.totalCredits).toBe(3);
  });

  it("reports the days used and the days left free", () => {
    const result = generate([
      basket("자료구조", [course("자료구조", 3, [meeting("MONDAY", 1, 3)])]),
      basket("알고리즘", [course("알고리즘", 3, [meeting("WEDNESDAY", 1, 3)])]),
    ]);

    expect(result.timetables[0]?.days).toEqual(["MONDAY", "WEDNESDAY"]);
    expect(result.timetables[0]?.freeDays).toEqual([
      "TUESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ]);
  });

  it("stops at the limit and says the result was cut short", () => {
    const sections = [1, 3, 5, 7, 9].map((period) =>
      course("자료구조", 3, [meeting("MONDAY", period, period)]),
    );
    const result = generate([basket("자료구조", sections)], { limit: 2 });

    expect(result.count).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("says the result was cut short when it gives up on the search itself", () => {
    // 최소 학점은 마지막에만 검사하므로, 도달할 수 없는 값을 주면 가지치기 없이 트리를 다 훑는다.
    // 탐색을 포기해 놓고 "시간표가 없다"고 단정하면 거짓말이 된다.
    const days: Weekday[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
    const baskets = Array.from({ length: 12 }, (_, basketIndex) =>
      basket(
        `과목${basketIndex}`,
        Array.from({ length: 6 }, () =>
          course(`과목${basketIndex}`, 1, [
            meeting(days[basketIndex % 5]!, basketIndex + 1, basketIndex + 1),
          ]),
        ),
      ),
    );

    const result = generate(baskets, { constraints: { minCredits: 999 } });

    expect(result.count).toBe(0);
    expect(result.truncated).toBe(true);
  });

  it("never puts the same course in one timetable twice", () => {
    // 강의시간이 없는 강좌는 자기 자신과도 겹치지 않아 충돌 검사만으로는 중복을 막지 못한다.
    const chapel = course("채플", 1, []);
    const result = generate([basket("채플", [chapel]), basket("채플 재수강", [chapel])]);

    expect(result.count).toBe(0);
  });

  it("does not claim truncation when the results exactly fill the limit", () => {
    const sections = [1, 3].map((period) =>
      course("자료구조", 3, [meeting("MONDAY", period, period)]),
    );
    const result = generate([basket("자료구조", sections)], { limit: 2 });

    expect(result.count).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("survives a combinatorial explosion by cutting the search short", { timeout: 5000 }, () => {
    // 바구니 12개 × 각 6개 분반. 바구니마다 교시가 달라 서로 충돌하지 않으므로
    // 6^12(약 20억) 조합이 전부 유효하다. 상한이 없으면 이를 다 세다가 끝나지 않는다.
    // 실행 시간을 재면 머신 부하에 흔들리므로, 상한이 걸렸다는 사실 자체를 본다.
    const days: Weekday[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
    const baskets = Array.from({ length: 12 }, (_, basketIndex) =>
      basket(
        `과목${basketIndex}`,
        Array.from({ length: 6 }, () =>
          course(`과목${basketIndex}`, 3, [
            meeting(days[basketIndex % 5]!, basketIndex + 1, basketIndex + 1),
          ]),
        ),
      ),
    );

    const result = generate(baskets, { limit: 5 });

    expect(result.count).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it("refuses a course whose schedule could not be fully parsed", () => {
    expect(() => generate([basket("드론", [unschedulable("드론프로젝트실습")])])).toThrow(
      UnschedulableCourseError,
    );
  });

  it("names the courses it refused", () => {
    try {
      generate([basket("드론", [unschedulable("드론프로젝트실습")])]);
      expect.unreachable("충돌 판정이 불가능한 강좌는 거부해야 합니다.");
    } catch (error) {
      expect(error).toBeInstanceOf(UnschedulableCourseError);
      expect((error as UnschedulableCourseError).courses[0]?.name).toBe("드론프로젝트실습");
    }
  });
});
