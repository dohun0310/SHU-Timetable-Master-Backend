import { describe, expect, it } from "vitest";

import { TimetableConflictDetector } from "../../../src/domain/services/timetable-conflict-detector.js";
import type { CourseMeeting } from "../../../src/domain/value-objects/course-schedule.js";

const meeting = (
  day: CourseMeeting["day"],
  startPeriod: number,
  endPeriod: number,
): CourseMeeting => ({
  day,
  dayLabel: "월",
  startPeriod,
  endPeriod,
  startTime: null,
  endTime: null,
  location: null,
});

const detector = new TimetableConflictDetector();

describe("TimetableConflictDetector", () => {
  it("finds a conflict when two courses overlap on the same day", () => {
    expect(detector.conflicts([meeting("MONDAY", 1, 3)], [meeting("MONDAY", 2, 4)])).toBe(true);
  });

  it("finds a conflict when one period range contains the other", () => {
    expect(detector.conflicts([meeting("MONDAY", 1, 6)], [meeting("MONDAY", 3, 4)])).toBe(true);
  });

  it("finds a conflict when two courses occupy the very same periods", () => {
    expect(detector.conflicts([meeting("MONDAY", 2, 3)], [meeting("MONDAY", 2, 3)])).toBe(true);
  });

  it("allows back to back periods on the same day", () => {
    expect(detector.conflicts([meeting("MONDAY", 1, 2)], [meeting("MONDAY", 3, 4)])).toBe(false);
  });

  it("allows the same periods on different days", () => {
    expect(detector.conflicts([meeting("MONDAY", 1, 3)], [meeting("TUESDAY", 1, 3)])).toBe(false);
  });

  it("never conflicts with a course that has no meetings", () => {
    expect(detector.conflicts([], [meeting("MONDAY", 1, 3)])).toBe(false);
    expect(detector.conflicts([meeting("MONDAY", 1, 3)], [])).toBe(false);
    expect(detector.conflicts([], [])).toBe(false);
  });

  it("finds a conflict when only one of several meetings overlaps", () => {
    expect(
      detector.conflicts(
        [meeting("MONDAY", 1, 2), meeting("THURSDAY", 5, 6)],
        [meeting("WEDNESDAY", 1, 2), meeting("THURSDAY", 6, 7)],
      ),
    ).toBe(true);
  });

  it("does not conflict when a course meets twice in the same slot in two rooms", () => {
    // 같은 교시를 강의실 두 곳에서 쓰는 강좌가 실재한다. 자기 자신과 겹치는 것은 충돌이 아니다.
    const twoRooms = [meeting("MONDAY", 1, 3), meeting("MONDAY", 1, 3)];

    expect(detector.conflicts(twoRooms, [meeting("TUESDAY", 1, 3)])).toBe(false);
  });
});
